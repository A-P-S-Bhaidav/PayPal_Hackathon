# AegisPay OS — Complete Step-by-Step Guide (Google OAuth 2.0, PayPal Sandbox, AI Keys, Vercel Deployment & Demo Script)

This single document lists everything needed from your side and exactly how to configure it step-by-step.

---

## Step 1: Test Immediately on Localhost (Already Running)

The application is running live right now at **[http://localhost:8787](http://localhost:8787)**.
- Every feature—including the **Interactive Hero Pipeline Simulator**, **Google OAuth 2.0 Account Chooser**, **Email Sign Up / Sign In**, **Gemini-to-Groq HTTP 429 Failover Simulation**, and all **5 PayPal Commerce Modules**—works immediately out-of-the-box without requiring any external keys.
- When you add your live credentials in **Step 2** and **Step 3** below, the system automatically upgrades from the local sandbox emulator to live Google OAuth 2.0 redirect, live `api-m.sandbox.paypal.com`, and live Gemini/Groq APIs.

---

## Step 2: How to Set Up Google OAuth 2.0 Step-by-Step (3 Minutes)

To enable live Google OAuth redirect (`accounts.google.com/o/oauth2/v2/auth`) with your own Google Cloud project:

1. Go to the **[Google Cloud Console — Credentials Page](https://console.cloud.google.com/apis/credentials)**.
2. Create a new project (or select an existing project) in the top bar.
3. Click **"+ CREATE CREDENTIALS"** -> **"OAuth client ID"**.
   - *(If prompted to configure the OAuth consent screen first: select **External**, enter App Name `AegisPay OS`, enter your email, and click Save and Continue).*
4. For **Application type**, select **Web application**.
5. Under **Authorized JavaScript origins**, add:
   - `http://localhost:8787`
   - Your Vercel URL once deployed (e.g. `https://paypal-hackathon-aegispay.vercel.app`)
6. Under **Authorized redirect URIs**, add:
   - `http://localhost:8787/api/auth/google/callback`
   - Your Vercel callback URL (e.g. `https://paypal-hackathon-aegispay.vercel.app/api/auth/google/callback`)
7. Click **Create** and copy your **Client ID** (`...apps.googleusercontent.com`) and **Client Secret** (`GOCSPX-...`).
8. **Where to Paste Them**:
   - **Option A (In-App Vault)**: Click **"Credentials & OAuth Vault"** in the left sidebar of the console at `http://localhost:8787` and paste `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
   - **Option B (`.env` / Vercel)**: Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to your `.env` file or Vercel Environment Variables.

---

## Step 3: How to Obtain PayPal Sandbox, Gemini & Groq Keys (3 Minutes)

1. **PayPal Developer Sandbox (`PAYPAL_CLIENT_ID` & `PAYPAL_CLIENT_SECRET`)**:
   - Go to **[https://developer.paypal.com/dashboard/applications/sandbox](https://developer.paypal.com/dashboard/applications/sandbox)**.
   - Copy the **Client ID** and **Secret** from your Default Sandbox App.
2. **Google Gemini Primary AI (`GEMINI_API_KEY`)**:
   - Go to **[https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)** and click **Create API Key**.
3. **Groq Secondary Failover AI (`GROQ_API_KEY`)**:
   - Go to **[https://console.groq.com/keys](https://console.groq.com/keys)** and click **Create API Key**.

---

## Step 4: How to Deploy to Vercel Step-by-Step (2 Minutes)

This repository includes [`vercel.json`](vercel.json) and [`api/index.ts`](api/index.ts) pre-configured for Vercel Serverless deployment.

1. Go to **[https://vercel.com/new](https://vercel.com/new)** and sign in with GitHub.
2. Find **`A-P-S-Bhaidav/PayPal_Hackathon`** and click **Import**.
3. Keep the auto-detected settings:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Expand **Environment Variables** and add:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `GEMINI_API_KEY`
   - `GROQ_API_KEY`
   - `AEGIS_KERNEL_SECRET` (set to any random 32+ character string)
5. Click **Deploy**. Your full-stack platform will be live on your `.vercel.app` domain in ~60 seconds.

---

## Step 5: Second-by-Second Demo Video Recording Guide (Target: 2:50)

1. **`0:00 – 0:30` (Full-Screen Interactive Landing Page & Google OAuth)**:
   - Open `http://localhost:8787` (or your Vercel URL).
   - Click through the **3 Live Kernel Pipeline Scenarios** in the right hero card (`01. Agent $45 Hold`, `02. Scam $390 Block`, `03. Vision $8.40 Refund`).
   - Click **"Continue with Google"** to demonstrate Google OAuth 2.0 sign-in, then click **"Launch Interactive Console"**.
2. **`0:30 – 1:05` (`01. PermitGuard & Cashflow`)**:
   - Show the **Radial Cashflow Gauges**, drag the **Proposed Purchase Slider**, and click **"Recalculate Cap"**.
   - Click **"Tighten"** and **"Revoke"** on the zombie PayPal autopay agreements.
   - Click **`$45 Lamp (68% Hold)`**, execute the agent payment (`intent: AUTHORIZE`), and click **"Capture"** in the Human-in-the-Loop queue.
3. **`1:05 – 1:40` (`02. ThreatGate Firewall` & AI Failover)**:
   - In the left sidebar, click **"Active: Gemini 2.5 Flash — Click to Simulate 429 Failover"** to demonstrate instant failover to **Groq Cloud LPU**.
   - Scan **`1. Customs Scam ($390)`** (`BLOCK`), then scan **`3. Valid Invoice ($45)`** to mint a single-use HMAC-SHA256 review token.
   - Click **`Mutate Amount ($45 -> $450)`** (`REJECTED: AMOUNT_MISMATCH`), then click **`Valid Capture ($45.00)`** (`PAYPAL ORDER CAPTURED`).
4. **`1:40 – 2:15` (`03. DealForge Escrow` & `04. VisionClaim Refund`)**:
   - In **`03. DealForge Escrow`**, click **"Launch Multi-Agent Deal & Settle PayPal Escrow"** to show the 3-round convergence, stripped prompt injection, and SHA-256 contract deposit capture.
   - In **`04. VisionClaim Refund`**, select **`Chipped Mug ($28)`** and click **"Run Vision Grader & Issue Instant PayPal Partial Refund"** (`$8.40 / 30%` PayPal refund).
5. **`2:15 – 2:50` (`05. RetainGuard Dunning` & `00. Audit Ledger & Fuzzer`)**:
   - In **`05. RetainGuard Dunning`**, click **`Simulate "Chargeback / Lawyer" Circuit Breaker`** (`TRIPPED -> ZAPIER DISPATCHED`).
   - In **`00. Audit Ledger & Fuzzer`**, click **"Run 1,000-Case Safety Fuzzer"** (`1,000 / 1,000 PASSED`) and filter the **AG Grid Cryptographic Ledger**.
