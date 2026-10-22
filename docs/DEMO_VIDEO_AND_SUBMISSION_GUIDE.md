# 🎬 AegisPay — Complete Demo Video Script, Deployment Guide & Submission Playbook

This guide contains everything you need to:
1. **Deploy AegisPay live in 2 minutes** (on Render)
2. **Record a winning <3:00 Demo Video** (with exact second-by-second script and clicks)
3. **Copy-paste your Devpost Submission Form**

---

## Part 1: What I Need From Your Side (Action Checklist)

Everything in the codebase, Chrome Extension, MCP Server, Postman Collection, and 313-test suite is **already built, verified, and pushed to your GitHub repo (`https://github.com/A-P-S-Bhaidav/PayPal_Hackathon.git`)**.

Here are the **only 4 things** you need to do on your side:

1. **Make sure your GitHub Repository `About` section shows the MIT License**:
   - Visit `https://github.com/A-P-S-Bhaidav/PayPal_Hackathon`
   - Ensure visibility is **Public** (required by hackathon rules). GitHub automatically detects the root `LICENSE` (MIT) file we committed and displays **MIT license** in the top `About` sidebar.
2. **Get Your Free PayPal Sandbox & Gemini API Keys (5 Minutes)**:
   - **PayPal Sandbox**: Log in to [developer.paypal.com/dashboard/applications/sandbox](https://developer.paypal.com/dashboard/applications/sandbox), click **Default Application** (or **Create App**), and copy your **Client ID** and **Secret**.
   - **Google Gemini API Key**: Visit [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) and copy a free Gemini API key.
   - *(Note: Even if a judge runs the app without keys, AegisPay's Cryptographic Signed Sandbox Emulator works 100% automatically—and pasting your keys in Render or in the UI Vault activates live `api-m.sandbox.paypal.com` calls!)*
3. **Deploy to Render (2 Minutes — Step-by-Step Below)**:
   - Connect your GitHub repo `A-P-S-Bhaidav/PayPal_Hackathon` on [dashboard.render.com](https://dashboard.render.com) to get your public `https://aegispay-paypal-ai-os.onrender.com` URL.
4. **Record the 2:45 Demo Video & Upload to YouTube (Unlisted or Public)**:
   - Follow the exact timestamped script in **Part 3** below!

---

## Part 2: 1-Click Cloud Deployment Guide (Render)

We included a pre-configured [`render.yaml`](../render.yaml) Blueprint and [`Dockerfile`](../Dockerfile) at the root of the repository.

### Option A: Render Blueprint (Fastest — 1 Click)
1. Go to **[dashboard.render.com/blueprints](https://dashboard.render.com/blueprints)** and click **New Blueprint Instance**.
2. Select your repository: **`A-P-S-Bhaidav/PayPal_Hackathon`**.
3. Render will automatically detect `render.yaml`.
4. Enter your environment variables when prompted (or leave blank to use the built-in Signed Sandbox Emulator and enter them later via the UI Vault):
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `GEMINI_API_KEY`
5. Click **Apply**. Within ~90 seconds, your live URL will be live!

### Option B: Render Standard Web Service
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Environment**: `Node`

---

## Part 3: Step-by-Step Demo Video Guide (Target Length: 2 Minutes 45 Seconds)

> **Hackathon Rule Reminder**: Must be **under 3 minutes**, show the working project functioning on screen, use **no copyrighted background music or third-party trademarks without permission**, and be uploaded to **YouTube (Public)**.

### Pre-Recording Setup (30 Seconds before hitting Record)
1. Open Terminal 1 in `/Users/admin/Documents/PayPal_Hackathon` ready to run `npm test`.
2. Have the AegisPay web app open in Chrome at `http://localhost:8787` (or your live Render URL) on the **🌐 Command & AG Grid Ledger** tab.
3. Have `chrome://extensions` open in a second tab with the **AegisPay ScamShield Side Panel** unpacked and open on the right side of the browser.

---

### 🎙️ Scene-by-Scene Script & Clicks

#### **0:00 – 0:25 | The Hook & Core Thesis (25s)**
- **On Screen**: Show the **AegisPay Command Center** hero dashboard and the 5-Stage Lifecycle strip.
- **What to Say**:
  > *"When AI agents and LLMs touch money, two things go wrong: either an AI is given too much freedom—risking hallucinated discounts, prompt-injection attacks, and unauthorized charges—or developers build fragmented point tools that only protect one step of a transaction. Meet **AegisPay**: the Deterministic Trust and Execution OS for Agentic Commerce on PayPal. Our core rule is simple: **AI Proposes. Deterministic Code Decides. PayPal Moves the Money.**"*

#### **0:25 – 1:00 | Stage 1: LupaPermit™ & Cashflow Copilot (35s)**
- **On Screen**:
  1. Click Tab **1. LupaPermit™ & Cashflow Copilot**.
  2. Point to **CashflowCopilot™** on the left (showing Rent, Loans, and PayPal Autopays deducted to compute True Free Cashflow) and click **Revoke Permission** on the dormant 412-day Zombie PayPal Autopay in the middle column.
  3. On the right column, click **Scenario 2: $45 Desk Lamp (Confidence 68% < 82% Threshold)**.
  4. Show the new **Held PayPal Authorization (`AUTH-...`)** appear in the Human Approval Queue, then click **Approve & Capture**.
- **What to Say**:
  > *"Stage 1 is buyer-side governance. AegisPay scans PayPal billing agreements to revoke silent zombie autopays and calculates true post-rent disposable cashflow. We then delegate a scoped spending permit to an AI agent via our MCP Server. When Claude Code requests a $45 desk lamp within its $80 cap, its confidence is only 68%. The agent cannot approve its own payment—AegisPay creates a PayPal Order with `AUTHORIZE` intent, holding the funds until I click Approve and Capture."*

#### **1:00 – 1:35 | Stage 2: ScamShield™ Firewall, Chrome Extension & Tamper Lab (35s)**
- **On Screen**:
  1. Click Tab **2. ScamShield™ Firewall & Tamper Lab** (and briefly show the Chrome Extension Side Panel).
  2. Click **🚨 2. Typosquat + Friends & Family Scam** $\rightarrow$ show `Verdict: BLOCK (Risk 100/100)` and `PAYPAL LOCKED`.
  3. Click **✅ 1. Clean Freelancer Invoice ($45)** $\rightarrow$ show the issued **Single-Use HMAC-SHA256 Token**.
  4. Under the Tamper Test Matrix on the right, click **1. Mutate Order Amount 10x ($45 → $450)** $\rightarrow$ show `CAPTURE REJECTED [AMOUNT_MUTATED]`. Then click the yellow **Pay with PayPal Sandbox ($45.00)** button $\rightarrow$ show `CAPTURE SUCCEEDED`.
- **What to Say**:
  > *"Stage 2 is ScamShield—available in the web app and our Manifest V3 Chrome Extension. Before PayPal ever opens, Gemini and 18 deterministic rules block Friends-and-Family lures and prompt injections. When a legitimate $45 invoice clears, AegisPay issues a single-use HMAC-SHA256 token locked to the exact amount. If a script tampers with the checkout amount to $450 or replays a used token, capture is deterministically rejected."*

#### **1:35 – 2:05 | Stage 3 & 4: DealForge™ Multi-Agent Negotiation & ClipRefund™ Vision (30s)**
- **On Screen**:
  1. Click Tab **3. DealForge™ Multi-Agent Arena**, ensure **Simulate Adversarial Seller Prompt-Injection** is checked, and click **Launch Multi-Agent Negotiation**. Point to Round 2 where the Kernel Firewall strips the injection attack and Round 4 where the **SHA-256 Smart Contract** settles via PayPal.
  2. Click Tab **4. ClipRefund™ Vision Damage Lab**, click **☕ 1. Chipped Stoneware Mug ($28)**, and click **Grade Photo & Execute PayPal Partial Refund**. Point to the Gemini Vision JSON (zero dollar fields) and the **$8.40 (30%) PayPal Partial Refund ID**.
- **What to Say**:
  > *"In Stage 3, DealForge lets Buyer and Seller AI agents negotiate inside confidential mandates, stripping prompt-injection attacks and locking a SHA-256 contract into PayPal Orders v2. And in Stage 4, if that physical order arrives with a chipped rim, ClipRefund uses Gemini Multimodal Vision to describe only the physical defect—with zero dollar fields in the AI schema—while deterministic merchant code sends an instant $8.40 partial refund via PayPal so the buyer keeps the mug and nobody pays return shipping."*

#### **2:05 – 2:45 | Stage 5: ChurnRescue™, 1,000-Case Fuzzer & 313 Passing Tests (40s)**
- **On Screen**:
  1. Click Tab **5. ChurnRescue™ & 1,000-Case Fuzzer**.
  2. Click **🚨 Circuit Breaker ("chargeback" / "lawyer")** $\rightarrow$ show AI session killed, `0%` discount, and Zapier escalation triggered.
  3. Click **Run 1,000 Randomized Adversarial Fuzz Cases Now** $\rightarrow$ show `1,000 / 1,000 Passed (0 Failures)`.
  4. Switch back to **🌐 Command & AG Grid Ledger** (or show Terminal running `npm test` with `313 passed`).
- **What to Say**:
  > *"Finally, Stage 5 intercepts subscription churn with a fixed 20-35-50% concession ladder, blocks discounts when usage exceeds 60%, and immediately kills the AI session via a circuit breaker if a user mentions 'chargeback' or 'lawyer'. On the right, our property-based fuzzer proves across 1,000 randomized adversarial cases—and 313 automated Vitest assertions—that AI can never loosen a financial rule, logged live in our AG Grid cryptographic ledger. That is AegisPay."*

---

## Part 4: Ready-to-Paste Devpost Submission Copy

### Project Title
**AegisPay — The Deterministic Trust & Execution OS for Agentic Commerce on PayPal**

### Tagline / Elevator Pitch
**AI Proposes. Deterministic Code Decides. PayPal Moves the Money.** A unified 5-stage operating system combining Buyer Agent Permits, ScamShield Pre-Checkout Firewall, Multi-Agent Deal Negotiation, Multimodal Vision Partial Refunds, and ChurnRescue on PayPal Sandbox.

### Tools & Sponsor Technologies Used
- **PayPal Developer Platform**: PayPal REST API v2 (`/v1/oauth2/token`, `/v2/checkout/orders` with `CAPTURE` & `AUTHORIZE` intents, `/v2/payments/authorizations/{id}/capture` & `void`, `/v2/payments/captures/{id}/refund`, and HMAC-SHA256 Signed Webhooks)
- **AI Models & Protocols**: Google Gemini (`gemini-2.5-flash` Multimodal Vision & Structured Output), Model Context Protocol (`mcp-server/index.mjs`), Browser WebMCP (`navigator.modelContext.registerTool`), Chrome Extension Manifest V3
- **Sponsor Tools**: **AG Grid** (`ag-grid-react` Cryptographic Audit Ledger), **Postman** (Collection v2.1), **Elastic** (Bulk NDJSON Security Audit Exporter), **Zapier** (Circuit-Breaker Outbound Webhook Bridge), **Render** (`render.yaml` Blueprint)
