import { CbtTestMeta, TestAttempt } from '../types';
import { ensurePersistent5GBVaultQuota, getAllVaultHtmlIds } from './permanentTestVault';
import { isUsingStaticStore } from '../firebase';

export const OFFLINE_PAPERS_CACHE_NAME = 'vs-test-papers-offline-v1';
const OFFLINE_ATTEMPT_QUEUE_KEY = 'vs_neet_offline_attempt_queue_v1';
const OFFLINE_UNAVAILABLE_IDS_KEY = 'vs_neet_offline_unavailable_ids_v1';

export interface QueuedOfflineAttempt {
  attempt: Omit<TestAttempt, 'id'> & { id?: string };
  prevHighScore: number;
  queuedAt: number;
}

export interface OfflineBatchProgress {
  active: boolean;
  done: number;
  total: number;
  cachedCount: number;
  currentTitle: string;
}

function getSafeTestId(testId: string): string {
  return String(testId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 100);
}

function getCanonicalPaperPath(testId: string): string {
  const safeId = getSafeTestId(testId);
  if (isUsingStaticStore()) {
    return `/static-store/paper/${encodeURIComponent(safeId)}.html`;
  }
  return `/api/store/test/${encodeURIComponent(safeId)}/paper.html`;
}

function getCanonicalMetaPath(testId: string): string {
  const safeId = getSafeTestId(testId);
  if (isUsingStaticStore()) {
    return `/static-store/test/${encodeURIComponent(safeId)}.json`;
  }
  return `/api/store/test/${encodeURIComponent(safeId)}?skipHtml=1`;
}

function getUnavailableCacheSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(OFFLINE_UNAVAILABLE_IDS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function markTestUnavailableThisSession(testId: string): void {
  try {
    const set = getUnavailableCacheSet();
    set.add(getSafeTestId(testId));
    sessionStorage.setItem(OFFLINE_UNAVAILABLE_IDS_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // ignore
  }
}

/**
 * Reads a cached test HTML directly from Service Worker Cache Storage as a zero-network fallback.
 */
export async function readCachedTestHtmlFromSwCache(testId: string): Promise<string> {
  if (typeof window === 'undefined' || !('caches' in window) || !testId) return '';
  const safeId = getSafeTestId(testId);
  const candidates = [
    `/api/store/test/${encodeURIComponent(safeId)}/paper.html`,
    `/static-store/paper/${encodeURIComponent(safeId)}.html`,
  ];
  try {
    const cache = await caches.open(OFFLINE_PAPERS_CACHE_NAME);
    for (const path of candidates) {
      const fullUrl = window.location.origin + path;
      const match =
        (await cache.match(fullUrl)) ||
        (await cache.match(path)) ||
        (await cache.match(fullUrl, { ignoreSearch: true }));
      if (match && match.ok) {
        const text = await match.text();
        if (text && text.trim().length > 200 && !text.includes('VS_CBT_HTML_NOT_FOUND')) {
          return text;
        }
      }
    }
  } catch {
    // ignore
  }
  return '';
}

/**
 * Returns the Set of test IDs that are currently cached and playable 100% offline
 * (combining Service Worker Cache Storage + IndexedDB Permanent Vault + Built-in Prayas 06).
 */
export async function getCachedOfflineTestIds(tests: CbtTestMeta[]): Promise<Set<string>> {
  const ready = new Set<string>();
  const validTests = Array.isArray(tests) ? tests : [];

  // 1. Check IndexedDB Vault
  try {
    const vaultIds = await getAllVaultHtmlIds();
    vaultIds.forEach((id) => ready.add(id));
  } catch {
    // ignore
  }

  // 2. Check Service Worker Cache Storage
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open(OFFLINE_PAPERS_CACHE_NAME);
      const keys = await cache.keys();
      const cachedPaths = new Set<string>();
      for (const req of keys) {
        try {
          const u = new URL(req.url);
          cachedPaths.add(u.pathname);
        } catch {
          // ignore
        }
      }

      const appCache = await caches.open('vs-test-app-v14');
      const prayasCached = Boolean(
        (await appCache.match('/assets/aistudio/Vs_PRAYAS_Minor_Test_06__02_11_2026__NEET_CBT_Test_e42702d3.html')) ||
          (await caches.match('/assets/aistudio/Vs_PRAYAS_Minor_Test_06__02_11_2026__NEET_CBT_Test_e42702d3.html')) ||
          (await cache.match('/api/store/test/prayas_06/paper.html'))
      );
      if (prayasCached) {
        ready.add('prayas_06');
      }

      for (const t of validTests) {
        if (!t || !t.id) continue;
        const safeId = getSafeTestId(t.id);
        if (t.isPdfOnly) {
          const pdfPath = t.attachmentPdfId
            ? `/api/store/pdf/${encodeURIComponent(t.attachmentPdfId)}`
            : `/api/store/test/${encodeURIComponent(safeId)}/syllabus.pdf`;
          if (cachedPaths.has(pdfPath)) {
            ready.add(t.id);
          }
          continue;
        }
        if (
          cachedPaths.has(`/api/store/test/${encodeURIComponent(safeId)}/paper.html`) ||
          cachedPaths.has(`/static-store/paper/${encodeURIComponent(safeId)}.html`) ||
          cachedPaths.has(`/api/store/test/${safeId}/paper.html`) ||
          cachedPaths.has(`/static-store/paper/${safeId}.html`)
        ) {
          ready.add(t.id);
        }
      }
    } catch {
      // ignore
    }
  }

  return ready;
}

/**
 * Downloads a single test (complete self-contained HTML + any remaining /qimg images + compact JSON for Analyze mode + syllabus PDF if any)
 * directly into persistent Service Worker Cache Storage so it works 100% offline.
 */
export async function downloadSingleTestOffline(
  test: CbtTestMeta,
  opts?: { forceRefresh?: boolean; signal?: AbortSignal }
): Promise<{ ok: boolean; cached: boolean; skippedUnavailable?: boolean }> {
  if (typeof window === 'undefined' || !('caches' in window) || !test || !test.id) {
    return { ok: false, cached: false };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, cached: false };
  }

  const safeId = getSafeTestId(test.id);
  const unavailableSet = getUnavailableCacheSet();
  if (!opts?.forceRefresh && unavailableSet.has(safeId)) {
    return { ok: false, cached: false, skippedUnavailable: true };
  }

  void ensurePersistent5GBVaultQuota();

  try {
    const cache = await caches.open(OFFLINE_PAPERS_CACHE_NAME);

    // Handle PDF-only test cards
    if (test.isPdfOnly) {
      const pdfUrl = test.attachmentPdfId
        ? `/api/store/pdf/${encodeURIComponent(test.attachmentPdfId)}`
        : `/api/store/test/${encodeURIComponent(safeId)}/syllabus.pdf`;
      const existingPdf = !opts?.forceRefresh ? await cache.match(window.location.origin + pdfUrl) : undefined;
      if (existingPdf) return { ok: true, cached: true };
      const res = await fetch(pdfUrl, { signal: opts?.signal });
      if (res.ok) {
        await cache.put(window.location.origin + pdfUrl, res.clone());
        return { ok: true, cached: true };
      }
      return { ok: false, cached: false };
    }

    const canonicalPaperPath = getCanonicalPaperPath(test.id);
    const canonicalPaperFullUrl = window.location.origin + canonicalPaperPath;
    const versionTag = Number((test as { updatedAt?: number }).updatedAt || test.createdAt || 1);
    const versionedPaperUrl = `${canonicalPaperFullUrl}?v=${versionTag}`;

    // Skip network if already cached with offline inline marker (unless forceRefresh)
    if (!opts?.forceRefresh) {
      const existing = await cache.match(canonicalPaperFullUrl);
      if (existing && existing.ok && existing.headers.get('X-VS-Offline-Inline') === '1') {
        return { ok: true, cached: true };
      }
    }

    // Fetch 100% self-contained offline paper (?offline=1 embeds ALL Q1..Q180 images inline on Express!)
    const fetchUrl = isUsingStaticStore()
      ? `${canonicalPaperPath}?v=${versionTag}`
      : `${canonicalPaperPath}?offline=1&v=${versionTag}`;

    let paperRes = await fetch(fetchUrl, { signal: opts?.signal });

    // Fallback to static-store paper if Express endpoint returned 404
    if ((!paperRes.ok || paperRes.status === 404) && !isUsingStaticStore()) {
      const staticRes = await fetch(`/static-store/paper/${encodeURIComponent(safeId)}.html?v=${versionTag}`, {
        signal: opts?.signal,
      }).catch(() => null);
      if (staticRes && staticRes.ok) {
        paperRes = staticRes;
      }
    }

    if (!paperRes.ok) {
      if (paperRes.status === 404) {
        markTestUnavailableThisSession(test.id);
        return { ok: false, cached: false, skippedUnavailable: true };
      }
      return { ok: false, cached: false };
    }

    const htmlText = await paperRes.text();
    if (!htmlText || htmlText.trim().length < 250 || htmlText.includes('VS_CBT_HTML_NOT_FOUND')) {
      markTestUnavailableThisSession(test.id);
      return { ok: false, cached: false, skippedUnavailable: true };
    }

    // Store with explicit X-VS-Offline-Inline header so SW serves it in 0ms offline & never overwrites it with a stripped version
    const storedHeaders = new Headers({
      'Content-Type': 'text/html; charset=utf-8',
      'X-VS-Offline-Inline': '1',
      'X-VS-Offline-Cached-At': String(Date.now()),
    });
    const makeStoredResponse = () => new Response(htmlText, { status: 200, headers: storedHeaders });

    await cache.put(canonicalPaperFullUrl, makeStoredResponse());
    await cache.put(versionedPaperUrl, makeStoredResponse());

    // Safety net for static-store or custom papers: if any /qimg/ image URLs remain inside the HTML, cache them too!
    const qimgMatches = Array.from(
      new Set(
        htmlText.match(/\/(?:api\/store\/test|static-store)\/[^"'<>\\\s]+\/qimg\/[^"'<>\\\s]+/g) || []
      )
    );
    if (qimgMatches.length > 0) {
      const BATCH = 6;
      for (let i = 0; i < qimgMatches.length; i += BATCH) {
        if (opts?.signal?.aborted) break;
        const slice = qimgMatches.slice(i, i + BATCH);
        await Promise.allSettled(
          slice.map(async (imgPath) => {
            const imgFullUrl = window.location.origin + imgPath;
            const already = await cache.match(imgFullUrl);
            if (already) return;
            const imgRes = await fetch(imgPath, { signal: opts?.signal });
            if (imgRes.ok) {
              await cache.put(imgFullUrl, imgRes);
            }
          })
        );
      }
    }

    // Also cache compact JSON metadata/questions (<30KB) so Post-Submission Analyze & Solutions works 100% offline!
    const metaPath = getCanonicalMetaPath(test.id);
    const metaFullUrl = window.location.origin + metaPath;
    try {
      const metaRes = await fetch(metaPath, { signal: opts?.signal });
      if (metaRes.ok && (metaRes.headers.get('content-type') || '').toLowerCase().includes('json')) {
        await cache.put(metaFullUrl, metaRes.clone());
      }
    } catch {
      // non-fatal
    }

    // Also cache attached syllabus PDF if present on the test
    if (test.attachmentPdfId) {
      const pdfFullUrl = `${window.location.origin}/api/store/pdf/${encodeURIComponent(test.attachmentPdfId)}`;
      try {
        const alreadyPdf = await cache.match(pdfFullUrl);
        if (!alreadyPdf) {
          const pdfRes = await fetch(pdfFullUrl, { signal: opts?.signal });
          if (pdfRes.ok) await cache.put(pdfFullUrl, pdfRes);
        }
      } catch {
        // non-fatal
      }
    }

    return { ok: true, cached: true };
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      return { ok: false, cached: false };
    }
    return { ok: false, cached: false };
  }
}

/**
 * Downloads a list of tests sequentially for Offline Mode with pause/abort support and live progress reporting.
 */
export async function downloadTestsBatchOffline(
  tests: CbtTestMeta[],
  opts: {
    signal?: AbortSignal;
    delayMsBetweenTests?: number;
    alreadyCachedIds?: Set<string>;
    onProgress?: (progress: OfflineBatchProgress, updatedCachedIds: Set<string>) => void;
  }
): Promise<{ newlyCached: number; totalCached: number; skippedUnavailable: number }> {
  const validTests = (Array.isArray(tests) ? tests : []).filter((t) => Boolean(t && t.id));
  const cachedIds = new Set<string>(
    opts.alreadyCachedIds ? Array.from(opts.alreadyCachedIds) : Array.from(await getCachedOfflineTestIds(validTests))
  );

  // Also ensure portal bootstrap snapshot is freshly cached
  try {
    if (navigator.onLine) {
      const bootUrl = isUsingStaticStore() ? '/static-store/bootstrap.json' : '/api/store/bootstrap';
      await fetch(bootUrl, { signal: opts.signal }).catch(() => {});
    }
  } catch {
    // ignore
  }

  let newlyCached = 0;
  let skippedUnavailable = 0;
  const total = validTests.length;

  for (let i = 0; i < validTests.length; i++) {
    if (opts.signal?.aborted) break;
    if (typeof navigator !== 'undefined' && !navigator.onLine) break;

    const test = validTests[i];
    if (cachedIds.has(test.id)) {
      opts.onProgress?.(
        {
          active: true,
          done: i + 1,
          total,
          cachedCount: cachedIds.size,
          currentTitle: test.title,
        },
        new Set(cachedIds)
      );
      continue;
    }

    opts.onProgress?.(
      {
        active: true,
        done: i,
        total,
        cachedCount: cachedIds.size,
        currentTitle: test.title,
      },
      new Set(cachedIds)
    );

    const res = await downloadSingleTestOffline(test, { signal: opts.signal });
    if (res.cached) {
      cachedIds.add(test.id);
      newlyCached++;
    } else if (res.skippedUnavailable) {
      skippedUnavailable++;
    }

    opts.onProgress?.(
      {
        active: true,
        done: i + 1,
        total,
        cachedCount: cachedIds.size,
        currentTitle: test.title,
      },
      new Set(cachedIds)
    );

    if (opts.delayMsBetweenTests && i < validTests.length - 1 && !opts.signal?.aborted) {
      await new Promise((r) => window.setTimeout(r, opts.delayMsBetweenTests));
    }
  }

  opts.onProgress?.(
    {
      active: false,
      done: total,
      total,
      cachedCount: cachedIds.size,
      currentTitle: '',
    },
    new Set(cachedIds)
  );

  return { newlyCached, totalCached: cachedIds.size, skippedUnavailable };
}

/**
 * Offline Attempt Queue — stores completed test results when offline and auto-syncs once back online!
 */
export function getQueuedOfflineAttempts(): QueuedOfflineAttempt[] {
  try {
    const raw = localStorage.getItem(OFFLINE_ATTEMPT_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedOfflineAttempt[]) : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineAttempt(
  attempt: Omit<TestAttempt, 'id'> & { id?: string },
  prevHighScore: number
): number {
  const existing = getQueuedOfflineAttempts();
  const deduped = existing.filter(
    (item) =>
      !(
        item.attempt.testId === attempt.testId &&
        item.attempt.completedAt === attempt.completedAt &&
        item.attempt.studentId === attempt.studentId
      )
  );
  const next: QueuedOfflineAttempt[] = [
    ...deduped,
    {
      attempt,
      prevHighScore: Number(prevHighScore) || 0,
      queuedAt: Date.now(),
    },
  ].slice(-100);
  try {
    localStorage.setItem(OFFLINE_ATTEMPT_QUEUE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota error
  }
  return next.length;
}

export async function flushOfflineAttemptQueue(
  uploadAttempt: (
    attempt: Omit<TestAttempt, 'id'> & { id?: string },
    prevHighScore: number
  ) => Promise<void>
): Promise<{ synced: number; remaining: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const q = getQueuedOfflineAttempts();
    return { synced: 0, remaining: q.length };
  }

  const queue = getQueuedOfflineAttempts();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  const remaining: QueuedOfflineAttempt[] = [];
  let synced = 0;

  for (const item of queue) {
    try {
      await uploadAttempt(item.attempt, item.prevHighScore);
      synced++;
    } catch {
      remaining.push(item);
    }
  }

  try {
    if (remaining.length === 0) {
      localStorage.removeItem(OFFLINE_ATTEMPT_QUEUE_KEY);
    } else {
      localStorage.setItem(OFFLINE_ATTEMPT_QUEUE_KEY, JSON.stringify(remaining));
    }
  } catch {
    // ignore
  }

  return { synced, remaining: remaining.length };
}
