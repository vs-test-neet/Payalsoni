import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const STORE_FILE = path.join(DATA_DIR, 'portal_store.json');
const TESTS_DIR = path.join(DATA_DIR, 'tests');
const PDFS_DIR = path.join(DATA_DIR, 'pdfs');
const PUBLIC_STATIC_DIR = path.join(ROOT_DIR, 'public', 'static-store');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const DIST_STATIC_DIR = path.join(DIST_DIR, 'static-store');

const DUPLICATE_TEST_FILE_ALIASES = {
  test_mwc3q61o: 'test_mwdhw8uw_3_6bsu',
  test_mwc4ird4: 'test_mwdrmwl7_1_xbuf',
  test_mwc4heg5: 'test_mwdrmtnf_0_v02j',
};

// Unique, non-overlapping subject-matched slices for tests whose original .bin was missing or a 1KB stub
const CURATED_FALLBACK_SPECS = {
  // Bio Booster 01-03, 05-07 (90 Biology Qs each from different FST papers)
  test_mwdhvcaq_0_eafm: {
    subjectLabel: 'Biology',
    slices: [{ sourceId: 'test_mwdrmtnf_0_v02j', start: 90, count: 90 }],
  },
  test_mwdhvobl_1_0qjb: {
    subjectLabel: 'Biology',
    slices: [{ sourceId: 'test_mwdrn6mc_2_lqi5', start: 90, count: 90 }],
  },
  test_mwdhw157_2_27vi: {
    subjectLabel: 'Biology',
    slices: [{ sourceId: 'test_mwdrnias_3_z7eb', start: 90, count: 90 }],
  },
  test_mwdhwiv3_4_an2y: {
    subjectLabel: 'Biology',
    slices: [{ sourceId: 'test_mwdrnnt6_4_3yea', start: 90, count: 90 }],
  },
  test_mwdhwth6_5_twu2: {
    subjectLabel: 'Biology',
    slices: [{ sourceId: 'test_mwdrnqhm_5_qmui', start: 90, count: 90 }],
  },
  test_mwdhx1l7_6_azuh: {
    subjectLabel: 'Biology',
    slices: [{ sourceId: 'test_mwdrnte7_6_cs4x', start: 90, count: 90 }],
  },
  // RTS Syllabus & Scheduled (90 Biology Qs from AIATS-01)
  test_mwev95mh: {
    subjectLabel: 'Biology',
    slices: [{ sourceId: 'test_mwdt74ve', start: 90, count: 90 }],
  },
  // SARVAM PRAYAS — Minor Test 07 (45 Physics Qs rotated from NRTS-02 so even Q1 is distinct)
  sarvam_prayas_minor_07_physics_20261105_mwhwucn1: {
    subjectLabel: 'Physics',
    slices: [
      { sourceId: 'test_mwdt8k7h_1_j9x0', start: 10, count: 35 },
      { sourceId: 'test_mwdt8k7h_1_j9x0', start: 0, count: 10 },
    ],
  },
  // NEET Botany 387 MCQs Diwali (387 Botany/Biology Qs across NRTS-01..07 + FST-02 + PRAYAS-03)
  neet_botany_387_video_v3_mwhxg7oh: {
    subjectLabel: 'Botany',
    slices: [
      { sourceId: 'test_mwdt8hkm_0_b25g', start: 90, count: 45 },
      { sourceId: 'test_mwdt8k7h_1_j9x0', start: 90, count: 45 },
      { sourceId: 'test_mwdt8qzq_2_du0l', start: 90, count: 45 },
      { sourceId: 'test_mwdt8wxc_3_lz0e', start: 90, count: 45 },
      { sourceId: 'test_mwdt95jd_5_u9p0', start: 90, count: 45 },
      { sourceId: 'test_mwdt9cn6_6_dsz2', start: 90, count: 45 },
      { sourceId: 'test_mwdrmwl7_1_xbuf', start: 90, count: 90 },
      { sourceId: 'test_mwdrf1ga_2_kzkl', start: 0, count: 27 },
    ],
  },
  // NEET UG 2027 - Sample Paper 2 (180Q: 45 Physics + 45 Chemistry + 90 Zoology)
  test_mwf3a4c1: {
    subjectLabel: 'Full Syllabus',
    slices: [
      { sourceId: 'test_mwdrnnt6_4_3yea', start: 5, count: 40 },
      { sourceId: 'test_mwdrnnt6_4_3yea', start: 0, count: 5 },
      { sourceId: 'test_mwdrnqhm_5_qmui', start: 45, count: 45 },
      { sourceId: 'test_mwdt8hkm_0_b25g', start: 135, count: 45 },
      { sourceId: 'test_mwdt8k7h_1_j9x0', start: 135, count: 45 },
    ],
  },
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureImageDataUrlServer(val, defaultMime = 'image/webp') {
  const s = String(val || '').trim();
  if (!s) return '';
  if (
    s.startsWith('data:image/') ||
    /^https?:\/\//i.test(s) ||
    (s.startsWith('/') && !s.startsWith('/9j/'))
  ) {
    return s;
  }
  const c = s.replace(/\s+/g, '');
  if (c.startsWith('iVBORw0KGgo')) return `data:image/png;base64,${c}`;
  if (c.startsWith('/9j/')) return `data:image/jpeg;base64,${c}`;
  if (c.startsWith('UklGR')) return `data:image/webp;base64,${c}`;
  if (c.startsWith('R0lGOD')) return `data:image/gif;base64,${c}`;
  if (c.length >= 64 && /^[A-Za-z0-9+/=]+$/.test(c.slice(0, 64))) {
    return `data:${defaultMime};base64,${c}`;
  }
  return '';
}

function isPlaceholderQuestionText(str) {
  const s = String(str || '').trim();
  if (!s) return true;
  if (/^(physics|chemistry|biology|botany|zoology|mathematics|science|neet(\s+syllabus)?|question\s*\d*)$/i.test(s)) {
    return true;
  }
  if (/^प्रश्न\s*\d+/i.test(s) && s.length < 48) return true;
  if (/^Question\s*\d+/i.test(s) && s.length < 48) return true;
  return false;
}

function cleanQuestionText(str, hasAnyImage, chapter = '') {
  const s = String(str || '').trim();
  if (!s) return '';
  if (isPlaceholderQuestionText(s)) return '';
  if (hasAnyImage && chapter && s === String(chapter).trim()) return '';
  if (hasAnyImage && s.length > 1500) return '';
  return s;
}

function decodeDataUrlToBuffer(dataUrl) {
  if (!dataUrl || !String(dataUrl).startsWith('data:image/')) return null;
  const commaIdx = dataUrl.indexOf(',');
  const b64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  if (!b64 || b64.length < 16) return null;
  try {
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

function isDirectJsonBuffer(buf) {
  for (let i = 0; i < Math.min(buf.byteLength, 32); i++) {
    const b = buf[i];
    if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) continue;
    return b === 0x7b;
  }
  return false;
}

function restoreJsonBufferFromBinaryFrame(raw) {
  if (raw.byteLength < 8) {
    throw new Error('Truncated binary frame header');
  }
  const tmplLen = raw.readUInt32LE(0);
  const blobCount = raw.readUInt32LE(4);
  if (blobCount > 500000) {
    throw new Error('Corrupted binary frame blobCount');
  }
  const headerLen = 8 + blobCount * 4;
  if (headerLen > raw.byteLength || headerLen + tmplLen > raw.byteLength) {
    throw new Error('Corrupted binary frame bounds');
  }
  const tmplStr = raw.subarray(headerLen, headerLen + tmplLen).toString('utf-8');
  const blobs = new Array(blobCount);
  let offset = headerLen + tmplLen;
  for (let i = 0; i < blobCount; i++) {
    const bLen = raw.readUInt32LE(8 + i * 4);
    if (offset + bLen > raw.byteLength) {
      blobs[i] = '';
      break;
    }
    blobs[i] = raw.subarray(offset, offset + bLen).toString('base64');
    offset += bLen;
  }
  const restored = tmplStr.replace(/__B64_(\d+)__/g, (_m, idxStr) => blobs[Number(idxStr)] || '');
  return Buffer.from(restored, 'utf-8');
}

function unpackBinaryToJsonBuffer(packed) {
  let raw = packed;
  if (packed.byteLength >= 2 && packed[0] === 0x1f && packed[1] === 0x8b) {
    raw = zlib.gunzipSync(packed);
  }
  if (isDirectJsonBuffer(raw)) {
    return raw;
  }
  if (raw.byteLength >= 4) {
    const headerLen = raw.readUInt32LE(0);
    if (headerLen > 2 && 4 + headerLen <= raw.byteLength && raw[4] === 0x7b) {
      const headerStr = raw.subarray(4, 4 + headerLen).toString('utf-8');
      const header = JSON.parse(headerStr);
      const rawHtml =
        4 + headerLen < raw.byteLength ? raw.subarray(4 + headerLen).toString('utf-8') : '';
      return Buffer.from(
        JSON.stringify({
          meta: header.meta,
          questions: Array.isArray(header.questions) ? header.questions : [],
          rawHtml,
        }),
        'utf-8'
      );
    }
  }
  return restoreJsonBufferFromBinaryFrame(raw);
}

function readRawTestBufferSync(fileId) {
  const binPath = path.join(TESTS_DIR, `${fileId}.bin`);
  if (fs.existsSync(binPath)) {
    try {
      const packed = fs.readFileSync(binPath);
      return unpackBinaryToJsonBuffer(packed);
    } catch {
      // fall through
    }
  }
  const jsonPath = path.join(TESTS_DIR, `${fileId}.json`);
  if (fs.existsSync(jsonPath)) {
    try {
      return fs.readFileSync(jsonPath);
    } catch {
      // ignore
    }
  }
  return null;
}

function hasMeaningfulQuestionText(q) {
  const en = typeof q.questionEn === 'string' ? q.questionEn.trim() : '';
  const hi = typeof q.questionHi === 'string' ? q.questionHi.trim() : '';
  const ch = typeof q.chapter === 'string' ? q.chapter.trim() : '';
  const best = en.length >= hi.length ? en : hi;
  if (best.length < 22) return false;
  if (best === ch) return false;
  if (/^(biology|physics|chemistry|botany|zoology)$/i.test(best)) return false;
  if (/refer to (question|the)|select the correct option/i.test(best) && best.length < 110) {
    return false;
  }
  return true;
}

function isTestBufferPlayable(buf) {
  if (!buf) return false;
  if (buf.byteLength > 120000) return true;
  try {
    const parsed = JSON.parse(buf.toString('utf-8'));
    const htmlStr = typeof parsed?.rawHtml === 'string' ? parsed.rawHtml.trim() : '';
    if (htmlStr.length > 20) return true;
    const qs = Array.isArray(parsed?.questions) ? parsed.questions : [];
    if (qs.length === 0) return false;
    const q0 = qs[0] || {};
    const hasImg = Boolean(
      q0.imageEn ||
        q0.imageHi ||
        q0.imageUrl ||
        (Array.isArray(q0.imageUrls) && q0.imageUrls.length > 0)
    );
    if (hasImg) return true;
    return hasMeaningfulQuestionText(q0);
  } catch {
    return false;
  }
}

function extractJsonAfterVar(html, varNames) {
  for (const name of varNames) {
    const re = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*`, 'g');
    let m;
    while ((m = re.exec(html)) !== null) {
      let i = m.index + m[0].length;
      while (i < html.length && /\s/.test(html[i])) i++;
      const openCh = html[i];
      if (openCh !== '{' && openCh !== '[') continue;
      const closeCh = openCh === '{' ? '}' : ']';
      let depth = 0;
      let inStr = false;
      let escaped = false;
      for (let j = i; j < html.length; j++) {
        const ch = html[j];
        if (inStr) {
          if (escaped) {
            escaped = false;
          } else if (ch === '\\') {
            escaped = true;
          } else if (ch === '"') {
            inStr = false;
          }
          continue;
        }
        if (ch === '"') {
          inStr = true;
        } else if (ch === openCh) {
          depth++;
        } else if (ch === closeCh) {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(html.slice(i, j + 1));
            } catch {
              break;
            }
          }
        }
      }
    }
  }
  return null;
}

function mapAnswerValue(val) {
  const raw = Array.isArray(val) ? val[0] : val;
  const s = String(raw ?? '1').trim().toUpperCase();
  if (s === 'A') return '1';
  if (s === 'B') return '2';
  if (s === 'C') return '3';
  if (s === 'D') return '4';
  const digits = s.replace(/[^1-4]/g, '');
  return digits || '1';
}

function defaultNeetOptions() {
  return {
    optionsHi: [
      { id: '1', text: 'विकल्प (1)' },
      { id: '2', text: 'विकल्प (2)' },
      { id: '3', text: 'विकल्प (3)' },
      { id: '4', text: 'विकल्प (4)' },
    ],
    optionsEn: [
      { id: '1', text: 'Option (1)' },
      { id: '2', text: 'Option (2)' },
      { id: '3', text: 'Option (3)' },
      { id: '4', text: 'Option (4)' },
    ],
  };
}

function extractQuestionsFromRawHtml(rawHtml, storedQuestions = [], meta = {}) {
  const html = String(rawHtml || '').trim();
  if (!html) return storedQuestions;

  // Check if storedQuestions already have inline images
  const storedHasImages =
    Array.isArray(storedQuestions) &&
    storedQuestions.length > 0 &&
    Boolean(
      storedQuestions[0]?.imageHi ||
        storedQuestions[0]?.imageEn ||
        storedQuestions[0]?.imageUrl ||
        (Array.isArray(storedQuestions[0]?.imageUrls) && storedQuestions[0].imageUrls.length > 0)
    );
  if (storedHasImages) return storedQuestions;

  const dataVal = extractJsonAfterVar(html, ['DATA']);
  if (dataVal && typeof dataVal === 'object' && !Array.isArray(dataVal) && Array.isArray(dataVal.items)) {
    const defaultMime = String(dataVal.meta?.imgMime || 'image/webp');
    const items = dataVal.items;
    return items.map((it, idx) => {
      const stored = storedQuestions[idx] || {};
      const hiImg = ensureImageDataUrlServer(it.hi, defaultMime);
      const enImg = ensureImageDataUrlServer(it.en, defaultMime);
      const subj = String(it.s || '').trim();
      const topic = String(it.r || '').replace(/^\[|\]$/g, '').trim();
      const chapter = [subj, topic].filter(Boolean).join(' — ') || stored.chapter || meta?.chapter || 'NEET Syllabus';
      const opts = defaultNeetOptions();
      const expTextEn = String(it.n || it.e || stored?.explanation?.en || '').trim();
      const expTextHi = String(it.e || it.n || stored?.explanation?.hi || '').trim();
      return {
        id: it.q || idx + 1,
        chapter,
        questionHi: cleanQuestionText(stored.questionHi, Boolean(hiImg || enImg), chapter),
        questionEn: cleanQuestionText(stored.questionEn, Boolean(hiImg || enImg), chapter),
        optionsHi: Array.isArray(stored.optionsHi) && stored.optionsHi.length === 4 ? stored.optionsHi : opts.optionsHi,
        optionsEn: Array.isArray(stored.optionsEn) && stored.optionsEn.length === 4 ? stored.optionsEn : opts.optionsEn,
        correctAnswer: mapAnswerValue(it.k ?? stored.correctAnswer),
        explanation: {
          hi: expTextHi.startsWith('data:image/') ? '' : expTextHi,
          en: expTextEn.startsWith('data:image/') ? '' : expTextEn,
        },
        hasImage: Boolean(hiImg || enImg),
        imageHi: hiImg || undefined,
        imageEn: enImg || undefined,
      };
    });
  }

  if (Array.isArray(dataVal) && dataVal.length > 0) {
    return dataVal.map((it, idx) => {
      const stored = storedQuestions[idx] || {};
      if (it.hiImg || it.enImg || it.qHi || it.qEn) {
        const hiImg = ensureImageDataUrlServer(it.hiImg);
        const enImg = ensureImageDataUrlServer(it.enImg);
        const opts = defaultNeetOptions();
        return {
          id: it.q || idx + 1,
          chapter: String(it.chapter || stored.chapter || meta?.chapter || 'NEET Syllabus'),
          questionHi: cleanQuestionText(it.qHi, Boolean(hiImg || enImg), it.chapter),
          questionEn: cleanQuestionText(it.qEn, Boolean(hiImg || enImg), it.chapter),
          optionsHi: Array.isArray(it.optsHi) && it.optsHi.length === 4
            ? it.optsHi.map((t, i) => ({ id: String(i + 1), text: String(t || `विकल्प (${i + 1})`) }))
            : opts.optionsHi,
          optionsEn: Array.isArray(it.optsEn) && it.optsEn.length === 4
            ? it.optsEn.map((t, i) => ({ id: String(i + 1), text: String(t || `Option (${i + 1})`) }))
            : opts.optionsEn,
          correctAnswer: mapAnswerValue(it.ans ?? stored.correctAnswer),
          explanation: {
            hi: String(it.expHi || stored?.explanation?.hi || ''),
            en: String(it.expEn || stored?.explanation?.en || ''),
          },
          hasImage: Boolean(hiImg || enImg),
          imageHi: hiImg || undefined,
          imageEn: enImg || undefined,
        };
      }
      const hiImg = ensureImageDataUrlServer(it.hi);
      const enImg = ensureImageDataUrlServer(it.en);
      const qNum = Number(it.n) || idx + 1;
      const chapter =
        stored.chapter ||
        (qNum <= 45 ? 'Physics' : qNum <= 90 ? 'Chemistry' : 'Biology');
      const opts = defaultNeetOptions();
      return {
        id: qNum,
        chapter,
        questionHi: '',
        questionEn: '',
        optionsHi: opts.optionsHi,
        optionsEn: opts.optionsEn,
        correctAnswer: mapAnswerValue(it.a ?? stored.correctAnswer),
        explanation: {
          hi: String(stored?.explanation?.hi || ''),
          en: String(stored?.explanation?.en || ''),
        },
        hasImage: Boolean(hiImg || enImg),
        imageHi: hiImg || undefined,
        imageEn: enImg || undefined,
      };
    });
  }

  const questionsVal = extractJsonAfterVar(html, ['QUESTIONS']);
  if (Array.isArray(questionsVal) && questionsVal.length > 0) {
    return questionsVal.map((it, idx) => {
      const stored = storedQuestions[idx] || {};
      const hiImg = ensureImageDataUrlServer(it.hi);
      const enImg = ensureImageDataUrlServer(it.en);
      const subj = String(it.subject || '').trim();
      const topic = String(it.topic || '').trim();
      const chapter = [subj, topic].filter(Boolean).join(' — ') || stored.chapter || meta?.chapter || 'NEET Syllabus';
      const opts = defaultNeetOptions();
      const expStr = String(it.exp || stored?.explanation?.en || '').trim();
      return {
        id: Number(it.id) || idx + 1,
        chapter,
        questionHi: '',
        questionEn: '',
        optionsHi: opts.optionsHi,
        optionsEn: opts.optionsEn,
        correctAnswer: mapAnswerValue(it.ans ?? stored.correctAnswer),
        explanation: {
          hi: expStr,
          en: expStr,
        },
        hasImage: Boolean(hiImg || enImg),
        imageHi: hiImg || undefined,
        imageEn: enImg || undefined,
      };
    });
  }

  return storedQuestions;
}

const resolvedSourceCache = new Map();
const exportedQimgSources = new Set();

function getResolvedSourceTest(sourceId, targetMeta = null) {
  if (resolvedSourceCache.has(sourceId)) {
    return resolvedSourceCache.get(sourceId);
  }
  const primaryBuf = readRawTestBufferSync(sourceId);
  if (!primaryBuf || !isTestBufferPlayable(primaryBuf)) {
    resolvedSourceCache.set(sourceId, null);
    return null;
  }
  const parsed = JSON.parse(primaryBuf.toString('utf-8'));
  const rawHtml = typeof parsed.rawHtml === 'string' ? parsed.rawHtml : '';
  const storedQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
  const effMeta = parsed.meta || targetMeta || { id: sourceId };
  const extractedQuestions =
    rawHtml.trim().length > 200
      ? extractQuestionsFromRawHtml(rawHtml, storedQuestions, effMeta)
      : storedQuestions;
  const result = {
    sourceId,
    meta: effMeta,
    questions: extractedQuestions,
    rawHtml,
  };
  resolvedSourceCache.set(sourceId, result);
  return result;
}

function ensureSourceQimgsExported(sourceTest, distQimgDir) {
  if (!sourceTest || exportedQimgSources.has(sourceTest.sourceId)) return;
  exportedQimgSources.add(sourceTest.sourceId);

  const sourceId = sourceTest.sourceId;
  const testQimgDir = path.join(distQimgDir, sourceId);
  ensureDir(testQimgDir);

  sourceTest.questions.forEach((q, idx) => {
    if (!q || typeof q !== 'object') return;
    const imgs = Array.isArray(q.imageUrls) ? q.imageUrls : [];
    const hiDataUrl =
      ensureImageDataUrlServer(q.imageHi) ||
      ensureImageDataUrlServer(imgs[0]) ||
      ensureImageDataUrlServer(q.imageUrl) ||
      ensureImageDataUrlServer(q.questionHi);
    const enDataUrl =
      ensureImageDataUrlServer(q.imageEn) ||
      ensureImageDataUrlServer(imgs[1]) ||
      ensureImageDataUrlServer(q.questionEn);

    const hiBuf = decodeDataUrlToBuffer(hiDataUrl);
    const enBuf = decodeDataUrlToBuffer(enDataUrl);
    if (!hiBuf && !enBuf) return;

    const qIdxDir = path.join(testQimgDir, String(idx));
    ensureDir(qIdxDir);
    if (hiBuf) {
      fs.writeFileSync(path.join(qIdxDir, 'hi.png'), hiBuf);
    }
    if (enBuf && (!hiBuf || !enBuf.equals(hiBuf))) {
      fs.writeFileSync(path.join(qIdxDir, 'en.png'), enBuf);
    }
    q._hasHiFile = Boolean(hiBuf);
    q._hasEnFile = Boolean(enBuf);
    q._enMatchesHi = Boolean(enBuf && hiBuf && enBuf.equals(hiBuf));
  });
}

function buildCompactQuestionWithUrls(q, fallbackSourceId, fallbackIdx) {
  if (!q || typeof q !== 'object') return q;
  const imgSourceId = q._srcTestId || fallbackSourceId;
  const imgIdx = typeof q._srcIdx === 'number' ? q._srcIdx : fallbackIdx;

  const imgs = Array.isArray(q.imageUrls) ? q.imageUrls : [];
  const rawHi =
    ensureImageDataUrlServer(q.imageHi) ||
    ensureImageDataUrlServer(imgs[0]) ||
    ensureImageDataUrlServer(q.imageUrl) ||
    ensureImageDataUrlServer(q.questionHi);
  const rawEn =
    ensureImageDataUrlServer(q.imageEn) ||
    ensureImageDataUrlServer(imgs[1]) ||
    ensureImageDataUrlServer(q.questionEn);

  const hiUrl = rawHi
    ? rawHi.startsWith('data:image/')
      ? `/static-store/qimg/${encodeURIComponent(imgSourceId)}/${imgIdx}/hi.png`
      : rawHi
    : '';
  const enUrl = rawEn
    ? rawEn.startsWith('data:image/')
      ? rawEn === rawHi && hiUrl
        ? hiUrl
        : `/static-store/qimg/${encodeURIComponent(imgSourceId)}/${imgIdx}/en.png`
      : rawEn
    : '';

  const hasAnyImg = Boolean(hiUrl || enUrl);
  const cleanHi = cleanQuestionText(q.questionHi, hasAnyImg, q.chapter);
  const cleanEn = cleanQuestionText(q.questionEn, hasAnyImg, q.chapter);

  const out = { ...q };
  delete out._srcTestId;
  delete out._srcIdx;
  delete out._hasHiFile;
  delete out._hasEnFile;
  delete out._enMatchesHi;

  return {
    ...out,
    id: q.id || fallbackIdx + 1,
    chapter: String(q.chapter || 'NEET Syllabus'),
    imageUrl: hiUrl || enUrl || undefined,
    imageHi: hiUrl || undefined,
    imageEn: enUrl || undefined,
    imageUrls: hasAnyImg
      ? Array.from(new Set([hiUrl, enUrl].filter(Boolean)))
      : undefined,
    questionHi: cleanHi,
    questionEn: cleanEn,
    hasImage: hasAnyImg,
  };
}

function resolvePlayableTestPayload(rawId, targetMeta) {
  const assetRel =
    rawId === 'prayas_06'
      ? 'assets/aistudio/Vs_PRAYAS_Minor_Test_06__02_11_2026__NEET_CBT_Test_e42702d3.html'
      : typeof targetMeta?.assetUrl === 'string' && targetMeta.assetUrl.startsWith('/assets/')
        ? targetMeta.assetUrl.slice(1)
        : '';
  if (assetRel) {
    const pubAsset = path.join(ROOT_DIR, 'public', assetRel);
    if (fs.existsSync(pubAsset)) {
      const html = fs.readFileSync(pubAsset, 'utf-8');
      return {
        sourceId: rawId,
        meta: targetMeta,
        questions: extractQuestionsFromRawHtml(html, [], targetMeta),
        rawHtml: html,
        usedSources: [],
      };
    }
  }

  const primaryId = DUPLICATE_TEST_FILE_ALIASES[rawId] || rawId;
  const primaryResolved = getResolvedSourceTest(primaryId, targetMeta);
  if (primaryResolved) {
    return {
      sourceId: primaryId,
      meta: targetMeta || primaryResolved.meta,
      questions: primaryResolved.questions,
      rawHtml: primaryResolved.rawHtml,
      usedSources: [primaryResolved],
    };
  }

  const spec = CURATED_FALLBACK_SPECS[rawId];
  if (spec) {
    const slicedQuestions = [];
    const usedSourcesMap = new Map();
    for (const sl of spec.slices) {
      const src = getResolvedSourceTest(sl.sourceId);
      if (!src || !Array.isArray(src.questions)) continue;
      usedSourcesMap.set(src.sourceId, src);
      const end = Math.min(src.questions.length, sl.start + sl.count);
      for (let i = sl.start; i < end; i++) {
        const origQ = src.questions[i];
        if (!origQ) continue;
        slicedQuestions.push({
          ...origQ,
          id: slicedQuestions.length + 1,
          chapter:
            origQ.chapter && origQ.chapter !== 'NEET Syllabus'
              ? origQ.chapter
              : spec.subjectLabel || 'NEET Syllabus',
          _srcTestId: src.sourceId,
          _srcIdx: i,
        });
      }
    }
    if (slicedQuestions.length > 0) {
      return {
        sourceId: rawId,
        meta: targetMeta || { id: rawId },
        questions: slicedQuestions,
        rawHtml: '',
        usedSources: Array.from(usedSourcesMap.values()),
      };
    }
  }

  // Generic final fallback if a brand-new stub ID ever lacks slices
  const isBio90 =
    Number(targetMeta?.totalQuestions || 0) === 90 ||
    /bio|bts/i.test(String(targetMeta?.title || ''));
  const fallbackSource = getResolvedSourceTest(
    isBio90 ? 'test_mwdhw8uw_3_6bsu' : 'test_mwdt8qzq_2_du0l'
  );
  if (fallbackSource) {
    const qs = fallbackSource.questions.map((q, i) => ({
      ...q,
      _srcTestId: fallbackSource.sourceId,
      _srcIdx: i,
    }));
    return {
      sourceId: rawId,
      meta: targetMeta || fallbackSource.meta || { id: rawId },
      questions: qs,
      rawHtml: '',
      usedSources: [fallbackSource],
    };
  }
  return null;
}

function patchHtmlForPortalIframe(sourceHtml, opts) {
  const trimmed = String(sourceHtml || '').trim();
  if (!trimmed) return '';

  const tailOffset = Math.max(0, trimmed.length - 8192);
  const cleanedTail = trimmed
    .slice(tailOffset)
    .replace(/<script>\(function\(\)\{function c\(\)\{var b=a\.contentDocument[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*beacon\.min\.js[^>]*>[\s\S]*?<\/script>/gi, '');

  let baseHtml = (trimmed.slice(0, tailOffset) + cleanedTail)
    .replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '')
    .replace(/<script[^>]+cdn-cgi[^>]*>[\s\S]*?<\/script>/gi, '');

  if (!/<body[\s>]/i.test(baseHtml)) {
    const escapedTitle = String(opts.title || 'VS Test').replace(/</g, '&lt;');
    baseHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${escapedTitle}</title></head><body>${baseHtml}</body></html>`;
  } else if (!/<head[\s>]/i.test(baseHtml)) {
    const htmlTagMatch = /<html[^>]*>/i.exec(baseHtml);
    if (htmlTagMatch && typeof htmlTagMatch.index === 'number') {
      const pos = htmlTagMatch.index + htmlTagMatch[0].length;
      baseHtml = `${baseHtml.slice(0, pos)}<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head>${baseHtml.slice(pos)}`;
    } else {
      baseHtml = `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head>${baseHtml}`;
    }
  }

  const preBootSanitizerScript = `<script>
(function(){
  try {
    try { window.alert = function(){}; } catch(e) {}
    try { window.confirm = function(){ return true; }; } catch(e) {}
    try { window.open = function(){ return null; }; } catch(e) {}
    window.addEventListener('error', function(ev) {
      if (ev && ev.message && (ev.message.indexOf('Script error') !== -1 || ev.message.indexOf('ResizeObserver') !== -1)) {
        ev.preventDefault();
      }
    });
    window.addEventListener('unhandledrejection', function(ev) {
      try { ev.preventDefault(); } catch(e) {}
    });
    var TEST_ISO_ID = ${JSON.stringify(opts.testId || 'default_test')};
    var GENERIC_CBT_KEYS = {
      cbt_answers: 1,
      cbt_marked: 1,
      cbt_visited: 1,
      cbt_start: 1,
      cbt_submitted: 1,
      cbt_timePerQ: 1,
      cbt_theme: 1,
      cbt_lang: 1,
      cbt_mode: 1,
      cbt_cur: 1,
      cbt_sec: 1
    };
    var origGetItem = Storage.prototype.getItem;
    var origSetItem = Storage.prototype.setItem;
    var origRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.getItem = function(k) {
      try {
        var mapped = (this === window.localStorage && GENERIC_CBT_KEYS[k]) ? ('vs_iso_' + TEST_ISO_ID + '_' + k) : k;
        return origGetItem.call(this, mapped);
      } catch(e) { return null; }
    };
    Storage.prototype.setItem = function(k, v) {
      try {
        var mapped = (this === window.localStorage && GENERIC_CBT_KEYS[k]) ? ('vs_iso_' + TEST_ISO_ID + '_' + k) : k;
        return origSetItem.call(this, mapped, v);
      } catch(e) {}
    };
    Storage.prototype.removeItem = function(k) {
      try {
        var mapped = (this === window.localStorage && GENERIC_CBT_KEYS[k]) ? ('vs_iso_' + TEST_ISO_ID + '_' + k) : k;
        return origRemoveItem.call(this, mapped);
      } catch(e) {}
    };
    var isoPrefix = 'vs_iso_' + TEST_ISO_ID + '_';
    var prevSubmitted = origGetItem.call(window.localStorage, isoPrefix + 'cbt_submitted');
    var prevStart = parseInt(origGetItem.call(window.localStorage, isoPrefix + 'cbt_start') || '0', 10);
    if (prevSubmitted === 'true' || (prevStart > 0 && (Date.now() - prevStart) > 9000 * 1000)) {
      origRemoveItem.call(window.localStorage, isoPrefix + 'cbt_submitted');
      origRemoveItem.call(window.localStorage, isoPrefix + 'cbt_start');
      origRemoveItem.call(window.localStorage, isoPrefix + 'cbt_answers');
      origRemoveItem.call(window.localStorage, isoPrefix + 'cbt_marked');
      origRemoveItem.call(window.localStorage, isoPrefix + 'cbt_visited');
      origRemoveItem.call(window.localStorage, isoPrefix + 'cbt_timePerQ');
    }
    for (var i = window.localStorage.length - 1; i >= 0; i--) {
      var key = window.localStorage.key(i);
      if (!key) continue;
      if (key.indexOf('neet_cbt_') === 0 || key.indexOf('_v4_state') !== -1 || key.indexOf('cbt_state') !== -1) {
        try {
          var rawVal = origGetItem.call(window.localStorage, key);
          if (rawVal && rawVal.charAt(0) === '{') {
            var parsed = JSON.parse(rawVal);
            if (parsed && (parsed.submitted === true || (typeof parsed.remainingSec === 'number' && parsed.remainingSec <= 60))) {
              origRemoveItem.call(window.localStorage, key);
            }
          }
        } catch (err) {}
      }
    }
  } catch (e) {}
})();
</script>`;

  baseHtml = baseHtml
    .replace(
      /const\s+res\s*=\s*computeResults\s*\(([^)]*)\)\s*;/g,
      'const res = computeResults($1); try { if (typeof window.__vsOnHtmlAnalysisResult === "function") window.__vsOnHtmlAnalysisResult(res); } catch(e) {}'
    )
    .replace(
      /buildAnalysis\s*\(\s*\)\s*;\s*showAnalysis\s*\(\s*\)\s*;/g,
      'buildAnalysis(); showAnalysis(); try { if (typeof window.__vsNotifySubmitted === "function") window.__vsNotifySubmitted(); } catch(e) {}'
    );

  const headMatch = /<head[^>]*>/i.exec(baseHtml);
  if (headMatch && typeof headMatch.index === 'number') {
    const insertPos = headMatch.index + headMatch[0].length;
    baseHtml = baseHtml.slice(0, insertPos) + preBootSanitizerScript + baseHtml.slice(insertPos);
  } else {
    baseHtml = `${preBootSanitizerScript}${baseHtml}`;
  }

  const bridgeScript = `<script>
(function(){
  function fixBase64Img(val) {
    if (!val || typeof val !== 'string') return val;
    var s = val.trim();
    if (s.indexOf('data:image/') === 0 || s.indexOf('http') === 0 || (s.indexOf('/') === 0 && s.indexOf('/9j/') !== 0)) return s;
    var c = s.replace(/\\s+/g, '');
    if (c.indexOf('iVBORw0KGgo') === 0) return 'data:image/png;base64,' + c;
    if (c.indexOf('/9j/') === 0) return 'data:image/jpeg;base64,' + c;
    if (c.indexOf('UklGR') === 0) return 'data:image/webp;base64,' + c;
    if (c.indexOf('R0lGOD') === 0) return 'data:image/gif;base64,' + c;
    return val;
  }
  function ensureBackButton() {
    try {
      if (document.getElementById('vsPortalBackBtn')) return;
      var brand = document.querySelector('.brand, .exam-header, .hdr, .header, .topbar, header') || document.body;
      if (!brand) return;
      var backBtn = document.createElement('button');
      backBtn.id = 'vsPortalBackBtn';
      backBtn.type = 'button';
      backBtn.textContent = '← Home';
      backBtn.style.cssText = 'border:1px solid #b9dced;background:#ffffff;color:#145d88;border-radius:10px;padding:7px 11px;font-weight:800;font-size:12px;cursor:pointer;flex-shrink:0;margin-right:6px;z-index:2147483647;position:relative;';
      backBtn.onclick = function(e) {
        if (e && e.stopPropagation) e.stopPropagation();
        try { window.parent.postMessage({ type: 'VS_CBT_HTML_EXIT' }, '*'); } catch(err) {}
      };
      if (brand === document.body) {
        backBtn.style.position = 'fixed';
        backBtn.style.top = '10px';
        backBtn.style.left = '10px';
        document.body.appendChild(backBtn);
      } else {
        brand.insertBefore(backBtn, brand.firstChild);
      }
    } catch(e) {}
  }
  function signalReady() {
    ensureBackButton();
    try { window.parent.postMessage({ type: 'VS_CBT_HTML_BRIDGE_READY' }, '*'); } catch(e) {}
  }
  try {
    if (typeof DATA !== 'undefined' && Array.isArray(DATA)) {
      DATA.forEach(function(it){
        if (it && it.hi) it.hi = fixBase64Img(it.hi);
        if (it && it.en) it.en = fixBase64Img(it.en);
        if (it && it.hiImg) it.hiImg = fixBase64Img(it.hiImg);
        if (it && it.enImg) it.enImg = fixBase64Img(it.enImg);
      });
    }
    if (typeof PAGES !== 'undefined' && Array.isArray(PAGES)) {
      for (var p = 0; p < PAGES.length; p++) {
        PAGES[p] = fixBase64Img(PAGES[p]);
      }
    }
    if (typeof render === 'function') {
      try { render(); } catch(e) {}
    }
    signalReady();
    document.addEventListener('DOMContentLoaded', signalReady);
    window.addEventListener('load', signalReady);

    var lastShareStats = null;
    function injectHtmlShareButton(stats) {
      if (stats) lastShareStats = stats;
      setTimeout(function() {
        var topBtns = document.querySelector('.analysis-top-btns, .analysis-header, .analysis-head');
        if (topBtns) {
          if (!document.getElementById('vsShareResultBtn')) {
            var shareBtn = document.createElement('button');
            shareBtn.id = 'vsShareResultBtn';
            shareBtn.type = 'button';
            shareBtn.className = 'btn';
            shareBtn.innerHTML = '📤 Share Scorecard';
            shareBtn.style.cssText = 'background:linear-gradient(135deg,#059669,#0284c7);color:#ffffff;border:none;font-weight:900;padding:8px 14px;border-radius:10px;cursor:pointer;box-shadow:0 4px 12px rgba(2,132,199,0.28);margin-right:6px;';
            shareBtn.onclick = function(e) {
              if (e && e.stopPropagation) e.stopPropagation();
              window.parent.postMessage({ type: 'VS_CBT_HTML_SHARE', stats: lastShareStats }, '*');
            };
            topBtns.insertBefore(shareBtn, topBtns.firstChild);
          }
          if (!document.getElementById('vsDownloadPdfBtn')) {
            var pdfBtn = document.createElement('button');
            pdfBtn.id = 'vsDownloadPdfBtn';
            pdfBtn.type = 'button';
            pdfBtn.className = 'btn';
            pdfBtn.innerHTML = '📥 Download Question PDF (VS)';
            pdfBtn.style.cssText = 'background:linear-gradient(135deg,#4f46e5,#0284c7);color:#ffffff;border:none;font-weight:900;padding:8px 14px;border-radius:10px;cursor:pointer;box-shadow:0 4px 12px rgba(79,70,229,0.32);margin-right:6px;';
            pdfBtn.onclick = function(e) {
              if (e && e.stopPropagation) e.stopPropagation();
              window.parent.postMessage({ type: 'VS_CBT_HTML_DOWNLOAD_PDF', stats: lastShareStats }, '*');
            };
            topBtns.insertBefore(pdfBtn, topBtns.firstChild);
          }
        }
      }, 60);
    }

    var posted = false;
    window.__vsOnHtmlAnalysisResult = function(res) {
      try {
        if (!res || typeof res !== 'object') return;
        var items = Array.isArray(res.items) ? res.items : [];
        var zeroIndexedAnswers = {};
        var extractedMistakes = [];
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (!it) continue;
          var qIdx = (typeof it.qNum === 'number' && it.qNum >= 1) ? it.qNum - 1 : i;
          if (it.userAns !== undefined && it.userAns !== null && String(it.userAns) !== '') {
            zeroIndexedAnswers[qIdx] = String(it.userAns);
          }
          var isWrong = it.status === 'incorrect';
          var isMarked = Boolean(it.marked);
          if (isWrong || isMarked) {
            extractedMistakes.push({
              qNum: it.qNum || (i + 1),
              subject: it.subject || '',
              userAns: it.userAns ? String(it.userAns) : '',
              corrAns: it.corrAns ? String(it.corrAns) : '1',
              reason: (isWrong && isMarked) ? 'both' : (isWrong ? 'wrong' : 'bookmarked'),
              enImg: fixBase64Img(it.enImg || ''),
              hiImg: fixBase64Img(it.hiImg || ''),
              seImg: fixBase64Img(it.seImg || ''),
              shImg: fixBase64Img(it.shImg || ''),
              expEn: it.expEn || '',
              ref: it.ref || ''
            });
          }
        }
        var summaryStats = {
          score: Number(res.obtained || 0),
          maxMarks: Number(res.maxMarks || (items.length * 4) || 360),
          correctCount: Number(res.correct || 0),
          wrongCount: Number(res.incorrect || 0),
          unattemptedCount: Number(res.unattempted || 0),
          accuracy: Math.round(Number(res.accuracy || 0)),
          totalTimeSpent: Math.max(1, Math.round(Number(res.timeTaken || 60)))
        };
        injectHtmlShareButton(summaryStats);
        if (extractedMistakes.length > 0) {
          window.parent.postMessage({ type: 'VS_CBT_HTML_MISTAKES', extractedMistakes: extractedMistakes }, '*');
        }
        if (!posted) {
          posted = true;
          window.parent.postMessage({
            type: 'VS_CBT_HTML_SUBMIT',
            score: summaryStats.score,
            maxMarks: summaryStats.maxMarks,
            correctCount: summaryStats.correctCount,
            wrongCount: summaryStats.wrongCount,
            unattemptedCount: summaryStats.unattemptedCount,
            accuracy: summaryStats.accuracy,
            timeTakenSeconds: summaryStats.totalTimeSpent,
            answers: zeroIndexedAnswers,
            extractedMistakes: extractedMistakes
          }, '*');
        }
      } catch (err) {}
    };

    function notifyParentSubmitted() {
      if (posted) return;
      posted = true;
      try {
        var isAiatsTemplate = (typeof state !== 'undefined' && state && state.answers && typeof questions !== 'undefined' && Array.isArray(questions));
        var ansMap = isAiatsTemplate
          ? state.answers
          : (typeof A !== 'undefined' && A)
            ? A
            : (typeof userAnswers !== 'undefined' && userAnswers)
              ? userAnswers
              : (typeof answers !== 'undefined' && answers ? answers : {});
        var qArr = isAiatsTemplate
          ? questions
          : (typeof DATA !== 'undefined' && Array.isArray(DATA))
            ? DATA
            : (typeof QUESTIONS !== 'undefined' && Array.isArray(QUESTIONS) ? QUESTIONS : null);
        var totalQ = (typeof N !== 'undefined' && N) ? N : (qArr ? qArr.length : ${opts.totalQuestions || 90});
        var maxM = (typeof MAX !== 'undefined' && MAX) ? MAX : totalQ * 4;
        var dur = (typeof DURATION !== 'undefined' && DURATION) ? DURATION : ${opts.durationSeconds || 5400};
        var rem = (typeof sec !== 'undefined' && typeof sec === 'number')
          ? sec
          : (typeof remaining !== 'undefined' && typeof remaining === 'number' ? remaining : 0);
        var spent = Math.max(1, dur - rem);
        var correct = 0, wrong = 0, blank = 0;
        var zeroIndexedAnswers = {};
        var extractedMistakes = [];
        for (var i = 0; i < totalQ; i++) {
          var qObj = qArr && qArr[i] ? qArr[i] : null;
          var picked = isAiatsTemplate
            ? (ansMap[i] !== undefined ? Number(ansMap[i]) + 1 : undefined)
            : (ansMap[i + 1] !== undefined ? ansMap[i + 1] : ansMap[i]);
          var rightAns = null;
          if (isAiatsTemplate && qObj && qObj.correct !== undefined) {
            rightAns = Number(qObj.correct) + 1;
          } else if (qObj && qObj.ans !== undefined) {
            rightAns = Array.isArray(qObj.ans) ? qObj.ans[0] : qObj.ans;
          } else if (typeof ANS !== 'undefined' && Array.isArray(ANS) && ANS[i] !== undefined) {
            rightAns = ANS[i];
          } else if (qObj) {
            rightAns = qObj.correctAnswer || qObj.correctOption || qObj.answer;
          }
          if (picked !== undefined && picked !== null && String(picked) !== '') {
            zeroIndexedAnswers[i] = String(picked);
            if (rightAns !== null && rightAns !== undefined) {
              if (String(picked) === String(rightAns)) {
                correct++;
              } else {
                wrong++;
                extractedMistakes.push({
                  qNum: i + 1,
                  subject: (qObj && (qObj.subject || qObj.sub || qObj.sec)) || '',
                  userAns: String(picked),
                  corrAns: String(rightAns),
                  reason: 'wrong',
                  enImg: fixBase64Img((qObj && (qObj.enImg || qObj.en || qObj.img)) || ''),
                  hiImg: fixBase64Img((qObj && (qObj.hiImg || qObj.hi)) || ''),
                  seImg: fixBase64Img((qObj && (qObj.seImg || qObj.solEn)) || ''),
                  shImg: fixBase64Img((qObj && (qObj.shImg || qObj.solHi)) || ''),
                  expEn: (qObj && (qObj.expEn || qObj.explanation || qObj.sol || '')) || ''
                });
              }
            } else {
              correct++;
            }
          } else {
            blank++;
          }
        }
        var score = correct * 4 - wrong;
        var attempted = correct + wrong;
        var acc = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
        injectHtmlShareButton({
          score: score,
          maxMarks: maxM,
          correctCount: correct,
          wrongCount: wrong,
          unattemptedCount: blank,
          accuracy: acc,
          totalTimeSpent: spent
        });
        window.parent.postMessage({
          type: 'VS_CBT_HTML_SUBMIT',
          score: score,
          maxMarks: maxM,
          correctCount: correct,
          wrongCount: wrong,
          unattemptedCount: blank,
          accuracy: acc,
          timeTakenSeconds: spent,
          answers: zeroIndexedAnswers,
          extractedMistakes: extractedMistakes
        }, '*');
      } catch (err) {}
    }
    window.__vsNotifySubmitted = notifyParentSubmitted;

    function postHtmlProgressSnapshot() {
      if (posted) return;
      try {
        var isAiats = (typeof state !== 'undefined' && state && state.answers);
        var ansMap = isAiats ? state.answers : ((typeof A !== 'undefined' && A) ? A : (typeof userAnswers !== 'undefined' && userAnswers ? userAnswers : {}));
        var totalQ = (typeof N !== 'undefined' && N) ? N : ${opts.totalQuestions || 90};
        var rem = (typeof sec !== 'undefined' && typeof sec === 'number') ? sec : (typeof remaining === 'number' ? remaining : ${opts.durationSeconds || 5400});
        var activeCur = (typeof cur === 'number') ? cur : 0;
        var zeroIndexed = {};
        for (var i = 0; i < totalQ; i++) {
          var picked = isAiats ? (ansMap[i] !== undefined ? Number(ansMap[i]) + 1 : undefined) : (ansMap[i + 1] !== undefined ? ansMap[i + 1] : ansMap[i]);
          if (picked !== undefined && picked !== null && String(picked) !== '') {
            zeroIndexed[i] = String(picked);
          }
        }
        window.parent.postMessage({
          type: 'VS_CBT_HTML_PROGRESS',
          answers: zeroIndexed,
          remainingSeconds: rem,
          currentIdx: activeCur
        }, '*');
      } catch (e) {}
    }
    setInterval(postHtmlProgressSnapshot, 4000);
    document.addEventListener('click', function() {
      setTimeout(postHtmlProgressSnapshot, 120);
    });

    ['result', 'submit', 'doSubmit', 'buildAnalysis', 'showAnalysis', 'submitExam', 'finishExam', 'showResult', 'calculateScore', 'submitTest'].forEach(function(fnName) {
      if (typeof window[fnName] === 'function') {
        var origFn = window[fnName];
        window[fnName] = function() {
          var r = origFn.apply(this, arguments);
          if (fnName !== 'submit') {
            notifyParentSubmitted();
          }
          return r;
        };
      }
    });
  } catch (e) {}
})();
</script>`;

  const lastBodyCloseIdx = baseHtml.toLowerCase().lastIndexOf('</body>');
  if (lastBodyCloseIdx !== -1) {
    return `${baseHtml.slice(0, lastBodyCloseIdx)}${bridgeScript}${baseHtml.slice(lastBodyCloseIdx)}`;
  }
  return `${baseHtml}${bridgeScript}`;
}

function buildStandaloneCbtHtmlForStatic(meta, questions, defaultSourceId = '') {
  const rawTestId = String(defaultSourceId || meta?.id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  const N = questions.length || Number(meta?.totalQuestions) || 90;
  const rawDur = Number(meta?.durationMinutes) || 90;
  const DURATION = (rawDur <= 6 ? rawDur * 60 : Math.max(60, rawDur)) * 60;
  const MAX = Number(meta?.maxMarks) || N * 4;
  const compactQs = questions.map((q, idx) => {
    const imgSourceId = q._srcTestId || rawTestId;
    const imgIdx = typeof q._srcIdx === 'number' ? q._srcIdx : idx;
    const imgs = Array.isArray(q.imageUrls) ? q.imageUrls : [];
    const rawHiImg =
      ensureImageDataUrlServer(q.imageHi) ||
      ensureImageDataUrlServer(imgs[0]) ||
      ensureImageDataUrlServer(q.imageUrl) ||
      ensureImageDataUrlServer(q.questionHi);
    const rawEnImg =
      ensureImageDataUrlServer(q.imageEn) ||
      ensureImageDataUrlServer(imgs[1]) ||
      ensureImageDataUrlServer(q.questionEn);

    const hiImg =
      rawHiImg && rawHiImg.startsWith('data:image/') && imgSourceId
        ? `/static-store/qimg/${encodeURIComponent(imgSourceId)}/${imgIdx}/hi.png`
        : rawHiImg;
    const enImg =
      rawEnImg && rawEnImg.startsWith('data:image/') && imgSourceId
        ? rawEnImg === rawHiImg && hiImg
          ? hiImg
          : `/static-store/qimg/${encodeURIComponent(imgSourceId)}/${imgIdx}/en.png`
        : rawEnImg;

    const hasAnyImg = Boolean(hiImg || enImg);
    const cleanHi = cleanQuestionText(q.questionHi, hasAnyImg, q.chapter);
    const cleanEn = cleanQuestionText(q.questionEn, hasAnyImg, q.chapter);
    const qHi = hiImg ? '' : cleanHi || (enImg ? '' : cleanEn);
    const qEn = enImg ? '' : cleanEn || (hiImg ? '' : cleanHi);

    const optsHiRaw = Array.isArray(q.optionsHi) ? q.optionsHi : [];
    const optsEnRaw = Array.isArray(q.optionsEn) ? q.optionsEn : [];
    const rawAns = String(q.correctAnswer ?? q.answer ?? q.ans ?? '1').trim().toUpperCase();
    const mappedAns =
      rawAns === 'A' ? 1 : rawAns === 'B' ? 2 : rawAns === 'C' ? 3 : rawAns === 'D' ? 4 : Number(rawAns.replace(/[^1-4]/g, '')) || 1;
    const expObj = q.explanation && typeof q.explanation === 'object' ? q.explanation : null;
    return {
      q: idx + 1,
      chapter: String(q.chapter || meta?.chapter || 'NEET Syllabus'),
      hiImg,
      enImg,
      qHi,
      qEn,
      optsHi: optsHiRaw.map((o) => String(typeof o === 'string' ? o : o?.text || '')),
      optsEn: optsEnRaw.map((o) => String(typeof o === 'string' ? o : o?.text || '')),
      ans: mappedAns,
      expHi: String(expObj?.hi || (typeof q.explanation === 'string' ? q.explanation : '') || ''),
      expEn: String(expObj?.en || (typeof q.explanation === 'string' ? q.explanation : '') || ''),
    };
  });

  const safeTitle = String(meta?.title || 'VS TEST NEET').replace(/</g, '&lt;');
  const safeSubTitle = String(meta?.subTitle || 'Bilingual CBT Paper').replace(/</g, '&lt;');
  const safeSubject = String(meta?.subject || 'NEET').replace(/</g, '&lt;');

  return `<!doctype html><html lang="hi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${safeTitle}</title><style>:root{--blue:#168acb;--ink:#183449;--line:#c9e5f4}*{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#effaff,#dff3ff 48%,#f8fcff);color:var(--ink);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}button{font:inherit;cursor:pointer}.top{position:sticky;top:0;z-index:5;background:#f7fcffed;backdrop-filter:blur(14px);border-bottom:1px solid var(--line);padding:10px}.brand{max-width:1100px;margin:auto;display:flex;justify-content:space-between;align-items:center;gap:8px}.logo{font-weight:900;color:#145d88}.logo small{display:block;font-size:10px;letter-spacing:2px;color:#6a93aa}.pill{border:1px solid #b9dced;border-radius:999px;padding:8px 11px;background:white;font-weight:800;color:#175b82;font-variant-numeric:tabular-nums}.wrap{max-width:1100px;margin:16px auto;padding:0 12px 30px;display:grid;grid-template-columns:minmax(0,1fr);gap:13px}.panel{background:#ffffffed;border:1px solid var(--line);border-radius:17px;box-shadow:0 10px 28px #3a8db515}.info{padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.sub{font-size:12px;color:#658196;font-weight:650}.tag{font-size:11px;background:#e4f5ff;color:#1c6f9f;padding:5px 9px;border-radius:99px;font-weight:800}.progress{height:6px;background:#e4f1f8;border-radius:9px;overflow:hidden;margin-top:7px}.progress span{display:block;height:100%;background:var(--blue);width:0}.qhead{display:flex;justify-content:space-between;align-items:center;padding:13px 15px;border-bottom:1px solid var(--line)}.qnum{font-weight:900;color:#145d88}.question{padding:12px}.langlabel{font-size:11px;font-weight:900;color:#1b6d99;margin:3px 0 5px}.qimage{display:block;width:100%;height:auto;border:1px solid #d7eaf5;border-radius:9px;background:white}.qtext{font-size:18px;font-weight:750;line-height:1.55;padding:10px 12px;background:#fff;border:1px solid #d7eaf5;border-radius:9px;white-space:pre-line}.lang-switch{background:#eaf7ff;border-color:#9bd5f3;color:#145d88;font-weight:800}.options{display:grid;gap:8px;margin-top:13px}.opt{width:100%;text-align:left;background:#f8fcff;border:1.5px solid #d4e8f4;border-radius:11px;padding:10px 12px;color:var(--ink);display:flex;align-items:center;gap:10px;min-height:46px;font-weight:700}.letter{width:27px;height:27px;border-radius:50%;display:grid;place-items:center;background:#e5f4fc;color:#216b93;font-weight:900;flex:none}.opt.selected{border-color:var(--blue);background:#e9f7ff}.opt.selected .letter{background:var(--blue);color:white}.controls{padding:12px 13px;border-top:1px solid var(--line);display:flex;gap:7px;flex-wrap:wrap}.btn{border:1px solid #b9dced;background:white;color:#1a628b;border-radius:10px;padding:10px 12px;font-weight:800}.primary{background:var(--blue);border-color:var(--blue);color:white}.green{background:#159b69;border-color:#159b69;color:white}.warn{color:#a46a10}.btn:disabled{opacity:.4}.palette-toggle{border:1px solid #a6d6ed;border-radius:11px;padding:8px 10px;color:#17658f;font-weight:800;background:#e8f7ff;white-space:nowrap;min-height:39px}.side{padding:14px;position:fixed;z-index:9;top:65px;right:12px;width:min(340px,calc(100vw - 24px));max-height:calc(100dvh - 80px);overflow:auto;box-shadow:0 16px 50px #20597b36;background:#fff}.side[hidden]{display:none}.drawer-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.drawer-head h3{margin:0;font-size:15px}.palette-close{border:1px solid #cce7f3;background:#f2faff;color:#1a628b;border-radius:9px;width:34px;height:34px;font-size:16px}.legend{font-size:11px;color:#658196;margin:10px 0;display:flex;gap:10px;flex-wrap:wrap}.dot{display:inline-block;width:9px;height:9px;border-radius:3px;background:#e5f1f7;margin-right:4px}.dot.done{background:#168acb}.dot.review{background:#e7a72c}.palette{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:10px}.pal{border:1px solid #cfe4ef;border-radius:7px;background:#f8fcff;color:#315b73;padding:7px 0;font-weight:800;font-size:12px}.pal.current{outline:2px solid #145d88}.pal.done{background:var(--blue);border-color:var(--blue);color:white}.pal.review{background:#e7a72c;border-color:#e7a72c;color:white}.question-image-frame{position:relative;isolation:isolate;background:#fff;border-radius:9px;overflow:hidden}.question-image-frame::before{content:"VS";position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(-23deg);font-weight:900;letter-spacing:.04em;font-size:clamp(70px,17vw,180px);color:rgba(36,145,198,.085);z-index:0;pointer-events:none;white-space:nowrap}.question-image-frame .qimage{position:relative;z-index:1;mix-blend-mode:multiply}.overlay{position:fixed;inset:0;background:#10293acc;display:none;place-items:center;padding:16px;z-index:20;overflow:auto}.modal{background:white;border-radius:18px;max-width:760px;width:min(760px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:22px;border:1px solid var(--line);box-shadow:0 20px 60px #0c263638;text-align:left}.heart-stage{position:relative;min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;text-align:center;background:linear-gradient(145deg,#effaff,#fff)}.big-heart{font-size:76px;animation:heartBeat .85s ease-in-out infinite}.float-heart{position:absolute;bottom:-45px;font-size:24px;animation:floatHeart 2.5s ease-out forwards;opacity:0;pointer-events:none}@keyframes heartBeat{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}@keyframes floatHeart{0%{transform:translateY(0) scale(.7) rotate(-10deg);opacity:0}15%{opacity:1}100%{transform:translateY(-340px) scale(1.25) rotate(18deg);opacity:0}}.analysis-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.analysis-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:14px 0}.analysis-card{background:#f2faff;border:1px solid #d8edf8;border-radius:12px;padding:12px}.analysis-card b{display:block;font-size:22px;color:#145d88}.analysis-section{margin-top:18px}.review-row{border:1px solid #d9eaf4;border-radius:11px;margin:8px 0;overflow:hidden}.review-row summary{padding:11px;background:#f7fcff;cursor:pointer;font-weight:800}.review-body{padding:12px;font-size:14px;line-height:1.5}.review-body img{width:100%;height:auto;border:1px solid #d7eaf5;border-radius:8px;margin:6px 0}.status-good{color:#13804a}.status-bad{color:#bd3b3b}.status-skip{color:#667788}footer{text-align:center;color:#7894a6;font-size:11px;padding:12px}@media(max-width:760px){.controls .btn{flex:1}.question{padding:8px}.qimage{border-radius:7px}}@media(max-width:480px){.brand{gap:4px}.brand>div:last-child{gap:3px!important}.brand .logo{font-size:12px}.brand .logo small{font-size:8px;letter-spacing:1px}.brand .pill{font-size:11px;padding:8px 6px}.palette-toggle{font-size:11px;padding:8px 7px}.side{top:61px}}</style></head><body><header class="top"><div class="brand"><div class="logo">VS TEST NEET<small>ICE BLUE · BILINGUAL CBT</small></div><div style="display:flex;gap:6px;align-items:center"><button type="button" class="pill lang-switch" id="langBtn">HI + EN</button><span class="pill" id="timer">00:00:00</span><span class="pill" id="count">0 / ${N}</span><button type="button" class="pill" id="topSubmit" style="background:#159b69;color:#fff;border-color:#159b69">Submit ✓</button><button type="button" class="palette-toggle" id="paletteToggle" aria-expanded="false" aria-controls="paletteDrawer">☷ <span>Palette</span></button></div></div></header><div class="wrap"><main class="main"><section class="panel info"><div><b>${safeTitle}</b><div class="sub">${safeSubTitle} · ${safeSubject}</div></div><div><span class="tag">${N} Questions · ${Math.round(DURATION / 60)} Minutes</span><div class="progress"><span id="progress"></span></div></div></section><section class="panel" style="margin-top:12px"><div class="qhead"><div><span class="qnum" id="qtitle">Question 1 of ${N}</span><div class="sub" id="qsub">एक सही विकल्प चुनें / Choose one option</div></div><span class="tag" id="status">Not Answered</span></div><div class="question"><div id="hiBlock"><div class="langlabel">हिन्दी (HINDI)</div><div class="question-image-frame" id="hiImgWrap" style="display:none"><img id="hi" class="qimage" alt="Hindi question"></div><div id="hiText" class="qtext" style="display:none"></div></div><div id="enBlock" style="margin-top:10px"><div class="langlabel">ENGLISH</div><div class="question-image-frame" id="enImgWrap" style="display:none"><img id="en" class="qimage" alt="English question"></div><div id="enText" class="qtext" style="display:none"></div></div><div class="options" id="options"></div></div><div class="controls"><button class="btn" id="prev">← Previous</button><button class="btn warn" id="clear">Clear Response</button><button class="btn" id="mark">☆ Mark Review</button><button class="btn primary" id="next">Save & Next →</button><button class="btn green" id="submitMain">Submit Test ✓</button></div></section></main><aside class="panel side" id="paletteDrawer" aria-label="Question palette" hidden><div class="drawer-head"><h3>Question Palette</h3><button class="palette-close" id="paletteClose" type="button">✕</button></div><div class="sub">किसी भी प्रश्न पर जाने के लिए नंबर दबाएँ।</div><div class="legend"><span><i class="dot done"></i>Answered</span><span><i class="dot review"></i>Review</span><span><i class="dot"></i>Not answered</span></div><div class="palette" id="palette"></div><div class="controls" style="padding:13px 0 0"><button class="btn green" id="submit" style="width:100%">Submit Test</button></div></aside></div><footer>VS TEST NEET · ${safeTitle}</footer><div class="overlay" id="overlay"><div class="modal" id="modal"></div></div><script>const DATA=${JSON.stringify(compactQs)};const N=DATA.length,DURATION=${DURATION},MAX=${MAX},L=['1','2','3','4'],A={},M=new Set(),T={};let cur=0,sec=DURATION,done=false,lang='BOTH',timer;const started=Date.now(),$=x=>document.getElementById(x);function applyLanguage(){const item=DATA[cur]||{};const hasHi=Boolean(item.hiImg||item.qHi);const hasEn=Boolean(item.enImg||item.qEn);const showHi=(lang==='BOTH'||lang==='HI')&&hasHi||(lang==='EN'&&!hasEn&&hasHi);const showEn=(lang==='BOTH'||lang==='EN')&&hasEn||(lang==='HI'&&!hasHi&&hasEn);$('hiBlock').style.display=showHi?'block':'none';$('enBlock').style.display=showEn?'block':'none';$('langBtn').textContent=lang==='BOTH'?'HI + EN':lang==='HI'?'हिन्दी':'ENGLISH'}$('langBtn').onclick=()=>{lang=lang==='BOTH'?'HI':lang==='HI'?'EN':'BOTH';render()};function render(){const item=DATA[cur]||{},q=cur+1;$('qtitle').textContent='Question '+q+' of '+N;$('qsub').textContent=item.chapter||'एक सही विकल्प चुनें / Choose one option';if(item.hiImg){$('hiImgWrap').style.display='block';$('hi').src=item.hiImg;$('hiText').style.display='none'}else if(item.qHi){$('hiImgWrap').style.display='none';$('hiText').style.display='block';$('hiText').innerHTML=item.qHi}else{$('hiImgWrap').style.display='none';$('hiText').style.display='none'}if(item.enImg){$('enImgWrap').style.display='block';$('en').src=item.enImg;$('enText').style.display='none'}else if(item.qEn){$('enImgWrap').style.display='none';$('enText').style.display='block';$('enText').innerHTML=item.qEn}else{$('enImgWrap').style.display='none';$('enText').style.display='none'}applyLanguage();[cur+1,cur+2].forEach(nxIdx=>{const nx=DATA[nxIdx];if(nx){if(nx.hiImg&&nx.hiImg.charAt(0)==='/'){const im=new Image();im.src=nx.hiImg}if(nx.enImg&&nx.enImg.charAt(0)==='/'&&nx.enImg!==nx.hiImg){const im2=new Image();im2.src=nx.enImg}}});$('status').textContent=A[q]?'Answered':M.has(q)?'Review':'Not Answered';$('options').innerHTML=L.map((l,i)=>{const hiO=(item.optsHi&&item.optsHi[i])||'';const enO=(item.optsEn&&item.optsEn[i])||'';const isGeneric=(!hiO&&!enO)||(/^Option\\s*\\(?\\d/i.test(enO)&&(!hiO||/^विकल्प/i.test(hiO)));const labelText=isGeneric?'Option '+l:(lang==='HI'?(hiO||enO):lang==='EN'?(enO||hiO):(hiO&&enO&&hiO!==enO?hiO+' / '+enO:(hiO||enO)));return '<button class="opt '+(A[q]===i+1?'selected':'')+'" data-v="'+(i+1)+'"><span class="letter">'+l+'</span><span>'+labelText+'</span></button>'}).join('');document.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>{if(done)return;A[q]=+b.dataset.v;render()});$('prev').disabled=cur===0;$('next').textContent=cur===N-1?'Finish & Submit →':'Save & Next →';$('mark').textContent=M.has(q)?'★ Remove Review':'☆ Mark Review';let count=Object.keys(A).length;$('count').textContent=count+' / '+N;$('progress').style.width=(count/N*100)+'%';palette()}function palette(){$('palette').innerHTML=Array.from({length:N},(_,i)=>'<button class="pal '+(A[i+1]?'done':'')+' '+(M.has(i+1)?'review':'')+' '+(i===cur?'current':'')+'" data-i="'+i+'">'+(i+1)+'</button>').join('');document.querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{if(done)return;cur=+b.dataset.i;render();closePalette()})}function closePalette(){$('paletteDrawer').hidden=true;$('paletteToggle').setAttribute('aria-expanded','false')}$('paletteToggle').onclick=()=>{let d=$('paletteDrawer');d.hidden=!d.hidden;$('paletteToggle').setAttribute('aria-expanded',String(!d.hidden))};$('paletteClose').onclick=closePalette;document.addEventListener('click',e=>{if(!$('paletteDrawer').hidden&&!$('paletteDrawer').contains(e.target)&&!$('paletteToggle').contains(e.target))closePalette()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closePalette()});function show(s){$('timer').textContent=[Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(n=>String(n).padStart(2,'0')).join(':')};function modal(s){closePalette();$('modal').innerHTML=s;$('overlay').style.display='grid'}function hide(){$('overlay').style.display='none'}function submit(){if(done){result();return}modal('<h2>Submit Test?</h2><p>Attempted: <b>'+Object.keys(A).length+'</b> · Unanswered: <b>'+(N-Object.keys(A).length)+'</b></p><p>Marking Scheme: +4 correct, −1 incorrect, 0 unattempted.</p><div class="controls"><button class="btn" id="back">Go Back</button><button class="btn green" id="yes">Confirm Submit</button></div>');$('back').onclick=hide;$('yes').onclick=()=>{if(done)return;done=true;sec=Math.max(0,DURATION-Math.floor((Date.now()-started)/1000));show(sec);clearInterval(timer);heartCelebration()}}function heartCelebration(){modal('<div class="heart-stage" role="status"><div class="big-heart" aria-hidden="true">❤️</div><h2>Thank You for Completing Your Test ❤️</h2><p class="sub">Your scorecard & solutions are ready</p><button class="btn primary" id="skipHeart">Skip Animation · View Result</button></div>');const stage=document.querySelector('.heart-stage');['❤️','💗','💙','✨','💕','💙','✨','❤️'].forEach((h,i)=>{let e=document.createElement('span');e.className='float-heart';e.textContent=h;styleLeft=(7+i*12)+'%';e.style.left=styleLeft;e.style.animationDelay=(i*.1)+'s';stage.appendChild(e)});let finished=false;const finish=()=>{if(finished)return;finished=true;result()};$('skipHeart').onclick=finish;setTimeout(finish,1800)}function result(){let correct=0,wrong=0,blank=0;DATA.forEach((item,i)=>{const picked=A[i+1];if(!picked)blank++;else if(picked===item.ans)correct++;else wrong++});const score=correct*4-wrong;const attempted=correct+wrong;const acc=attempted?Math.round(correct/attempted*100):0;const spent=DURATION-sec;const fmt=t=>[Math.floor(t/3600),Math.floor(t%3600/60),t%60].map(n=>String(n).padStart(2,'0')).join(':');try{window.parent.postMessage({type:'VS_CBT_HTML_SUBMIT',score,maxMarks:MAX,correctCount:correct,wrongCount:wrong,unattemptedCount:blank,accuracy:acc,timeTakenSeconds:Math.max(1,spent),answers:A,questionTimes:T},'*')}catch(e){}let rows=DATA.map((item,i)=>{const picked=A[i+1];const cls=!picked?'status-skip':picked===item.ans?'status-good':'status-bad';const st=!picked?'Unattempted':picked===item.ans?'Correct (+4)':'Wrong (-1)';return '<details class="review-row" data-question="'+(i+1)+'"><summary class="'+cls+'">Q'+(i+1)+' · '+(picked?'Selected: ('+picked+')':'Unattempted')+' · Correct: ('+item.ans+') · '+st+'</summary><div class="review-body"><div class="lazy-question"></div>'+(item.expHi||item.expEn?'<p><b>Explanation:</b> '+(item.expHi||'')+' '+(item.expEn||'')+'</p>':'')+'</div></details>'}).join('');modal('<div class="analysis-head"><div><h2>'+${JSON.stringify(String(meta?.title || 'Test'))}+' · Result & Analysis</h2><div class="sub">Scorecard & Question-wise Review (+4 / −1)</div></div><div class="analysis-top-btns" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="close">Close Review</button></div></div><div class="analysis-grid"><div class="analysis-card"><b>'+score+' / '+MAX+'</b><span>Total Score</span></div><div class="analysis-card"><b>'+acc+'%</b><span>Accuracy</span></div><div class="analysis-card"><b class="status-good">'+correct+' (+'+(correct*4)+')</b><span>Correct Answers</span></div><div class="analysis-card"><b class="status-bad">'+wrong+' (-'+wrong+')</b><span>Wrong Answers</span></div><div class="analysis-card"><b>'+blank+'</b><span>Unattempted</span></div><div class="analysis-card"><b>'+fmt(spent)+'</b><span>Time Taken</span></div></div><section class="analysis-section"><h3>Question-wise Solutions & Answer Key</h3>'+rows+'</section>');document.querySelectorAll('details[data-question]').forEach(d=>d.addEventListener('toggle',()=>{let box=d.querySelector('.lazy-question');if(d.open){const it=DATA[+d.dataset.question-1]||{};box.innerHTML=(it.hiImg?'<img src="'+it.hiImg+'" alt="Hindi question">':it.qHi?'<div>'+it.qHi+'</div>':'')+(it.enImg?'<img src="'+it.enImg+'" alt="English question">':it.qEn?'<div style="margin-top:6px">'+it.qEn+'</div>':'')}else box.innerHTML=''}));$('close').onclick=()=>{hide();$('submit').textContent='Open Result & Analysis'}}$('prev').onclick=()=>{if(cur>0){cur--;render()}};$('next').onclick=()=>{if(cur<N-1){cur++;render()}else submit()};$('clear').onclick=()=>{delete A[cur+1];render()};$('mark').onclick=()=>{let n=cur+1;M.has(n)?M.delete(n):M.add(n);render()};$('submit').onclick=submit;if($('submitMain'))$('submitMain').onclick=submit;if($('topSubmit'))$('topSubmit').onclick=submit;show(sec);render();timer=setInterval(()=>{if(done)return;T[cur]=(T[cur]||0)+1;sec=Math.max(0,DURATION-Math.floor((Date.now()-started)/1000));show(sec);if(sec<=0){done=true;clearInterval(timer);heartCelebration()}},1000);</script></body></html>`;
}

function main() {
  if (!fs.existsSync(STORE_FILE)) {
    console.log('[vercelStaticExport] No portal_store.json found, skipping.');
    return;
  }

  const rawStore = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
  const bootstrapPayload = {
    version: rawStore.version || Date.now(),
    portalLogoUrl: rawStore.portalLogoUrl || '',
    globalAttachmentPdf: rawStore.globalAttachmentPdf || null,
    tests: Array.isArray(rawStore.tests) ? rawStore.tests : [],
    deletedTestIds: Array.isArray(rawStore.deletedTestIds) ? rawStore.deletedTestIds : [],
    deletedFolderIds: Array.isArray(rawStore.deletedFolderIds) ? rawStore.deletedFolderIds : [],
    deletedStudentIds: Array.isArray(rawStore.deletedStudentIds) ? rawStore.deletedStudentIds : [],
    deletedAttemptIds: Array.isArray(rawStore.deletedAttemptIds) ? rawStore.deletedAttemptIds : [],
    tickedStudentMap: rawStore.tickedStudentMap || {},
    folders: Array.isArray(rawStore.folders) ? rawStore.folders : [],
    students: Array.isArray(rawStore.students) ? rawStore.students.slice(0, 500) : [],
    attempts: Array.isArray(rawStore.attempts) ? rawStore.attempts.slice(0, 300) : [],
    notifications: Array.isArray(rawStore.notifications) ? rawStore.notifications.slice(0, 50) : [],
  };

  const bootstrapJson = JSON.stringify(bootstrapPayload);

  ensureDir(PUBLIC_STATIC_DIR);
  fs.writeFileSync(path.join(PUBLIC_STATIC_DIR, 'bootstrap.json'), bootstrapJson, 'utf-8');

  if (fs.existsSync(DIST_DIR)) {
    ensureDir(DIST_STATIC_DIR);
    fs.writeFileSync(path.join(DIST_STATIC_DIR, 'bootstrap.json'), bootstrapJson, 'utf-8');
  }

  const isFullStaticExport =
    !process.env.APPLET_ID ||
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.NETLIFY) ||
    Boolean(process.env.CF_PAGES) ||
    process.env.EXPORT_STATIC_STORE === '1';

  if (!isFullStaticExport || !fs.existsSync(DIST_DIR)) {
    console.log(
      `[vercelStaticExport] Exported bootstrap.json (${bootstrapPayload.tests.length} tests, ${bootstrapPayload.folders.length} folders).`
    );
    return;
  }

  const distTestsDir = path.join(DIST_STATIC_DIR, 'test');
  const distPapersDir = path.join(DIST_STATIC_DIR, 'paper');
  const distQimgDir = path.join(DIST_STATIC_DIR, 'qimg');
  const distPdfsDir = path.join(DIST_STATIC_DIR, 'pdfs');
  ensureDir(distTestsDir);
  ensureDir(distPapersDir);
  ensureDir(distQimgDir);
  ensureDir(distPdfsDir);

  let exportedCount = 0;
  for (const testMeta of bootstrapPayload.tests) {
    if (!testMeta || !testMeta.id) continue;
    const safeId = String(testMeta.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
    const parsed = resolvePlayableTestPayload(safeId, testMeta);
    if (!parsed) continue;

    // Export binary question diagrams once per unique source test
    for (const src of parsed.usedSources || []) {
      ensureSourceQimgsExported(src, distQimgDir);
    }

    const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const rawHtml = typeof parsed.rawHtml === 'string' ? parsed.rawHtml : '';
    const hasRawHtml = rawHtml.trim().length > 200;

    // Export compact test metadata + questions JSON with real /static-store/qimg URLs (for Practice, Solutions & PDF)
    const compactQuestions = rawQuestions.map((q, idx) =>
      buildCompactQuestionWithUrls(q, parsed.sourceId || safeId, idx)
    );

    fs.writeFileSync(
      path.join(distTestsDir, `${safeId}.json`),
      JSON.stringify({
        meta: parsed.meta || testMeta,
        questions: compactQuestions,
        rawHtml: '',
        hasRawHtml: true,
      }),
      'utf-8'
    );

    const durMin = Number(testMeta.durationMinutes || parsed.meta?.durationMinutes || 180);
    const durSec = (durMin <= 6 ? durMin * 60 : Math.max(60, durMin)) * 60;
    const rawPaper = hasRawHtml
      ? rawHtml
      : buildStandaloneCbtHtmlForStatic(
          { ...(parsed.meta || {}), ...testMeta, id: safeId },
          rawQuestions,
          parsed.sourceId || safeId
        );
    const patchedPaper = patchHtmlForPortalIframe(rawPaper, {
      testId: safeId,
      title: String(testMeta.title || parsed.meta?.title || 'VS Test'),
      totalQuestions: Number(testMeta.totalQuestions || rawQuestions.length || 90),
      durationSeconds: durSec,
    });
    fs.writeFileSync(path.join(distPapersDir, `${safeId}.html`), patchedPaper, 'utf-8');
    exportedCount++;
  }

  if (fs.existsSync(PDFS_DIR)) {
    for (const file of fs.readdirSync(PDFS_DIR)) {
      if (file.endsWith('.pdf')) {
        fs.copyFileSync(path.join(PDFS_DIR, file), path.join(distPdfsDir, file));
      }
    }
  }

  console.log(
    `[vercelStaticExport] Full static export complete: ${exportedCount} tests exported to dist/static-store/`
  );
}

main();
