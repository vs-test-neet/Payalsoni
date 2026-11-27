# AI Studio — Deploy Patch (Vs Tests)

> **Kaise use karein:** AI Studio ke code editor mein **search (Ctrl+F)** karke exact text dhundo,
> phir sirf wahi line/block replace karke **Deploy** kar do.
> Line numbers AI Studio mein alag ho sakte hain — **text se match karo, line number se nahi.**

Total **4 changes** (3 required + 1 optional).

---

## ✅ Change 1 — Telegram link (REQUIRED)

**Find:**
```js
                        href: `https://t.me/vstestneet`,
```

**Replace with:**
```js
                        href: `https://t.me/neettest2027h`,
```

> Sirf ek jagah hai (drawer menu ka Telegram button). Baaki `t.me/share/url` share button ko mat chhedo.

---

## ✅ Change 2 — Logout par purana student data saaf (REQUIRED)

Ye **"kisi aur ka ID dikh raha hai"** bug ka main fix hai.
Pehle logout par sirf session clear hota tha; email/password fields, students cache aur
attempts cache (jisme doosre students ke naam/email hote hain) saved reh jaate the.

**Find (poora block):**
```js
    Ln = () => {
      ye(null), He(!1);
      try {
        localStorage.removeItem(`neet_cbt_student_session`),
          localStorage.removeItem(`vs_neet_my_device_attempt_ids_v1`),
          h || (localStorage.removeItem(`vs_neet_2027_attempts_cache`), localStorage.removeItem(`vs_neet_2027_students_cache_v1`));
      } catch {}
      vw().catch(() => {}), vn(`Logged out of Student account.`, `info`);
    },
```

**Replace with:**
```js
    Ln = () => {
      ye(null), He(!1);
      try {
        we(``), Ee(``), Oe(``), Me(``), Ae(dE[0]), O(``), Se(`login`), xe(!1), Fe(!1);
      } catch {}
      try {
        localStorage.removeItem(`neet_cbt_student_session`),
          localStorage.removeItem(`vs_neet_my_device_attempt_ids_v1`),
          localStorage.removeItem(`vs_neet_2027_attempts_cache`),
          localStorage.removeItem(`vs_neet_2027_students_cache_v1`),
          sessionStorage.removeItem(`vs_neet_active_test_session_v1`);
      } catch {}
      try {
        ve([]), xe(!1);
      } catch {}
      vw().catch(() => {}), vn(`Logged out of Student account.`, `info`);
    },
```

**Kya badla:**
- Login form ke saare fields clear (email `we`, password `Ee`, naam `Oe`, security answer `Me`, security question `Ae`, error `O`)
- "Remember me" (`h`) chahe on ho ya off — **hamesha** attempts + students cache delete
- Active test session bhi delete

---

## ✅ Change 3 — Topper list mein email/ID mask (REQUIRED)

Result page ke "Top 10 Toppers" table mein agar kisi student ka naam email hai
(misal `rahul.sharma@gmail.com`), to ab wo `ra***@gmail.com` dikhega.

**Find:**
```js
                    name: e.studentName || `NEET Student`,
```

**Replace with:**
```js
                    name: (() => { let n = String(e.studentName || `NEET Student`).trim(); if (n.includes(`@`)) { let p = n.split(`@`); return p[0].slice(0, 2) + `***@` + p[1]; } return n; })(),
```

> Ye sirf **display** ke liye hai — asli data/database change nahi hota.

---

## 🔧 Change 4 — PYQ cards par "Syllabus PDF" hide (OPTIONAL)

PYQ papers mein syllabus PDF nahi hota, isliye card par wo button hatana hai.

**Find:**
```js
                                                        !e.isPdfOnly &&
```

**Replace with:**
```js
                                                        !e.isPdfOnly && !String(e.id || ``).startsWith(`pyq_`) &&
```

---

## ⚠️ DEPLOY MAT KARO — ye local dev hack hai

Local build mein login gate bypass hai (bina login ke browse karne ke liye).
**AI Studio mein ye change paste mat karna:**

```js
        !1 && !E && !h      // ❌ mat deploy karo
```

Original live code yahi rehna chahiye:

```js
        !E && !h            // ✅ original
```

---

## Deploy ke baad verify karein

1. Site kholo → menu → **Telegram** button → `https://t.me/neettest2027h` khule ✅
2. Login karo → Logout karo → Login page par **email/naam pre-filled nahi** hona chahiye ✅
3. Koi test submit karo → Topper list mein kisi ka **email raw na dikhe** ✅
4. PYQ folder ke test cards par **"Syllabus PDF" button na dikhe** ✅ (agar Change 4 lagaya)
