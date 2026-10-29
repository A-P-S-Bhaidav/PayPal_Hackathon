# AegisPay OS v3.0 - Master Setup, Security, Storage & Vercel Deployment Guide

This single guide covers **Localhost (`http://localhost:8787`)**, **Live Vercel (`https://aegispay-orpin.vercel.app`)**, **Mandatory Google OAuth 2.0 & Scrypt Authentication**, **Multi-Tenant Data Persistence**, **One-Command PayRevive Benchmark**, and **Demo Recording**.

---

## 1. Localhost Verification & Startup (`http://localhost:8787`)

Your local `.env` file is strictly git-ignored (`.gitignore` excludes `.env`, `.env.*`, `data/`, and `*.store.json`) and never exposed to the client bundle or browser `localStorage`.

Run all tests, the 500-batch PayRevive benchmark, production build, and local server:
```bash
npm install
npm test
npm run benchmark:payrevive
npm run build
npm start
```
Open **[http://localhost:8787](http://localhost:8787)**.

---

## 2. Where User Data Is Stored & How It Scales

1. **User Accounts & Password Security (`server/store.ts`)**:
   - Email/password accounts hash passwords with Node `crypto.scryptSync` (`N=16384, r=8, p=1`, 64-byte derived key, 16-byte random cryptographic salt) and verify via `crypto.timingSafeEqual`.
   - Google OAuth 2.0 accounts link OpenID Connect email identities to isolated operator records (`OP-...`).
2. **Persistent Storage Locations**:
   - **Local / VM Server**: Persisted atomically to `data/aegispay_store.json` (`0o600` owner-only permissions via write-ahead `.tmp` + `fs.renameSync`, git-ignored).
   - **Vercel Serverless**: Persisted in `/tmp/aegispay_store.json` paired with **Stateless HMAC-SHA256 Sessions** (`HttpOnly; SameSite=Strict` cookie + `aegis_sess_.<claims>.<hmac>` token) so authentication survives serverless cold starts across instances.
3. **Horizontal Scalability & Rate Limiting (`server/security.ts`)**:
   - Each authenticated user gets a strictly isolated `TenantWorkspace` inside a bounded `2,000`-tenant LRU cache.
   - Three-tier Sliding-Window Rate Limiter (`AUTH`: 35 req/min, `MUTATION`: 140 req/min, `READ`: 260 req/min per IP with `10,000`-client LRU cap) enforces HTTP `429` with `RateLimit-*` and `Retry-After` headers.

---

## 3. Vercel Environment Variables Checklist (`https://aegispay-orpin.vercel.app`)

All API keys remain strictly server-side. Configure these in **[Vercel Dashboard](https://vercel.com/dashboard)** -> **`aegispay`** -> **Settings** -> **Environment Variables** (for Production, Preview, and Development):

- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_ENV` = `sandbox`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` = `gemini-3-flash-preview`
- `GROQ_API_KEY`
- `GROQ_TEXT_MODEL` = `openai/gpt-oss-120b`
- `GROQ_VISION_MODEL` = `qwen/qwen3.8-27b`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `AEGIS_KERNEL_SECRET` = `<random-32-byte-hex-secret>`

After saving, trigger **Redeploy** in the Vercel **Deployments** tab so serverless functions load the updated environment.

---

## 4. Google Cloud Console Redirect URIs Checklist

In **[Google Cloud Console -> Credentials](https://console.cloud.google.com/apis/credentials)** -> select your OAuth 2.0 Web Client:

1. **Authorized JavaScript origins**:
   - `http://localhost:8787`
   - `https://aegispay-orpin.vercel.app`
2. **Authorized redirect URIs**:
   - `http://localhost:8787/api/auth/google/callback`
   - `https://aegispay-orpin.vercel.app/api/auth/google/callback`

---

## 5. Under-3-Minute Demo Flow (Target: 2:45)

1. **`0:00 - 0:30` | Spatial Brutalist Home & Mandatory Zero-Trust Sign-In**:
   - Open `https://aegispay-orpin.vercel.app` (Midnight Black + Electric Cobalt + Acid Lime Spatial UI).
   - Interact with the 3D Spatial Pipeline Stage, click **Launch Console**, and authenticate via **Google OAuth** or **Operator Sandbox Handshake** (demonstrating mandatory auth).
2. **`0:30 - 1:15` | `PayRevive` Failed-Payment Recovery & 500-Batch Benchmark**:
   - Open the **`PayRevive`** tab. Inspect a failed `$240.00` renewal (`EXPIRED_CARD_WALLET_SWITCH`): show the **TreeSHAP Waterfall** (`additivityDelta < 1e-6`), **Contextual Bandit Net EV**, **Compliance Gate**, and live **PayPal Backup Funding Invoice (`INV2-...`)**.
   - Test `COMPLIANCE_HARD_DECLINE` (`BLOCKED_BY_COMPLIANCE`) and `NEGATIVE_EV_MICRO_PAYMENT` (`ABSTAIN_NOT_WORTH_COST`), then click **Run 500-Batch Simulation** (`+66.36%` net recovery lift, `0` compliance violations).
3. **`1:15 - 2:00` | `Permits`, `Firewall` & `Deals`**:
   - In **`Permits`**, run the `$45` low-confidence agent purchase (`HOLD` via PayPal `AUTHORIZE`) and capture it.
   - In **`Firewall`**, test **`429 -> Groq`** failover, scan a `$45` invoice to unlock **PayPal Smart Buttons**, and block `MUTATE_AMOUNT` in the Tamper Lab.
4. **`2:00 - 2:45` | `Photo Refund`, `Retention`, `PayStream` & `Overview` Fuzzer**:
   - Issue an `$8.40` PayPal Partial Refund in **`Photo Refund`**, trip the `0%` chargeback circuit breaker in **`Retention`**, issue a penny-exact `$2,450.03` milestone invoice in **`PayStream`**, and run the **1,000-Case Safety Fuzzer** on **`Overview`**.
