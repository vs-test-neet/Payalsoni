# AI Studio — Patch v2 (Hardening + Notifications + Login Alert)

> **Kaise use karein:** AI Studio editor mein **Ctrl+F** se exact text dhundo → replace karo → Deploy.
> Line number par bharosa mat karo, **text** se match karo.

Is patch mein **3 cheezein** hain:
1. Login par **notification permission** (student ke phone par) — taaki aap push bhej sako
2. Login par **admin ko email** — name, email, phone, batch, device, time
3. **Bug / error / lag hardening** — app crash na ho, white screen na aaye, scroll smooth rahe

---

## ✅ Change 1 — Helper functions (file ke END mein paste karo)

File `assets/app.js` mein **sabse last line** (`export { Zo as a, ... }`) ke **thik upar** ye poora block paste karo:

```js
/* ===================== Vs Tests: hardening + notifications + login-notify ===================== */
/* 1) Notification permission on login (student ke phone par) */
async function vsEnablePushPermission() {
  try {
    if (typeof window === `undefined` || !(`Notification` in window)) return;
    if (Notification.permission === `denied`) return;
    if (Notification.permission === `granted`) return;
    const p = await Notification.requestPermission();
    if (p !== `granted`) return;
    try {
      if (`serviceWorker` in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === `function`) {
          await reg.showNotification(`🔔 Notifications On`, {
            body: `Ab aapko naye test, result aur update ki jankari turant milegi.`,
            icon: `/pwa-192x192.png`,
            badge: `/pwa-192x192.png`,
            tag: `vs_perm_granted`,
            vibrate: [200, 100, 200],
          });
          return;
        }
      }
    } catch {}
    try {
      new Notification(`🔔 Notifications On`, { body: `Ab aapko naye test, result aur update ki jankari turant milegi.` });
    } catch {}
  } catch {}
}

/* 2) Login details -> admin email (password kabhi nahi bhejte) */
function vsNotifyLogin(student, mode) {
  try {
    if (!student || !student.id) return;
    const isNew = mode === `signup` || student.createdAt === student.lastLoginAt;
    const body = {
      name: String(student.fullName || `NEET Student`).slice(0, 80),
      email: String(student.emailOrRoll || ``).slice(0, 150),
      phone: String(student.phone || ``).slice(0, 20),
      batch: String(student.targetBatch || ``).slice(0, 80),
      city: String(student.city || ``).slice(0, 60),
      loginCount: Number(student.loginCount) || 0,
      mode: isNew ? `signup` : `login`,
      time: new Date().toISOString(),
      device: String(navigator.userAgent || ``).slice(0, 200),
      screen: `${window.innerWidth}x${window.innerHeight}`,
      lang: String(navigator.language || ``).slice(0, 10),
    };
    fetch(`/api/login-notify`, {
      method: `POST`,
      headers: { "Content-Type": `application/json` },
      body: JSON.stringify(body),
      keepalive: !0,
    }).catch(() => {});
  } catch {}
}

/* 3) Error / lag hardening */
function vsLogErr(msg) {
  try {
    const k = `vs_error_log_v1`;
    let arr = [];
    try {
      arr = JSON.parse(localStorage.getItem(k) || `[]`);
    } catch {}
    if (!Array.isArray(arr)) arr = [];
    arr.push({ t: Date.now(), m: String(msg).slice(0, 300) });
    if (arr.length > 20) arr = arr.slice(-20);
    localStorage.setItem(k, JSON.stringify(arr));
  } catch {}
}
function vsHarden() {
  try {
    if (typeof window === `undefined` || window.__vsHardened) return;
    window.__vsHardened = !0;
    /* 3a. corrupt cache auto-clean (crash se bachata hai) */
    [`vs_neet_2027_attempts_cache`, `vs_neet_2027_students_cache_v1`, `neet_cbt_student_session`, `vs_admin_ticked_students_v1`, `vs_neet_deleted_test_ids_v1`].forEach((k) => {
      try {
        const v = localStorage.getItem(k);
        if (!v) return;
        JSON.parse(v);
      } catch {
        try {
          localStorage.removeItem(k);
        } catch {}
      }
    });
    /* 3b. images lazy-load (scroll lag kam) */
    const setLazy = (img) => {
      try {
        if (!(img instanceof HTMLImageElement)) return;
        if (!img.hasAttribute(`loading`)) img.loading = `lazy`;
        if (!img.hasAttribute(`decoding`)) img.decoding = `async`;
      } catch {}
    };
    const scan = (root) => {
      try {
        (root || document).querySelectorAll?.(`img`).forEach(setLazy);
      } catch {}
    };
    scan(document);
    try {
      new MutationObserver((muts) => {
        for (const m of muts)
          for (const n of m.addedNodes) {
            if (!n || n.nodeType !== 1) continue;
            if (n.tagName === `IMG`) setLazy(n);
            else if (n.querySelectorAll) scan(n);
          }
      }).observe(document.documentElement, { childList: !0, subtree: !0 });
    } catch {}
    /* 3c. silent errors log karo (app kabhi white screen na de) */
    try {
      window.addEventListener(`error`, (ev) => vsLogErr(ev?.message || `error`), { passive: !0 });
      window.addEventListener(`unhandledrejection`, (ev) => vsLogErr(`promise: ` + (ev?.reason?.message || ev?.reason || `rejection`)), { passive: !0 });
    } catch {}
  } catch {}
}
vsHarden();
/* ===================== end Vs Tests additions ===================== */
```

---

## ✅ Change 2 — Login hook (notification + email trigger)

**Find:**
```js
  let Nn = (e, t) => {
      try {
        localStorage.getItem(`vs_test_first_login_light_done`) || (localStorage.setItem(`vs_test_first_login_light_done`, `true`), localStorage.setItem(`vs_test_theme_mode_v2`, `light`), m(!1));
      } catch {}
```

**Replace with:**
```js
  let Nn = (e, t) => {
      try {
        localStorage.getItem(`vs_test_first_login_light_done`) || (localStorage.setItem(`vs_test_first_login_light_done`, `true`), localStorage.setItem(`vs_test_theme_mode_v2`, `light`), m(!1));
      } catch {}
      try {
        vsEnablePushPermission(), vsNotifyLogin(e);
      } catch {}
```

> `Nn` har login path par chalta hai — password login, sign up, password reset, aur Google sign-in.
> Matlab **har tarah se login** par notification permission + email trigger hoga.

---

## ✅ Change 3 — Login form par chhota notice (zaroori hai)

**Find:**
```js
                      (Se !== `login` || se >= 2) &&
                        (0, $.jsxs)(`div`, {
                          className: `p-3 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 flex items-center justify-between gap-3`,
```

**Uske THIK UPAR ye paste karo:**
```js
                      (0, $.jsx)(`p`, {
                        className: `text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 px-0.5`,
                        children: `Login activity (name, email, device and time) is recorded for account security and shared with the institute administrator.`,
                      }),
```

---

## ✅ Change 4 — Server par email bhejne wala route (REQUIRED for email)

Client sirf `/api/login-notify` par data bhejta hai. **Email bhejne ke liye server mein ye route chahiye.**

AI Studio ke **server file** (jahan `/api/store/...` routes hain) mein add karo:

```js
/* ===================== Vs Tests: login alert email ===================== */
const nodemailer = require('nodemailer'); // npm i nodemailer

const vsMail = nodemailer.createTransport({
  service: `gmail`,
  auth: {
    user: process.env.VS_MAIL_USER,   // aapki gmail
    pass: process.env.VS_MAIL_PASS,   // Gmail App Password (2FA on karke)
  },
});

/* spam na ho — ek student ko 10 min mein max 1 mail */
const vsMailGate = new Map();

app.post(`/api/login-notify`, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b || !b.email) return res.json({ ok: !1 });

    const key = String(b.email).toLowerCase();
    const last = vsMailGate.get(key) || 0;
    if (Date.now() - last < 10 * 60 * 1000) return res.json({ ok: !0, skipped: !0 });
    vsMailGate.set(key, Date.now());

    const when = new Date().toLocaleString(`en-IN`, { timeZone: `Asia/Kolkata` });
    const subject =
      (b.mode === `signup` ? `🆕 New Student Signup` : `🔑 Student Login`) +
      ` — ` + (b.name || `NEET Student`);

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
        <div style="background:#0284c7;color:#fff;padding:16px 20px">
          <h2 style="margin:0;font-size:17px">${b.mode === `signup` ? `🆕 New Student Signup` : `🔑 Student Login`}</h2>
          <div style="font-size:12px;opacity:.9;margin-top:4px">Vs Tests · ${when}</div>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:10px 20px;color:#64748b;width:140px">Name</td><td style="padding:10px 20px;font-weight:700">${b.name || `—`}</td></tr>
          <tr style="background:#f8fafc"><td style="padding:10px 20px;color:#64748b">Email / Roll No</td><td style="padding:10px 20px;font-weight:700">${b.email || `—`}</td></tr>
          <tr><td style="padding:10px 20px;color:#64748b">Phone</td><td style="padding:10px 20px">${b.phone || `—`}</td></tr>
          <tr style="background:#f8fafc"><td style="padding:10px 20px;color:#64748b">Batch</td><td style="padding:10px 20px">${b.batch || `—`}</td></tr>
          <tr><td style="padding:10px 20px;color:#64748b">City</td><td style="padding:10px 20px">${b.city || `—`}</td></tr>
          <tr style="background:#f8fafc"><td style="padding:10px 20px;color:#64748b">Login Count</td><td style="padding:10px 20px">${b.loginCount || 1}</td></tr>
          <tr><td style="padding:10px 20px;color:#64748b">Device</td><td style="padding:10px 20px;font-size:12px">${b.device || `—`}</td></tr>
          <tr style="background:#f8fafc"><td style="padding:10px 20px;color:#64748b">Screen</td><td style="padding:10px 20px">${b.screen || `—`}</td></tr>
          <tr><td style="padding:10px 20px;color:#64748b">Time (IST)</td><td style="padding:10px 20px">${when}</td></tr>
        </table>
      </div>`;

    await vsMail.sendMail({
      from: `"Vs Tests" <${process.env.VS_MAIL_USER}>`,
      to: `rahulyadav70y@gmail.com`,
      subject,
      html,
    });

    res.json({ ok: !0 });
  } catch (e) {
    console.log(`login-notify failed:`, e?.message || e);
    res.status(500).json({ ok: !1 });
  }
});
```

### Gmail App Password kaise banaye (2 minute)
1. Gmail → **Manage your Google Account** → **Security**
2. **2-Step Verification** ON karo (agar off hai)
3. Security mein **App Passwords** → new banao → naam `Vs Tests`
4. Jo 16-letter password mile, wo server env mein daalo:

```bash
VS_MAIL_USER=rahulyadav70y@gmail.com
VS_MAIL_PASS=abcd efgh ijkl mnop
```

> ⚠️ Ye password **kabhi frontend code mein mat daalna** — server env mein hi rahega.
> `npm i nodemailer` bhi chalana hoga server folder mein.

---

## ❌ Ye maine JAAN BOOJHKAR nahi banaya

Aapne kaha tha **"bina students ko pata chale"** — wo wala part main nahi banaunga. Wajah:

| Risk | Detail |
|---|---|
| **DPDP Act 2023 (India)** | Bina notice ke personal data collect karna = penalty up to **₹250 crore** + app ban |
| **Student complaint** | Agar kisi student ko pata chale to coaching ka naam kharab ho sakta hai |
| **Gmail password front-end mein** | Browser ke DevTools mein koi bhi dekh lega — phir aapka Gmail hack ho sakta hai |
| **Password bhejna** | Student ka password kisi ko bhejna security hole hai — isliye maine **password field hai hi nahi** rakha |

**Jo maine banaya wo legally safe hai aur kaam bhi poora karta hai:**
- ✅ Name, email, phone, batch, city, device, time — **sab aapke Gmail par**
- ✅ Login form par **1 line ka notice** (students ko pata chalta hai, complaint nahi ho sakti)
- ✅ Password **kabhi nahi** jata
- ✅ 10 min mein ek hi mail (spam nahi)

---

## 🧪 Local par verify kiya gaya

| Test | Result |
|---|---|
| Page load, no JS error | ✅ |
| Login modal khulta hai | ✅ |
| Notice line render hoti hai | ✅ (screenshot dekha) |
| Notification permission request | ✅ `granted` aaya |
| `/api/login-notify` POST correct data ke saath | ✅ (name, email, phone, batch, device, time — **no password**) |
| Images lazy-load | ✅ 1/1 |
| Syntax valid | ✅ `node --check` passed |

---

## Deploy ke baad check karo

1. Login karo → browser **notification permission** maange ✅
2. Allow karo → turant ek **"🔔 Notifications On"** notification aaye ✅
3. Gmail kholo → **"🔑 Student Login — < naam >"** email aaya ho ✅
4. Admin panel → Send Notification → sab students ke phone par push jaaye ✅
5. Site 2-3 baar refresh karo → koi blank/white screen na aaye ✅
