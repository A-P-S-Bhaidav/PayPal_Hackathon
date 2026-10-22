# AegisPay OS — Single Master Guide (User Action Checklist, Vercel Deployment, Demo Video Script & Devpost Submission)

This single document contains every instruction, deployment step, demo video script, and submission text required from your side to deploy, record, and submit **AegisPay OS** for the **Build What's Next with PayPal and AI** hackathon.

---

## Section 1: Complete Checklist of What You Need to Do from Your Side

Everything in the codebase—the 5-stage deterministic financial kernel, the PayPal Sandbox REST API v2 gateway, the Google Gemini 2.5 Flash primary engine with automatic Groq Cloud LPU failover, the React 19 + AG Grid institutional frontend, the Manifest V3 Chrome Extension, the MCP + WebMCP servers, the Postman Collection, and all 321 automated tests—is built, verified, and pushed to your GitHub repository (`https://github.com/A-P-S-Bhaidav/PayPal_Hackathon.git`).

Here are the **only 5 actions** needed from your side before submitting on Devpost:

1. **Test on Localhost (Already Running for You)**:
   - Open **[http://localhost:8787](http://localhost:8787)** in your browser to interact with the live application.
2. **Optional — Add Your Free API Keys (PayPal Sandbox, Gemini, Groq)**:
   - AegisPay OS works 100% out-of-the-box with zero configuration via its Cryptographic Signed Sandbox Emulator. However, adding your free PayPal Sandbox, Gemini, and Groq keys switches the status badge to `PAYPAL LIVE SANDBOX` and enables live `Gemini -> Groq` cloud failover.
3. **Deploy to Vercel (3 Minutes)**:
   - Follow **Section 2** below to deploy your GitHub repository to Vercel with one click.
4. **Verify GitHub Repository Settings (1 Minute)**:
   - Open `https://github.com/A-P-S-Bhaidav/PayPal_Hackathon`, ensure visibility is **Public**, and paste your Vercel live URL into the repository **About** website field.
5. **Record the 2:50 Demo Video & Submit on Devpost (15 Minutes)**:
   - Follow the exact second-by-second script in **Section 4** and paste the Devpost submission copy from **Section 5**.

---

## Section 2: Step-by-Step Vercel Deployment Guide

This repository is pre-configured for **Vercel** using:
- [`vercel.json`](vercel.json): Compiles the Vite React 19 frontend into `dist/` and routes all `/api/*`, `/postman/*`, and `/extension.zip` requests to the serverless Express entry point.
- [`api/index.ts`](api/index.ts): Exports the unified AegisPay Express application for Vercel Serverless Functions.

### Option A: Deploy via Vercel Dashboard (Recommended — 2 Minutes)

1. Log in to **[https://vercel.com/new](https://vercel.com/new)** using your GitHub account.
2. Under **Import Git Repository**, locate **`A-P-S-Bhaidav/PayPal_Hackathon`** and click **Import**.
3. Verify the **Build and Output Settings** (Vercel detects these automatically from `vercel.json`):
   - **Framework Preset**: `Vite` (or `Other`)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. Expand **Environment Variables** and add the following keys (all optional, as the deterministic fallback and cryptographic sandbox emulator work automatically if any key is omitted):

| Variable Name | Value / How to Obtain | Purpose |
| :--- | :--- | :--- |
| `PAYPAL_CLIENT_ID` | From [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox) -> Apps & Credentials -> Sandbox | Live PayPal Sandbox OAuth2 & Orders v2 |
| `PAYPAL_CLIENT_SECRET` | From PayPal Developer Dashboard -> Sandbox App Secret | Live PayPal Sandbox OAuth2 & Orders v2 |
| `GEMINI_API_KEY` | From [Google AI Studio](https://aistudio.google.com/apikey) | Primary AI Engine (`gemini-2.5-flash`) |
| `GROQ_API_KEY` | From [Groq Console](https://console.groq.com/keys) | Secondary Automatic Failover Engine (`llama-3.3-70b-versatile`) |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | Default Groq text reasoning model |
| `AEGIS_HMAC_SECRET` | Any random 32+ character string (e.g. `aegispay-prod-hmac-2026-secret-key-991`) | Signs single-use ScamShield review tokens |

5. Click **Deploy**.
6. Wait approximately 45–60 seconds for the build to complete. Vercel will issue your production URL (e.g., `https://paypal-hackathon-aegispay.vercel.app`).
7. Open your Vercel URL and click through all 6 workspace tabs (`[01]` through `[05]` plus `[00] Audit & Fuzzer`) to confirm live operation.

### Option B: Deploy via Vercel CLI (Terminal Alternative)

If you prefer deploying directly from your terminal:
```bash
npx vercel login
npx vercel --prod
```
When prompted:
- **Set up and deploy?** `Y`
- **Link to existing project?** `N`
- **Project name:** `aegispay-os`
- **In which directory is your code located?** `./`

---

## Section 3: How to Obtain & Hot-Swap API Keys (PayPal, Gemini, Groq)

You can configure keys via `.env`, Vercel Environment Variables, or **live inside the running web app** by clicking **"Credentials Vault"** in the top-right navigation bar:

1. **PayPal Sandbox (`PAYPAL_CLIENT_ID` & `PAYPAL_CLIENT_SECRET`)**:
   - Visit [https://developer.paypal.com/dashboard/applications/sandbox](https://developer.paypal.com/dashboard/applications/sandbox).
   - Copy the **Client ID** and **Secret** from your Default Application (or click **Create App**).
2. **Google Gemini Primary AI (`GEMINI_API_KEY`)**:
   - Visit [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) and click **Create API Key**.
3. **Groq Secondary Failover AI (`GROQ_API_KEY`)**:
   - Visit [https://console.groq.com/keys](https://console.groq.com/keys) and click **Create API Key**.
   - **How the Failover Works**: Whenever `gemini-2.5-flash` returns HTTP `429` (rate limit), `5xx`, or exceeds the latency timeout, `server/gemini.ts` automatically fails over to Groq Cloud LPU (`llama-3.3-70b-versatile` for text and `meta-llama/llama-4-scout-17b-16e-instruct` for multimodal vision) and logs an `AI_PROVIDER_FAILOVER` telemetry event into the AG Grid ledger.
   - **How to Demonstrate Failover to Judges**: Click the **`AI ROUTE: GEMINI PRIMARY -> GROQ STANDBY [TEST 429 FAILOVER]`** button in the top header at any time to simulate an upstream Gemini HTTP 429 rate limit and inspect the instantaneous Groq failover telemetry.

---

## Section 4: Second-by-Second Demo Video Recording Guide (Target Length: 2:50)

### Pre-Recording Setup (2 Minutes Before Recording)
1. Ensure the application is running at **[http://localhost:8787](http://localhost:8787)** (or your deployed Vercel URL) in Google Chrome at `1920x1080` resolution.
2. Optional: Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `/Users/admin/Documents/PayPal_Hackathon/extension` so the **AegisPay ScamShield Side Panel** is ready to show.
3. Start your screen and microphone recorder (QuickTime, OBS, or Loom). Do not include any background music.

---

### Scene 1 — The Core Thesis & Architecture Overview (`0:00 – 0:25`)
* **On Screen**: Show the **AegisPay OS** header, the 5-Stage Lifecycle Pipeline ribbon (`[01]` to `[05]`), the **PayPal Sandbox Mode** badge, and click the **`AI ROUTE: GEMINI PRIMARY -> GROQ STANDBY [TEST 429 FAILOVER]`** button in the top bar.
* **What to Say**:
  > *"Every AI payment product faces the same fundamental question: where do you draw the line between LLM autonomy and financial safety? Existing tools only solve isolated slices of a transaction. We built AegisPay OS—the Deterministic Trust and Execution Operating System for Agentic Commerce on PayPal. In AegisPay, AI proposes, deterministic code decides, and PayPal moves the money. Even our AI layer is fault-tolerant: if Google Gemini hits an HTTP 429 rate limit, our router fails over in milliseconds to Groq LPU without dropping a single transaction."*

---

### Scene 2 — Pillar 01: `LupaPermit` & `CashflowCopilot` (`0:25 – 1:00`)
* **On Screen**:
  1. In **`[01] LupaPermit & Cashflow`**, enter `$650` for `MacBook Pro M4 Workstation` and click **"Evaluate Affordability & Sync Agent Permit"**. Point out the True Free Cashflow breakdown and the calibrated agent spending cap.
  2. In the **Zombie Autopay Detector** panel, click **"Tighten Cap"** on `AI Video Render Pro` and **"Revoke"** on `Legacy DesignSaaS Pro`.
  3. In the **Agent Permit Execution Sandbox**, click Preset 2 (`$45 Desk Lamp — 68% AI Confidence -> HOLD`), click **"Execute Agent Payment via LupaPermit"**, and then click **"Approve & Capture ($45.00)"** in the Human-in-the-Loop queue.
* **What to Say**:
  > *"First, before an AI agent spends a cent, CashflowCopilot computes true post-bill disposable cashflow and audits historical PayPal billing agreements to revoke silent zombie subscriptions. When our AI agent requests a $45 purchase with 68% confidence—below its 82% threshold—our monotonic policy kernel downgrades the PayPal Order intent from CAPTURE to AUTHORIZE. The agent cannot approve its own hold; a human operator captures or voids the PayPal authorization in one click."*

---

### Scene 3 — Pillar 02: `ScamShield` Firewall, Tamper Lab & Chrome Extension (`1:00 – 1:35`)
* **On Screen**:
  1. Switch to **`[02] ScamShield Firewall`**. Click Preset 1 (`Courier Advance-Fee Scam`) and click **"Run ScamShield Review"**—show that the PayPal button remains locked (`BLOCK`).
  2. Click Preset 3 (`Legitimate SaaS Invoice — $45.00`) and run the review. Show the issued **Single-Use HMAC-SHA256 Review Token**.
  3. In the **Tamper & Replay Lab**, select **`Mutate Order Amount ($45 -> $450)`** and click **"Execute Attack Simulation"**—show the red `AMOUNT_MISMATCH` block. Then select **`Valid Untampered Capture`** and click **"Execute Valid PayPal Capture"** (`COMPLETED`).
  4. Briefly show the **Chrome Extension Side Panel** scanning highlighted payment text on a webpage.
* **What to Say**:
  > *"Second, ScamShield protects buyers before PayPal checkout opens—both in the web app and via our Manifest V3 Chrome Extension. Scams and prompt injections are blocked immediately. When a legitimate $45 invoice clears, ScamShield mints a single-use HMAC-SHA256 token tied to the exact amount and payee. In our Tamper Lab, mutating the checkout amount to $450 or replaying a used token is deterministically rejected at capture time."*

---

### Scene 4 — Pillar 03 & Pillar 04: `DealForge` & `ClipRefund` Vision (`1:35 – 2:15`)
* **On Screen**:
  1. Switch to **`[03] DealForge Escrow`**. Keep **"Inject Adversarial Prompt Payload"** checked and click **"Run Autonomous Negotiation & PayPal Escrow"**. Show the neutralized prompt injection, the **SHA-256 Smart Contract Hash**, and the settled PayPal deposit.
  2. Switch to **`[04] ClipRefund Vision`**. Select **`Chipped Ceramic Coffee Mug ($28.00)`** and click **"Run Vision Inspection & Issue PayPal Refund"**. Point out the CAD Optical Defect Schematic, the non-monetary Vision JSON telemetry, and the deterministic `$8.40 (30%)` PayPal Partial Refund (`POST /v2/payments/captures/{id}/refund`).
* **What to Say**:
  > *"Third, DealForge lets autonomous Buyer and Seller agents negotiate price, delivery SLA, and deposit terms within private mandates, neutralizing adversarial prompt injection and locking a SHA-256 contract hash into PayPal Orders v2. Fourth, if physical goods arrive damaged, ClipRefund lets the buyer keep the item. Multimodal Vision extracts strictly non-monetary defect telemetry—zero pricing fields in the AI schema—while deterministic merchant rules calculate and execute an instant $8.40 PayPal Partial Refund."*

---

### Scene 5 — Pillar 05 & Security Prover: `ChurnRescue` & `1,000-Case Fuzzer` (`2:15 – 2:50`)
* **On Screen**:
  1. Switch to **`[05] ChurnRescue Dunning`**. Click Preset 3 (`Legal / Chargeback Threat`) and click **"Run Deterministic Retention Engine"**—show the **Circuit Breaker (`0%` discount)** + **Zapier Escalation Dispatched**. Then click Preset 1 (`Step 2 -> 35% Discount`).
  2. Switch to **`[00] Security Audit & Fuzzer`**. Click **"Run 1,000-Case Monotonicity Fuzzer"** (`1,000 / 1,000 Passed`), filter the **AG Grid Cryptographic Ledger**, and point out the **Postman Collection** and **Elastic NDJSON Export** buttons.
* **What to Say**:
  > *"Fifth, ChurnRescue intercepts subscription churn in-app with a fixed 20-35-50% concession ladder, blocks high-utilization accounts from discount gaming, and trips an immediate circuit breaker with Zapier escalation if a user mentions chargeback or lawyer. Finally, in our Security Inspector, we verify our kernel with 321 automated tests, a live 1,000-case property-based monotonicity fuzzer, an interactive AG Grid cryptographic ledger, Elastic NDJSON export, MCP and WebMCP servers, and a Postman Collection. Thank you!"*

---

## Section 5: Ready-to-Paste Devpost Submission Copy

### Project Title
**AegisPay OS — The Deterministic Trust & Execution OS for Agentic Commerce on PayPal**

### Tagline / Elevator Pitch
**AI Proposes. Deterministic Code Decides. PayPal Moves the Money.** A 5-stage financial operating system uniting buyer-side agent permits, pre-checkout scam firewalls, multi-agent negotiation, vision partial refunds, and churn retention on PayPal Sandbox.

### Project Description (Copy-Paste to Devpost)
AI is transforming how people and autonomous agents budget, buy, negotiate, resolve post-purchase disputes, and manage subscriptions. Yet giving an LLM direct pricing or payment authority introduces unacceptable risks: hallucinated discounts, prompt-injection fund drains, spoofed refunds, and single-provider API outages.

**AegisPay OS** solves this with a foundational architectural invariant: **AI handles perception, empathy, and negotiation; deterministic code enforces every cent; and PayPal executes atomic settlement.**

AegisPay OS unifies the **entire 5-Stage Autonomous Commerce Lifecycle**:
1. **LupaPermit & CashflowCopilot (Pre-Spend Governance)**: Calculates true post-bill disposable cashflow, audits PayPal recurring billing permissions (`BA-...`) to revoke silent "zombie" autopays, and issues monotonic spending permits (`ALLOW` -> PayPal `CAPTURE`, `HOLD` -> PayPal `AUTHORIZE` awaiting human capture, `BLOCK` -> policy rejection) to AI agents via **MCP** and **WebMCP**.
2. **ScamShield Pre-Payment Firewall & Chrome Extension**: Evaluates payment requests, invoices, and links using **Google Gemini 2.5 Flash** (with automatic **Groq Cloud LPU failover**) + 18 deterministic fraud rules before unlocking PayPal checkout. Mints single-use **HMAC-SHA256 review tokens** that reject mutated amounts, expired tokens, payee swaps, and replay attacks at capture time. Includes a **Manifest V3 Chrome Extension** with right-click scanning and Side Panel inspection.
3. **DealForge Multi-Agent Negotiation & Smart Escrow**: Autonomous Buyer and Seller agents negotiate price, delivery SLA, revisions, and deposit terms within private mandates protected by a prompt-injection firewall, locking a **SHA-256 Smart Contract** into a PayPal Order.
4. **ClipRefund Multimodal Vision Damage Grader**: Buyers upload one photo of a damaged item. Multimodal AI Vision outputs strictly non-monetary defect telemetry (zero pricing fields exist in the AI schema), while a deterministic merchant matrix computes and executes an instant **PayPal Captures Partial Refund** (`POST /v2/payments/captures/{id}/refund`) and blocks photo replay attacks via SHA-256 image digests.
5. **ChurnRescue In-App Retention Interceptor**: Intercepts subscription declines and cancellations with empathetic AI dialogue constrained by a fixed concession ladder (`20% -> 35% -> 50% floor`), blocks accounts with `>=60%` feature utilization from discount gaming, enforces atomic row locks against duplicate captures, and trips a hard circuit breaker (`0%` discount + outbound **Zapier** webhook escalation) if `"chargeback"`, `"dispute"`, or `"lawyer"` is detected.

### Tools, Models & Sponsor Technologies Used
* **PayPal Developer Platform**: OAuth2 `/v1/oauth2/token`, Orders v2 `/v2/checkout/orders` (`CAPTURE` & `AUTHORIZE` intents), Authorizations Capture/Void, Captures Partial Refund `/v2/payments/captures/{id}/refund`, Billing Permissions Audit, and HMAC-SHA256 Signed Webhooks.
* **Google Gemini (`gemini-2.5-flash`) + Groq Cloud LPU (`llama-3.3-70b-versatile` / `llama-4-scout-17b-16e-instruct`)**: Multi-provider AI routing mesh that uses Gemini 2.5 Flash as primary and automatically fails over to Groq LPU on HTTP `429` rate limits or timeouts.
* **AG Grid (`ag-grid-react` v33)**: Powers the interactive Cryptographic Decision & PayPal Execution Ledger.
* **Postman**: Ready-to-import Postman Collection v2.1 (`postman/AegisPay_Collection.json`).
* **Elastic**: One-click Elasticsearch Bulk NDJSON telemetry exporter (`/api/export/elastic-ndjson`).
* **Zapier**: Automated outbound circuit-breaker escalation webhook integration.
* **Vercel & Render**: Configured with `vercel.json` + `api/index.ts` for Vercel Serverless deployment and `render.yaml` + `Dockerfile` for Render container deployment.
* **MCP & WebMCP**: Standalone Model Context Protocol server (`mcp-server/index.mjs`) and browser-native `navigator.modelContext` registration (`src/webmcp.ts`).
