<div align="center">

![AegisPay OS Hero Banner](./public/assets/aegispay-hero-banner.svg)

# AegisPay OS

### The Deterministic Trust & Execution Operating System for Agentic Commerce on PayPal

[![License: MIT](https://img.shields.io/badge/LICENSE-MIT-0070E0?style=flat-square&labelColor=0B0F19)](./LICENSE)
[![PayPal Platform](https://img.shields.io/badge/PAYPAL_SANDBOX-REST_API_V2-0070E0?style=flat-square&labelColor=0B0F19)](https://developer.paypal.com)
[![AI Routing Mesh](https://img.shields.io/badge/AI_MESH-GEMINI_2.5_FLASH_%E2%86%92_GROQ_LPU-38BDF8?style=flat-square&labelColor=0B0F19)](./server/gemini.ts)
[![Authentication](https://img.shields.io/badge/IDENTITY-GOOGLE_OAUTH_2.0_%2B_EMAIL-0070E0?style=flat-square&labelColor=0B0F19)](./server/index.ts)
[![Automated Tests](https://img.shields.io/badge/VERIFICATION-327_PASSING_TESTS-38BDF8?style=flat-square&labelColor=0B0F19)](./tests)
[![Safety Prover](https://img.shields.io/badge/FUZZER-1,000_CASE_MONOTONICITY_PROOF-0070E0?style=flat-square&labelColor=0B0F19)](./shared/kernel.ts)

**[Master Setup, Google OAuth & Vercel Guide](./MASTER_GUIDE.md)** | **[System Architecture](./docs/SYSTEM_ARCHITECTURE.md)** | **[Postman Collection v2.1](./postman/AegisPay_Collection.json)** | **[Chrome Extension MV3](./CHROMEWEBSTORE.md)**

</div>

---

## Table of Contents

1. [Executive Summary & Core Thesis](#1-executive-summary--core-thesis)
2. [Three-Tier Separation of Duties](#2-three-tier-separation-of-duties)
3. [The 5-Stage Autonomous Commerce Lifecycle](#3-the-5-stage-autonomous-commerce-lifecycle)
4. [Enterprise Identity: Google OAuth 2.0 & Email Authentication](#4-enterprise-identity-google-oauth-20--email-authentication)
5. [Multi-Provider AI Failover Mesh (Gemini 2.5 Flash -> Groq LPU)](#5-multi-provider-ai-failover-mesh-gemini-25-flash---groq-lpu)
6. [API Specification & Developer Endpoints](#6-api-specification--developer-endpoints)
7. [Sponsor & Ecosystem Integrations](#7-sponsor--ecosystem-integrations)
8. [Quickstart, Testing & Vercel Deployment](#8-quickstart-testing--vercel-deployment)

---

## 1. Executive Summary & Core Thesis

Autonomous AI agents and LLM-powered workflows are rapidly assuming responsibility for how individuals and enterprises budget, procure software and hardware, negotiate commercial contracts, resolve post-delivery disputes, and manage recurring subscriptions.

However, giving a language model direct pricing or payment authority introduces three structural risks:
1. **Unbounded LLM Financial Authority**: Allowing an LLM to directly output dollar discounts, approve invoices, or trigger payment captures exposes merchants and buyers to prompt-injection fund drains and hallucinated pricing.
2. **Single-Provider AI Outages**: Depending on a single upstream LLM API causes payment verification and retention flows to stall during HTTP `429` rate-limit bursts or provider latency spikes.
3. **Siloed Transaction Security**: Guarding only a single point in a transaction leaves critical security gaps before checkout, during multi-party negotiation, and after physical delivery.

**AegisPay OS** resolves all three risks by enforcing a foundational engineering invariant across the entire transaction lifecycle:

> **"AI Proposes. Deterministic Code Decides. PayPal Moves the Money."**

---

## 2. Three-Tier Separation of Duties

![AegisPay Three-Tier Architecture Banner](./public/assets/aegispay-architecture-banner.svg)

Every commercial action inside **AegisPay OS** traverses three strictly isolated execution tiers:

| Execution Tier | Primary Components | Architectural Responsibility | Security Invariant |
| :--- | :--- | :--- | :--- |
| **Tier 01: Cognitive Perception & Dialogue Mesh** | Google Gemini 2.5 Flash (`Primary`) + Groq Cloud LPU (`Secondary Failover`) | Semantic scam classification, multi-agent negotiation proposals, multimodal photo defect extraction, and empathetic customer dialogue. | **Zero Pricing Fields**: AI output schemas contain no authoritative dollar or discount fields. |
| **Tier 02: Deterministic Financial & Cryptographic Kernel** | [`shared/kernel.ts`](./shared/kernel.ts) (Zero external runtime dependencies) | Monotonic permit evaluation, single-use HMAC-SHA256 review tokens, mandate boundary clamping, merchant refund matrix math, and concession ladders. | **Monotonic Safety**: AI verdicts can make a decision *stricter*, never *looser*. Proven across 1,000 randomized fuzz cases. |
| **Tier 03: Atomic Settlement & Audit Layer** | [`server/paypal.ts`](./server/paypal.ts) + AG Grid + Elastic NDJSON | PayPal OAuth2, Orders v2 (`CAPTURE` & `AUTHORIZE`), Authorizations Capture/Void, Captures Partial Refund, and Signed Webhooks. | **Idempotent Execution**: Atomic row locks and SHA-256 contract hashes prevent duplicate captures or replay attacks. |

---

## 3. The 5-Stage Autonomous Commerce Lifecycle

```mermaid
flowchart LR
    AUTH["Identity Layer\n(Google OAuth 2.0 + Email)"] --> S1
    S1["[01] PermitGuard & Cashflow\n(Agent Permits & Autopay Audit)"] --> S2
    S2["[02] ThreatGate Firewall\n(Single-Use HMAC Tokens)"] --> S3
    S3["[03] DealForge Escrow\n(Multi-Agent SHA-256 Deal)"] --> S4
    S4["[04] VisionClaim Refund\n(Keep-The-Item Partial Refund)"] --> S5
    S5["[05] RetainGuard Dunning\n(20-35-50% Ladder & Breakers)"] --> AUDIT["[00] AG Grid Ledger\n& 1,000-Case Fuzzer"]
```

### Module 01: `PermitGuard` & `CashflowCopilot` (Pre-Spend Governance)
* **True Free Cashflow Copilot**: Ingests checking balance, upcoming rent, loan obligations, and active PayPal subscriptions to compute **True Post-Bill Disposable Cashflow** and dynamically calibrate AI agent daily spending caps.
* **Zombie Autopay Detector**: Audits PayPal recurring billing permissions (`BA-...`) to identify agreements silent for $>365$ days or exhibiting unapproved price creep ($>15\%$), enabling 1-click revocation or cap tightening.
* **Monotonic Buyer Permit API (`ALLOW` / `HOLD` / `BLOCK`)**:
  * `ALLOW` $\rightarrow$ Executes an immediate PayPal Order (`intent: "CAPTURE"`).
  * `HOLD` $\rightarrow$ Downgrades to a PayPal Order Authorization (`intent: "AUTHORIZE"`) whenever AI confidence falls below the permit threshold (e.g. $68\% < 82\%$). The AI agent **cannot self-approve** a held authorization; a human operator must explicitly capture or void the hold.
  * `BLOCK` $\rightarrow$ Rejects policy violations before any PayPal API call is made.

### Module 02: `ThreatGate` Pre-Payment Firewall & Tamper Lab
* **Pre-Checkout Interception**: Evaluates invoices, payment links, and seller messages using **Google Gemini 2.5 Flash** (with automatic **Groq LPU failover**) + **18 deterministic fraud & prompt-injection rules** before PayPal checkout unlocks.
* **Single-Use HMAC-SHA256 Review Token**: Binds one security review to one PayPal Order (`tokenId`, `reviewedAmountCents`, `payeeHash`, `expiresAtEpochMs`, `hmacSignature`).
* **Interactive Capture Tamper Matrix**: Deterministically blocks mutated checkout amounts (`$45.00 -> $450.00`), swapped payees, forged signatures, expired tokens, unreviewed orders, and token replay attacks.
* **Manifest V3 Chrome Extension (`/extension.zip`)**: Select any payment text on any webpage, right-click **"Scan Payment Text with AegisPay"**, and verify in the browser Side Panel.

### Module 03: `DealForge` Multi-Agent Negotiation & Smart Escrow
* **Confidential Buyer & Seller Mandates**: Autonomous Buyer and Seller agents negotiate price, delivery SLA days, included revisions, and upfront deposit percentage without exposing private price ceilings/floors.
* **Adversarial Prompt-Injection Firewall**: Strips injection payloads (`"Ignore previous instructions..."`) mid-negotiation and clamps all offers to hard mandate boundaries.
* **SHA-256 Smart Contract Settlement**: Anchors the agreed contract digest (`contractSha256`) into PayPal Orders v2 `custom_id` and captures the upfront escrow deposit.

### Module 04: `VisionClaim` Multimodal Vision Damage Grader
* **"Keep the Broken Thing" Instant Resolution**: Eliminates return shipping and landfill waste for minor physical defects (e.g., chipped ceramic mug or scratched aluminum stand).
* **Non-Monetary Vision Telemetry**: Multimodal AI Vision outputs *only* physical defect attributes (`defectCategory`, `severityTier`, `affectedSurfacePct`, `itemStillUsable`, `photoAuthenticityConfidence`).
* **Deterministic Merchant Matrix**: Plain, tested code computes the exact cent refund, blocks stock-photo or cross-order image replay via SHA-256 image digests, and executes `POST /v2/payments/captures/{id}/refund`.

### Module 05: `RetainGuard` In-App Retention & Concession Ladder
* **Fixed Concession Ladder**: `Step 1 (20% Off) -> Step 2 (35% Off) -> Step 3 (50% Hard Floor)`.
* **Feature Utilization Guardrail**: Accounts with $\ge 60\%$ feature utilization are blocked from discount gaming and offered a 14-day billing pause instead.
* **Legal & Dispute Circuit Breakers**: Any mention of `"chargeback"`, `"dispute"`, `"lawyer"`, `"attorney"`, or `"sue"` immediately terminates the AI session, locks discount at `0%`, and dispatches an outbound **Zapier Escalation Webhook**.
* **Atomic Row-Lock Idempotency**: Prevents duplicate PayPal captures on rapid double-clicks.

---

## 4. Enterprise Identity: Google OAuth 2.0 & Email Authentication

AegisPay OS includes a complete authentication subsystem in [`server/index.ts`](./server/index.ts):
* **Google OAuth 2.0 (`GET /api/auth/google/url`, `GET /api/auth/google/callback`, `POST /api/auth/google`)**: Supports full Google OAuth 2.0 Authorization Code & OpenID Connect ID Token verification (and includes an interactive Google Account Chooser when testing locally prior to setting `GOOGLE_CLIENT_ID`).
* **Email Sign Up & Sign In (`POST /api/auth/register` & `POST /api/auth/login`)**: Uses salted SHA-256 credential derivation and issues signed bearer session tokens (`aegis_sess_...`) tracked in the live cryptographic audit ledger.

---

## 5. Multi-Provider AI Failover Mesh (`Gemini 2.5 Flash -> Groq LPU`)

Implemented in [`server/gemini.ts`](./server/gemini.ts), AegisPay OS eliminates single-provider LLM downtime:
1. **Primary Provider**: Google Gemini (`gemini-2.5-flash`) handles structured JSON reasoning and multimodal vision defect extraction.
2. **Automatic Secondary Failover**: If Gemini returns HTTP `429` (rate limit), `5xx`, or exceeds the timeout budget, the router automatically fails over within milliseconds to **Groq Cloud LPU** (`llama-3.3-70b-versatile` for text and `meta-llama/llama-4-scout-17b-16e-instruct` for multimodal vision).
3. **Tertiary Guarantee**: Deterministic neural heuristics guarantee 100% availability even in air-gapped environments.

---

## 6. API Specification & Developer Endpoints

| Method & Endpoint | Module | Description |
| :--- | :--- | :--- |
| `GET /api/state` | Core Telemetry | Returns system status, KPIs, permits, PayPal orders, webhooks, and audit logs. |
| `GET /api/auth/google/url` | Google OAuth | Generates the Google OAuth 2.0 authorization URL with CSRF state token. |
| `GET /api/auth/google/callback` | Google OAuth | Exchanges Google OAuth `code` for tokens, verifies OpenID profile, and issues session. |
| `POST /api/auth/google` | Google OAuth | Verifies Google ID Token / OAuth profile and mints a signed `GOOGLE_OAUTH` session. |
| `POST /api/auth/register` | Email Auth | Registers a new operator account with salted SHA-256 password hash. |
| `POST /api/auth/login` | Email Auth | Authenticates an operator via email/password and issues a signed session token. |
| `POST /api/ai/failover-test` | AI Failover | Toggles simulated HTTP 429 rate limit on Gemini to verify automatic Groq LPU failover. |
| `POST /api/lupa/cashflow-check` | Module 01 | Computes True Free Cashflow and synchronizes AI agent daily spending caps. |
| `POST /api/lupa/agent-pay` | Module 01 | Evaluates monotonic permit policy and creates PayPal `CAPTURE` or `AUTHORIZE` order. |
| `POST /api/scamshield/review` | Module 02 | Scans payment text and mints a single-use HMAC-SHA256 review token if safe. |
| `POST /api/scamshield/capture` | Module 02 | Verifies single-use HMAC token and blocks mutated amounts or replay attacks. |
| `POST /api/dealforge/negotiate` | Module 03 | Runs 3-round Buyer vs Seller negotiation, strips injections, and settles SHA-256 contract. |
| `POST /api/cliprefund/evaluate-and-refund` | Module 04 | Extracts non-monetary vision defect telemetry and executes PayPal Captures Partial Refund. |
| `POST /api/churnrescue/intercept` | Module 05 | Enforces 20-35-50% concession ladder, usage guardrails, atomic row lock, and Zapier escalation. |
| `POST /api/security/fuzz` | Module 00 | Runs the 1,000-case property-based monotonicity fuzzer and returns a SHA-256 proof. |

---

## 7. Sponsor & Ecosystem Integrations

* **PayPal Developer Platform**: OAuth2 `/v1/oauth2/token`, Orders v2 `/v2/checkout/orders`, Authorizations Capture/Void, Captures Partial Refund `/v2/payments/captures/{id}/refund`, and Signed Webhooks.
* **Google Gemini + Groq Cloud LPU**: Multi-provider AI routing mesh (`gemini-2.5-flash` primary -> `llama-3.3-70b-versatile` & `llama-4-scout-17b-16e-instruct` failover).
* **AG Grid (`ag-grid-react` v33)**: High-density Cryptographic Audit & PayPal Execution Ledger.
* **Postman**: Ready-to-import Postman Collection v2.1 ([`postman/AegisPay_Collection.json`](./postman/AegisPay_Collection.json)).
* **Elastic**: One-click Elasticsearch Bulk NDJSON exporter (`/api/export/elastic-ndjson`).
* **Zapier**: Outbound webhook automation triggered on legal/dispute circuit-breaker events.
* **Vercel & Render**: Zero-config Vercel Serverless setup ([`vercel.json`](./vercel.json) + [`api/index.ts`](./api/index.ts)) and Render Blueprint ([`render.yaml`](./render.yaml)).
* **MCP & WebMCP**: Standalone Model Context Protocol server ([`mcp-server/index.mjs`](./mcp-server/index.mjs)) and browser `navigator.modelContext` registration ([`src/webmcp.ts`](./src/webmcp.ts)).

---

## 8. Quickstart, Testing & Vercel Deployment

### 1. Install Dependencies & Run the 327-Test Verification Suite
```bash
npm install
npm test
```

### 2. Build & Start on Localhost (`http://localhost:8787`)
```bash
npm run build
npm start
```
Open **[http://localhost:8787](http://localhost:8787)** to explore the Full-Screen Interactive Landing Page, Google OAuth 2.0 + Email Authentication, and the 6-module Command Console.

### 3. Deploy to Vercel
Import `A-P-S-Bhaidav/PayPal_Hackathon` at **[https://vercel.com/new](https://vercel.com/new)** or run `npx vercel --prod`. See **[`MASTER_GUIDE.md`](./MASTER_GUIDE.md)** for full step-by-step instructions.

---

## License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for details.
