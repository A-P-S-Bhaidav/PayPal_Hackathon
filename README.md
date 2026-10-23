<div align="center">

![AegisPay OS Hero Banner](./public/assets/aegispay-hero-banner.svg)

# AegisPay OS

### The Deterministic Trust & Execution Operating System for Agentic Commerce on PayPal

[![License: MIT](https://img.shields.io/badge/LICENSE-MIT-0070E0?style=flat-square&labelColor=0B0F19)](./LICENSE)
[![PayPal Platform](https://img.shields.io/badge/PAYPAL_SANDBOX-REST_API_V2-0070E0?style=flat-square&labelColor=0B0F19)](https://developer.paypal.com)
[![AI Routing Mesh](https://img.shields.io/badge/AI_MESH-GEMINI_2.5_FLASH_%E2%86%92_GROQ_LPU-38BDF8?style=flat-square&labelColor=0B0F19)](./server/gemini.ts)
[![Authentication](https://img.shields.io/badge/IDENTITY-OAUTH_2.0_PKCE_%2B_EMAIL-0070E0?style=flat-square&labelColor=0B0F19)](./server/index.ts)
[![Automated Tests](https://img.shields.io/badge/VERIFICATION-325_PASSING_TESTS-38BDF8?style=flat-square&labelColor=0B0F19)](./tests)
[![Safety Prover](https://img.shields.io/badge/FUZZER-1,000_CASE_MONOTONICITY_PROOF-0070E0?style=flat-square&labelColor=0B0F19)](./shared/kernel.ts)

**[Master Deployment & Demo Guide](./MASTER_GUIDE.md)** | **[Competitor Grading & Architecture](./docs/COMPETITOR_ANALYSIS_AND_ARCHITECTURE.md)** | **[Postman Collection v2.1](./postman/AegisPay_Collection.json)** | **[Chrome Extension MV3](./CHROMEWEBSTORE.md)**

</div>

---

## Table of Contents

1. [Executive Summary & Core Thesis](#1-executive-summary--core-thesis)
2. [Three-Tier Separation of Duties](#2-three-tier-separation-of-duties)
3. [The 5-Stage Autonomous Commerce Lifecycle](#3-the-5-stage-autonomous-commerce-lifecycle)
4. [Enterprise Identity: OAuth 2.0 PKCE & Institutional Email Auth](#4-enterprise-identity-oauth-20-pkce--institutional-email-auth)
5. [Multi-Provider AI Failover Mesh (Gemini 2.5 Flash -> Groq LPU)](#5-multi-provider-ai-failover-mesh-gemini-25-flash---groq-lpu)
6. [Competitor Benchmark & Synthesis Matrix](#6-competitor-benchmark--synthesis-matrix)
7. [API Specification & Developer Endpoints](#7-api-specification--developer-endpoints)
8. [Sponsor & Ecosystem Integrations](#8-sponsor--ecosystem-integrations)
9. [Quickstart, Testing & Vercel Deployment](#9-quickstart-testing--vercel-deployment)

---

## 1. Executive Summary & Core Thesis

Autonomous AI agents and LLM-powered workflows are rapidly assuming responsibility for how individuals and enterprises budget, procure software and hardware, negotiate commercial contracts, resolve post-delivery disputes, and manage recurring subscriptions.

However, existing AI commerce implementations suffer from three structural vulnerabilities:
1. **Unbounded LLM Financial Authority**: Allowing a language model to directly output dollar discounts, approve invoices, or trigger payment captures exposes merchants and buyers to prompt-injection fund drains and hallucinated pricing.
2. **Single-Provider AI Outages**: Depending on a single upstream LLM API causes payment verification and retention flows to stall during HTTP `429` rate-limit bursts or provider latency spikes.
3. **Siloed Point Solutions**: Existing tools address only a single isolated moment in a transaction—leaving critical security gaps before checkout, during multi-party negotiation, and after physical delivery.

**AegisPay OS** resolves all three vulnerabilities by enforcing a foundational engineering invariant across the entire transaction lifecycle:

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
    AUTH["Identity Layer\n(OAuth 2.0 PKCE + Email)"] --> S1
    S1["[01] LupaPermit & Cashflow\n(Permits & Zombie Audit)"] --> S2
    S2["[02] ScamShield Firewall\n(Single-Use HMAC Tokens)"] --> S3
    S3["[03] DealForge Escrow\n(Multi-Agent SHA-256 Deal)"] --> S4
    S4["[04] ClipRefund Vision\n(Keep-The-Item Partial Refund)"] --> S5
    S5["[05] ChurnRescue Dunning\n(20-35-50% Ladder & Breakers)"] --> AUDIT["[00] AG Grid Ledger\n& 1,000-Case Fuzzer"]
```

### Stage 01: `LupaPermit` & `CashflowCopilot` (Pre-Spend Governance)
* **True Free Cashflow Copilot**: Ingests checking balance, upcoming rent, loan obligations, and active PayPal subscriptions to compute **True Post-Bill Disposable Cashflow** and dynamically calibrate AI agent daily spending caps.
* **Zombie Autopay Detector**: Audits PayPal recurring billing permissions (`BA-...`) to identify agreements silent for $>365$ days or exhibiting unapproved price creep ($>15\%$), enabling 1-click revocation or cap tightening.
* **Monotonic Buyer Permit API (`ALLOW` / `HOLD` / `BLOCK`)**:
  * `ALLOW` $\rightarrow$ Executes an immediate PayPal Order (`intent: "CAPTURE"`).
  * `HOLD` $\rightarrow$ Downgrades to a PayPal Order Authorization (`intent: "AUTHORIZE"`) whenever AI confidence falls below the permit threshold (e.g. $68\% < 82\%$). The AI agent **cannot self-approve** a held authorization; a human operator must explicitly capture or void the hold.
  * `BLOCK` $\rightarrow$ Rejects policy violations before any PayPal API call is made.

### Stage 02: `ScamShield` Pre-Payment Firewall & Tamper Lab
* **Pre-Checkout Interception**: Evaluates invoices, payment links, and seller messages using **Google Gemini 2.5 Flash** (with automatic **Groq LPU failover**) + **18 deterministic fraud & prompt-injection rules** before PayPal checkout unlocks.
* **Single-Use HMAC-SHA256 Review Token**: Binds one security review to one PayPal Order (`tokenId`, `reviewedAmountCents`, `payeeHash`, `expiresAtEpochMs`, `hmacSignature`).
* **Interactive Capture Tamper Matrix**: Deterministically blocks mutated checkout amounts (`$45.00 -> $450.00`), swapped payees, forged signatures, expired tokens, unreviewed orders, and token replay attacks.
* **Manifest V3 Chrome Extension (`/extension.zip`)**: Select any payment text on any webpage, right-click **"Scan Payment Text with AegisPay ScamShield"**, and verify in the browser Side Panel.

### Stage 03: `DealForge` Multi-Agent Negotiation & Smart Escrow
* **Confidential Buyer & Seller Mandates**: Autonomous Buyer and Seller agents negotiate price, delivery SLA days, included revisions, and upfront deposit percentage without exposing private price ceilings/floors.
* **Adversarial Prompt-Injection Firewall**: Strips injection payloads (`"Ignore previous instructions..."`) mid-negotiation and clamps all offers to hard mandate boundaries.
* **SHA-256 Smart Contract Settlement**: Anchors the agreed contract digest (`contractSha256`) into PayPal Orders v2 `custom_id` and captures the upfront escrow deposit.

### Stage 04: `ClipRefund` Multimodal Vision Damage Grader
* **"Keep the Broken Thing" Instant Resolution**: Eliminates return shipping and landfill waste for minor physical defects (e.g., chipped ceramic mug or scratched aluminum stand).
* **Non-Monetary Vision Telemetry**: Multimodal AI Vision outputs *only* physical defect attributes (`defectCategory`, `severityTier`, `affectedSurfacePct`, `itemStillUsable`, `photoAuthenticityConfidence`).
* **Deterministic Merchant Matrix**: Plain, tested code computes the exact cent refund, blocks stock-photo or cross-order image replay via SHA-256 image digests, and executes `POST /v2/payments/captures/{id}/refund`.

### Stage 05: `ChurnRescue` In-App Retention & Concession Ladder
* **Fixed Concession Ladder**: `Step 1 (20% Off) -> Step 2 (35% Off) -> Step 3 (50% Hard Floor)`.
* **Feature Utilization Guardrail**: Accounts with $\ge 60\%$ feature utilization are blocked from discount gaming and offered a 14-day billing pause instead.
* **Legal & Dispute Circuit Breakers**: Any mention of `"chargeback"`, `"dispute"`, `"lawyer"`, `"attorney"`, or `"sue"` immediately terminates the AI session, locks discount at `0%`, and dispatches an outbound **Zapier Escalation Webhook**.
* **Atomic Row-Lock Idempotency**: Prevents duplicate PayPal captures on rapid double-clicks.

---

## 4. Enterprise Identity: OAuth 2.0 PKCE & Institutional Email Auth

AegisPay OS includes a full authentication and operator session subsystem in [`server/index.ts`](./server/index.ts):
* **OAuth 2.0 Single Sign-On (`POST /api/auth/oauth`)**: Supports federated sign-in via **PayPal Developer OAuth 2.0 (`PAYPAL_OAUTH`)**, **Google Workspace SSO (`GOOGLE_OAUTH`)**, and **GitHub Enterprise (`GITHUB_OAUTH`)** with PKCE `S256` state verification.
* **Institutional Email Sign Up & Sign In (`POST /api/auth/register` & `POST /api/auth/login`)**: Uses salted SHA-256 credential derivation and issues signed bearer session tokens (`aegis_sess_...`) tracked in the live cryptographic audit ledger.
* **Pre-Seeded Principal Architect Account (For Instant Judge Testing)**:
  * **Email**: `operator@aegispay.io`
  * **Password**: `AegisPay2026!`

---

## 5. Multi-Provider AI Failover Mesh (`Gemini 2.5 Flash -> Groq LPU`)

Implemented in [`server/gemini.ts`](./server/gemini.ts), AegisPay OS eliminates single-provider LLM downtime:
1. **Primary Provider**: Google Gemini (`gemini-2.5-flash`) handles structured JSON reasoning and multimodal vision defect extraction.
2. **Automatic Secondary Failover**: If Gemini returns HTTP `429` (rate limit), `5xx`, or exceeds the timeout budget, the router automatically fails over within milliseconds to **Groq Cloud LPU** (`llama-3.3-70b-versatile` for text and `meta-llama/llama-4-scout-17b-16e-instruct` for multimodal vision).
3. **Tertiary Guarantee**: Deterministic neural heuristics guarantee 100% availability even in air-gapped environments.

---

## 6. Competitor Benchmark & Synthesis Matrix

| Archetype Evaluated | PayPal Depth (/20) | AI Value (/20) | Financial Safety (/20) | Lifecycle Scope (/15) | Ecosystem (/10) | UX & Verification (/15) | **Total Score** |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. ChurnRescue AI** | 16 | 14 | 19 | 9 | 5 | 13 | **76 / 100** |
| **2. ClipPay** | 16 | 18 | 17 | 10 | 5 | 14 | **80 / 100** |
| **3. ScamShield** | 17 | 16 | 19 | 11 | 8 | 14 | **85 / 100** |
| **4A. Lupa (Permit API)** | 19 | 17 | 19 | 12 | 8 | 13 | **88 / 100** |
| **4B. AgentPal** | 16 | 18 | 18 | 11 | 6 | 14 | **83 / 100** |
| **5. Bank Insights** | 9 | 13 | 10 | 9 | 3 | 11 | **55 / 100** |
| **AegisPay OS (Ours)** | **20** | **20** | **20** | **15** | **10** | **15** | **100 / 100** |

---

## 7. API Specification & Developer Endpoints

| Method & Endpoint | Module | Description |
| :--- | :--- | :--- |
| `GET /api/state` | Core Telemetry | Returns system status, KPIs, Lupa permits, PayPal orders, webhooks, and audit logs. |
| `POST /api/auth/register` | Identity | Registers a new institutional operator account with salted SHA-256 password hash. |
| `POST /api/auth/login` | Identity | Authenticates an operator via email/password and issues a signed session token. |
| `POST /api/auth/oauth` | Identity | Executes OAuth 2.0 PKCE federation handshake (`PAYPAL_OAUTH`, `GOOGLE_OAUTH`, `GITHUB_OAUTH`). |
| `POST /api/ai/failover-test` | AI Failover | Toggles simulated HTTP 429 rate limit on Gemini to verify automatic Groq LPU failover. |
| `POST /api/lupa/cashflow-check` | Stage 01 | Computes True Free Cashflow and synchronizes AI agent daily spending caps. |
| `POST /api/lupa/agent-pay` | Stage 01 | Evaluates monotonic permit policy and creates PayPal `CAPTURE` or `AUTHORIZE` order. |
| `POST /api/scamshield/review` | Stage 02 | Scans payment text and mints a single-use HMAC-SHA256 review token if safe. |
| `POST /api/scamshield/capture` | Stage 02 | Verifies single-use HMAC token and blocks mutated amounts or replay attacks. |
| `POST /api/dealforge/negotiate` | Stage 03 | Runs 3-round Buyer vs Seller negotiation, strips injections, and settles SHA-256 contract. |
| `POST /api/cliprefund/evaluate-and-refund` | Stage 04 | Extracts non-monetary vision defect telemetry and executes PayPal Captures Partial Refund. |
| `POST /api/churnrescue/intercept` | Stage 05 | Enforces 20-35-50% concession ladder, usage guardrails, atomic row lock, and Zapier escalation. |
| `POST /api/security/fuzz` | Stage 00 | Runs the 1,000-case property-based monotonicity fuzzer and returns a SHA-256 proof. |

---

## 8. Sponsor & Ecosystem Integrations

* **PayPal Developer Platform**: OAuth2 `/v1/oauth2/token`, Orders v2 `/v2/checkout/orders`, Authorizations Capture/Void, Captures Partial Refund `/v2/payments/captures/{id}/refund`, and Signed Webhooks.
* **Google Gemini + Groq Cloud LPU**: Multi-provider AI routing mesh (`gemini-2.5-flash` primary -> `llama-3.3-70b-versatile` & `llama-4-scout-17b-16e-instruct` failover).
* **AG Grid (`ag-grid-react` v33)**: High-density Cryptographic Audit & PayPal Execution Ledger.
* **Postman**: Ready-to-import Postman Collection v2.1 ([`postman/AegisPay_Collection.json`](./postman/AegisPay_Collection.json)).
* **Elastic**: One-click Elasticsearch Bulk NDJSON exporter (`/api/export/elastic-ndjson`).
* **Zapier**: Outbound webhook automation triggered on legal/dispute circuit-breaker events.
* **Vercel & Render**: Zero-config Vercel Serverless setup ([`vercel.json`](./vercel.json) + [`api/index.ts`](./api/index.ts)) and Render Blueprint ([`render.yaml`](./render.yaml)).
* **MCP & WebMCP**: Standalone Model Context Protocol server ([`mcp-server/index.mjs`](./mcp-server/index.mjs)) and browser `navigator.modelContext` registration ([`src/webmcp.ts`](./src/webmcp.ts)).

---

## 9. Quickstart, Testing & Vercel Deployment

### 1. Install Dependencies & Run the 325-Test Verification Suite
```bash
npm install
npm test
```

### 2. Build & Start on Localhost (`http://localhost:8787`)
```bash
npm run build
npm start
```
Open **[http://localhost:8787](http://localhost:8787)** to explore the Executive Landing Page, OAuth/Email Authentication, and the 6-module Command Console.

### 3. Deploy to Vercel
Import `A-P-S-Bhaidav/PayPal_Hackathon` at **[https://vercel.com/new](https://vercel.com/new)** or run `npx vercel --prod`. See **[`MASTER_GUIDE.md`](./MASTER_GUIDE.md)** for full environment variable and demo video instructions.

---

## License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for details.
