# AegisPay OS - Master Setup, Vercel Deployment, Google OAuth & Demo Guide

This single guide covers everything configured for **Localhost (`http://localhost:8787`)**, **Live Vercel (`https://aegispay-orpin.vercel.app`)**, **Google Cloud OAuth 2.0**, **Demo Video Recording**, and **Devpost Submission**.

---

## 1. Localhost Status (`http://localhost:8787`)

Your local `.env` file (git-ignored and never committed to GitHub) is already configured with your live credentials:
- **PayPal Developer Sandbox**: Live (`api-m.sandbox.paypal.com` - Orders v2, Vault v3, Invoicing v2, Subscriptions v1, Partial Refunds)
- **Google Gemini Primary AI**: Live (`gemini-3-flash-preview`)
- **Groq Secondary Failover + Prompt Guard**: Live (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, and `meta-llama/llama-prompt-guard-2-86m`)
- **Google OAuth 2.0**: Live Client ID & Client Secret configured

To start or restart locally at any time:
```bash
npm install
npm test
npm run build
npm start
```
Then open **[http://localhost:8787](http://localhost:8787)**.

---

## 2. Two-Minute Checklist for Live Vercel (`https://aegispay-orpin.vercel.app`)

The serverless API bundle (`api/index.js`) and stateless HMAC session architecture are deployed so `https://aegispay-orpin.vercel.app/api/state` works out-of-the-box with zero `500` errors.

To make your hosted Vercel deployment use your **live PayPal Sandbox, Gemini, Groq, and Google OAuth keys permanently** (without needing to paste them into the top-right **API Keys** modal in the browser):

1. Open **[Vercel Dashboard](https://vercel.com/dashboard)** -> select your **`aegispay`** (`PayPal_Hackathon`) project -> click **Settings** -> **Environment Variables**.
2. Add the following environment variables (copying the values from your local `.env` file) for **Production, Preview, and Development**:
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
   - `AEGIS_KERNEL_SECRET` = `aegispay-deterministic-kernel-hmac-v2-2026`
3. Go to the **Deployments** tab in Vercel, click the `...` menu on the latest deployment, and click **Redeploy** so the serverless function picks up the new environment variables.

> **Instant Browser Alternative**: Even before redeploying Vercel env vars, you (or any hackathon judge) can click **API Keys** in the top navigation bar on `https://aegispay-orpin.vercel.app` and paste PayPal/Gemini/Groq keys. They are transmitted statelessly per request via `x-aegis-credentials` so every Vercel serverless invocation uses live APIs immediately.

---

## 3. Google Cloud Console Redirect URI Checklist (1 Minute)

To ensure clicking **"Continue with Google"** completes the live Google redirect back to both localhost and Vercel without a `redirect_uri_mismatch` warning from Google:

1. Go to **[Google Cloud Console -> Credentials](https://console.cloud.google.com/apis/credentials)**.
2. Click your OAuth 2.0 Web Client (`<YOUR_GOOGLE_CLIENT_ID>.apps.googleusercontent.com`).
3. Under **Authorized JavaScript origins**, ensure both are listed:
   - `http://localhost:8787`
   - `https://aegispay-orpin.vercel.app`
4. Under **Authorized redirect URIs**, ensure both exact callback URLs are listed:
   - `http://localhost:8787/api/auth/google/callback`
   - `https://aegispay-orpin.vercel.app/api/auth/google/callback`
5. Click **Save**.

---

## 4. Load the Chrome Extension Locally (Optional Demo Highlight, 30 Seconds)

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** ON in the top-right corner.
3. Click **Load unpacked** and select `/Users/admin/Documents/PayPal_Hackathon/extension`.
4. Highlight any invoice or payment message on any webpage, right-click **"Scan Payment Text with AegisPay"**, and watch the Side Panel evaluate the payment request and mint a single-use PayPal token.

---

## 5. Under-3-Minute YouTube Demo Video Script (Target: 2:45)

1. **`0:00 - 0:25` | Landing Page, Core Thesis & Google OAuth Sign-In**:
   - Open `https://aegispay-orpin.vercel.app` (or `http://localhost:8787` showing `PayPal: LIVE SANDBOX` and `AI: GEMINI 3.5 -> GROQ`).
   - Toggle the 3 interactive hero scenarios (`$45 Agent Hold`, `EUR/INR Scam Block`, `$2,450.03 Milestone Split`) to explain *"AI Proposes. Deterministic Code Decides. PayPal Moves the Money."*
   - Sign in via **Google OAuth** and enter the **Console**.
2. **`0:25 - 0:55` | `01. Budget & Permits` (Number-Grounded Rules, Vault v3 & `AUTHORIZE` Hold)**:
   - Type a plain-English spending rule in the AI Policy Builder and click **Compile & Apply Rule** (pointing out the **Number-Grounding Guard**).
   - Click **Mint PayPal Vault v3 Token** to show a real Sandbox Vault setup token, then run the **`$45 Desk Lamp (68% Confidence)`** agent purchase -> show PayPal `intent: AUTHORIZE` holding the funds and click **Capture** in the Human-in-the-Loop queue.
3. **`0:55 - 1:30` | `02. Checkout Firewall` (Groq Failover, Multi-Currency Scan, Smart Buttons & Tamper Lab)**:
   - Click **`Test 429 -> Groq`** in the top header to prove sub-second failover from Gemini 3.5 to Groq LPU, then restore primary.
   - Scan a scam request (`BLOCK` via Llama Prompt Guard 2 + deterministic rules), then scan a clean `$45.00` invoice (`ALLOW`) to unlock the **PayPal JS SDK Smart Payment Buttons**.
   - Click **`Mutate Amount ($45 -> $450)`** in the Tamper Lab (`AMOUNT_MUTATED` blocked), then execute a valid capture.
4. **`1:30 - 2:10` | `03. Deal Negotiator` & `04. Photo Refund` (Canvas Vision + Partial Refund)**:
   - In **`03. Deal Negotiator`**, run a Buyer/Seller negotiation with **Prompt Injection Defense** + **Live PayPal `INV2-...` Deposit Invoice**, showing the ZOPA surplus bar and SHA-256 contract.
   - In **`04. Photo Refund`**, render or upload a chipped mug photo on the HTML5 Canvas, adjust the Merchant Matrix slider, and issue a live **PayPal Partial Refund (`$8.40`)** while displaying the unit-economics savings vs. return shipping.
5. **`2:10 - 2:45` | `05. Retention` & `06. PayStream Studio` + `Overview` Fuzzer**:
   - In **`05. Retention`**, trigger the **`"Chargeback / Lawyer"`** preset to demonstrate the instant `0%` circuit breaker + Zapier alert.
   - In **`06. PayStream`**, generate a **`$2,450.03`** milestone plan (proving `0-cent` Largest-Remainder drift across collaborators), click **Issue Live PayPal Invoice (`INV2-...`)**, and open the live `sandbox.paypal.com/invoice/p/#...` link!
   - Finish on **`Overview`** by clicking **Run 1,000-Case Safety Fuzzer** (`1,000 / 1,000 PASSED`) over the AG Grid cryptographic ledger.

---

## 6. Ready-to-Paste Devpost Submission Summary

- **Project Name**: AegisPay OS
- **Tagline**: The Deterministic Trust & Execution Operating System for Agentic Commerce on PayPal - AI Proposes, Deterministic Code Decides, PayPal Moves the Money.
- **Built With**: PayPal REST APIs (Orders v2, Authorizations, Partial Refunds, Invoicing v2, Vault v3, Subscriptions v1, PayPal JS SDK, Webhooks), Google Gemini 3.5, Groq Cloud LPU, Meta Llama Prompt Guard 2, TypeScript, React 19, Tailwind CSS, Express, AG Grid, Model Context Protocol (MCP), Postman, Elastic NDJSON, Zapier, Chrome Extensions MV3, Vercel.
- **Public Repository**: `https://github.com/A-P-S-Bhaidav/PayPal_Hackathon`
- **Live Demo URL**: `https://aegispay-orpin.vercel.app`
