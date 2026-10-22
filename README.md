# AegisPay OS — The Deterministic Trust & Execution Operating System for Agentic Commerce on PayPal

> **"AI Proposes. Deterministic Code Decides. PayPal Moves the Money."**  
> Built for the **Build What's Next with PayPal and AI** Global Hackathon | **MIT License** | **321 Passing Tests** | **1,000-Case Property-Based Safety Fuzzer** | **Gemini-to-Groq Failover Mesh**

---

## Executive Overview

AI is transforming how individuals, businesses, and autonomous software agents budget, buy, negotiate, resolve post-purchase disputes, and manage recurring subscriptions. Yet across the AI commerce landscape, three critical failure modes persist:
1. **Unbounded AI Autonomy**: Giving an LLM direct pricing or payment authority risks hallucinated discounts, prompt-injection fund drains, and unauthorized charges.
2. **Single-Provider AI Fragility**: Relying on a single LLM API causes checkout or retention pipelines to stall when HTTP `429` rate limits or upstream latency spikes occur.
3. **Fragmented Point Solutions**: Existing tools only guard a single slice of a transaction—leaving buyers and merchants exposed before checkout, during negotiation, or after delivery.

**AegisPay OS** solves all three problems by uniting the **entire 5-Stage Autonomous Commerce Lifecycle** on top of the **PayPal Developer Sandbox Platform** (`Orders v2`, `Authorizations & Captures`, `Captures Partial Refund`, `Billing Permissions`, and `Signed Webhooks`), backed by a **Multi-Provider AI Failover Router (`Google Gemini 2.5 Flash Primary` -> `Groq Cloud LPU Secondary` -> `Deterministic Neural Heuristic Tertiary`)** and a zero-trust **Deterministic Financial & Cryptographic Kernel**.

For complete setup, Vercel deployment, demo video script, and submission instructions, see **[`MASTER_GUIDE.md`](MASTER_GUIDE.md)**.

---

## The 5-Stage Autonomous Commerce Lifecycle

```mermaid
flowchart LR
    S1["[01] LupaPermit & CashflowCopilot\n(Pre-Spend Permits & Zombie Autopays)"]
    S2["[02] ScamShield Firewall\n(Single-Use HMAC Review Tokens)"]
    S3["[03] DealForge Arena\n(Multi-Agent Deal + SHA-256 Escrow)"]
    S4["[04] ClipRefund Vision Lab\n(Keep-The-Item Instant Partial Refund)"]
    S5["[05] ChurnRescue Interceptor\n(20-35-50% Ladder & Circuit Breakers)"]

    S1 --> S2 --> S3 --> S4 --> S5
```

### Stage 01: `LupaPermit` & `CashflowCopilot` (Buyer-Side Agentic Permits & Affordability)
* **True Free Cashflow Copilot**: Connects checking balance, upcoming rent, loan repayments, active PayPal autopays, and savings goals to compute **True Post-Bill Disposable Cashflow** and dynamically calibrate AI agent spending caps.
* **Zombie Autopay Detector**: Audits PayPal recurring billing agreements (`BA-...`) to flag permissions silent for $>1$ year, unused subscriptions, and unapproved price creep ($>15\%$), allowing 1-click revocation or cap tightening.
* **Monotonic Agent Permit API (`ALLOW` / `HOLD` / `BLOCK`)**: Delegates scoped spending slices to AI agents (via **MCP Server** & **Browser WebMCP**).
  * `ALLOW` $\rightarrow$ Creates and captures a PayPal Sandbox Order (`intent: "CAPTURE"`).
  * `HOLD` $\rightarrow$ Creates a PayPal Order Authorization (`intent: "AUTHORIZE"`) when confidence is below threshold (e.g. $68\% < 82\%$) so the agent **cannot approve its own payment**; a human operator approves or voids in 1 click.
  * `BLOCK` $\rightarrow$ Hard-rejected by deterministic policy. **Mathematical Guarantee**: *An AI verdict can make a decision stricter, never looser.*

### Stage 02: `ScamShield` Pre-Payment Firewall & Tamper Lab
* **Pre-Checkout Interception**: Scans invoices, payment links, and seller messages using **Google Gemini 2.5 Flash** (with automatic **Groq Cloud LPU failover**) + **18 deterministic scam & prompt-injection heuristics** before the PayPal checkout gate unlocks.
* **Single-Use HMAC-SHA256 Review Token**: Binds one security review to one PayPal Order.
* **Interactive Tamper Lab**: Blocks and logs mutated checkout amounts (`$45 -> $450`), replayed tokens, expired tokens, forged signatures, and payee swaps at capture time.
* **Manifest V3 Chrome Extension (`/extension.zip`)**: Highlight any invoice or payment request on any webpage, right-click **"Scan Payment Text with AegisPay ScamShield"**, and verify in the Chrome Side Panel.

### Stage 03: `DealForge` Autonomous Multi-Agent Negotiation & Smart Escrow
* **Confidential Buyer & Seller Mandates**: Buyer Agent and Seller Agent negotiate price, delivery SLA, revisions, and upfront deposit percentage without revealing their private ceiling/floor or touching payment credentials.
* **Prompt-Injection Firewall**: Strips adversarial mandate-override payloads mid-negotiation and clamps every offer to hard mandate boundaries.
* **SHA-256 Smart Commercial Contract**: Signs the agreed terms with SHA-256 and settles the upfront deposit via PayPal Orders v2.

### Stage 04: `ClipRefund` Multimodal Vision Damage Grader & Keep-The-Item Refunds
* **"Keep the Broken Thing" Instant Resolution**: Buyer uploads a photo of a damaged physical item (e.g. chipped ceramic mug or scratched monitor stand).
* **Zero Pricing Fields in AI Vision Schema**: Gemini Multimodal Vision (or Groq `llama-4-scout-17b-16e-instruct` Vision on failover) extracts *only* physical defect telemetry (`defectCategory`, `severityTier`, `affectedSurfacePct`, `itemStillUsable`, `photoAuthenticityConfidence`).
* **Deterministic Merchant Matrix**: Tested code calculates the exact partial refund down to the cent, blocks replayed photos via SHA-256 image digests, and executes a live **PayPal Captures Partial Refund** (`POST /v2/payments/captures/{id}/refund`).

### Stage 05: `ChurnRescue` In-App Retention & Deterministic Concession Ladder
* **Fixed Concession Ladder**: `20% -> 35% -> 50% hard floor`. The LLM handles empathetic dialogue; deterministic code handles every cent.
* **Feature Utilization Guardrail**: Accounts with $\ge 60\%$ feature utilization are blocked from discount gaming and offered a 14-day billing pause instead.
* **Legal & Dispute Circuit Breakers**: Mentioning `"chargeback"`, `"dispute"`, `"lawyer"`, `"attorney"`, or `"sue"` immediately terminates the AI session, locks pricing at `0%` discount, and fires an outbound **Zapier Escalation Webhook**.
* **Atomic Row-Lock Idempotency**: Prevents duplicate PayPal captures on rapid double-clicks.

---

## Multi-Provider AI Failover Architecture (`Gemini -> Groq -> Deterministic`)

Every AI-assisted workflow in AegisPay OS runs through a resilient 3-tier routing mesh (`server/gemini.ts`):
1. **Primary Tier — Google Gemini (`gemini-2.5-flash`)**: Low-latency structured JSON and multimodal vision analysis.
2. **Secondary Failover Tier — Groq Cloud LPU (`llama-3.3-70b-versatile` / `meta-llama/llama-4-scout-17b-16e-instruct`)**: Automatically engages within milliseconds if Gemini returns HTTP `429 Too Many Requests`, `5xx`, or exceeds the latency timeout budget.
3. **Tertiary Guarantee — Deterministic Neural Heuristics**: Ensures 100% uptime even in air-gapped environments.

You can test the failover router live in the UI header by clicking **`AI ROUTE: GEMINI PRIMARY -> GROQ STANDBY [TEST 429 FAILOVER]`** or via `POST /api/ai/failover-test`.

---

## Sponsor & Ecosystem Tools Integrated

| Tool / Platform | How It Is Integrated in AegisPay OS |
| :--- | :--- |
| **PayPal Developer Platform** | OAuth2 `/v1/oauth2/token`, Orders v2 `/v2/checkout/orders` (`CAPTURE` & `AUTHORIZE`), Authorizations Capture/Void, Captures Partial Refund `/v2/payments/captures/{id}/refund`, and HMAC-SHA256 Signed Webhooks. |
| **Google Gemini + Groq LPU** | Primary `gemini-2.5-flash` engine with automatic HTTP 429/5xx failover to Groq `llama-3.3-70b-versatile` and `llama-4-scout-17b-16e-instruct`. |
| **AG Grid (`ag-grid-react` v33)** | Powers the interactive **Cryptographic Decision & PayPal Execution Ledger** with live pillar filtering, pagination, and SHA-256 audit verification. |
| **Postman** | Ready-to-import **Postman Collection v2.1** ([`postman/AegisPay_Collection.json`](postman/AegisPay_Collection.json)) covering all core API workflows. |
| **Elastic** | One-click **Elasticsearch Bulk NDJSON Exporter** (`/api/export/elastic-ndjson`) for indexing security and payment audit logs. |
| **Zapier** | Automated outbound webhook bridge triggered immediately when a `ChurnRescue` legal/dispute circuit breaker trips. |
| **Vercel & Render** | Zero-config **Vercel Serverless** configuration ([`vercel.json`](vercel.json) + [`api/index.ts`](api/index.ts)), **Render Blueprint** ([`render.yaml`](render.yaml)), and [`Dockerfile`](Dockerfile). |
| **MCP + WebMCP + Chrome MV3** | Standalone **MCP Server** ([`mcp-server/index.mjs`](mcp-server/index.mjs)), browser-native **WebMCP** ([`src/webmcp.ts`](src/webmcp.ts)), and **Manifest V3 Chrome Extension** ([`extension/`](extension/)). |

---

## Quickstart (Run Locally in 60 Seconds)

### Prerequisites
* **Node.js 20+** and **npm**

### 1. Install & Run Automated Verification Suite (321 Tests + 1,000-Case Fuzzer)
```bash
npm install
npm test
```

### 2. Build & Start the Unified Full-Stack Server
```bash
npm run build
npm start
```
Then open **[http://localhost:8787](http://localhost:8787)** in your browser.  
*(For hot-reload development, run `npm run dev` and open `http://localhost:5173`.)*

### 3. Optional: Configure Live PayPal Sandbox, Gemini & Groq Keys
AegisPay OS works **100% out-of-the-box with zero configuration** using its built-in **Cryptographic Signed Sandbox Emulator** so judges can test every flow immediately.  
To connect live `api-m.sandbox.paypal.com`, Google Gemini, and Groq credentials:
* **Option A (In-App UI Vault)**: Click **"Credentials Vault"** in the top-right header of the web app and paste your `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `GEMINI_API_KEY`, and `GROQ_API_KEY`.
* **Option B (`.env` File)**: Copy `.env.example` to `.env` and add your keys.

---

## License
Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for full details.
