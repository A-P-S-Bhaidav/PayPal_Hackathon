#!/usr/bin/env node
/**
 * AegisPay Model Context Protocol (MCP) Server for Autonomous AI Agents
 * Authenticates via Zero-Trust HMAC Session and exposes 7 PayPal + AI tools:
 * 1. aegispay_list_permits
 * 2. aegispay_check_cashflow
 * 3. aegispay_agent_pay
 * 4. aegispay_scamshield_review
 * 5. aegispay_paystream_create_plan
 * 6. aegispay_paystream_issue_invoice
 * 7. aegispay_payrevive_recover
 */

import readline from 'node:readline';

const API_BASE = process.env.AEGISPAY_API_URL || 'http://localhost:8787';
const OPERATOR_EMAIL = process.env.AEGISPAY_OPERATOR_EMAIL || 'operator@aegispay.io';
const OPERATOR_PASSWORD = process.env.AEGISPAY_OPERATOR_PASSWORD || 'AegisPay2026!';

let cachedSessionToken = process.env.AEGISPAY_SESSION_TOKEN || '';

async function ensureAuthHeaders() {
  if (!cachedSessionToken) {
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: OPERATOR_EMAIL, password: OPERATOR_PASSWORD }),
    });
    if (loginRes.ok) {
      const loginData = await loginRes.json();
      cachedSessionToken = loginData.token || '';
    }
  }
  return {
    'Content-Type': 'application/json',
    ...(cachedSessionToken ? { Authorization: `Bearer ${cachedSessionToken}` } : {}),
  };
}

const TOOLS = [
  {
    name: 'aegispay_list_permits',
    description:
      'List all active PayPal buyer-side spending permits delegated to AI agents, including single-transaction caps, daily caps, auto-allow thresholds, and confidence floors.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'aegispay_check_cashflow',
    description:
      'Evaluate whether a proposed purchase is affordable after accounting for upcoming rent, loans, active PayPal autopays, and savings goals.',
    inputSchema: {
      type: 'object',
      properties: {
        itemTitle: { type: 'string', description: 'Name of the item or service being evaluated' },
        proposedSpendCents: {
          type: 'integer',
          description: 'Proposed purchase price in integer cents (e.g. 4500 for $45.00)',
        },
      },
      required: ['itemTitle', 'proposedSpendCents'],
    },
  },
  {
    name: 'aegispay_agent_pay',
    description:
      'Submit an autonomous agent payment request against a delegated PayPal permit. Returns ALLOW (PayPal CAPTURE), HOLD (PayPal AUTHORIZE awaiting human approval), or BLOCK.',
    inputSchema: {
      type: 'object',
      properties: {
        permitId: { type: 'string', description: 'Delegated permit ID (e.g. PRM-CLAUDE-CODE-01)' },
        amountCents: { type: 'integer', description: 'Payment amount in integer cents' },
        merchantId: { type: 'string', description: 'Merchant identifier' },
        merchantName: { type: 'string', description: 'Merchant display name' },
        category: {
          type: 'string',
          description: 'Purchase category (HARDWARE, SAAS, OFFICE, CLOUD)',
        },
        itemDescription: { type: 'string', description: 'Line-item description' },
        aiConfidenceScore: {
          type: 'number',
          description: 'Agent confidence score from 0.0 to 1.0',
        },
      },
      required: [
        'permitId',
        'amountCents',
        'merchantName',
        'category',
        'itemDescription',
        'aiConfidenceScore',
      ],
    },
  },
  {
    name: 'aegispay_scamshield_review',
    description:
      'Scan an invoice or payment request text for social-engineering scams and prompt injection before creating a PayPal order.',
    inputSchema: {
      type: 'object',
      properties: {
        rawText: { type: 'string', description: 'Raw text of the invoice or payment message' },
        claimedAmountCents: { type: 'integer', description: 'Amount requested in integer cents' },
        payeeIdentifier: { type: 'string', description: 'Payee email or merchant handle' },
      },
      required: ['rawText', 'claimedAmountCents', 'payeeIdentifier'],
    },
  },
  {
    name: 'aegispay_paystream_create_plan',
    description:
      'Decompose a freelance or B2B project brief into penny-exact PayPal milestones and collaborator payout splits with zero rounding drift.',
    inputSchema: {
      type: 'object',
      properties: {
        projectTitle: { type: 'string', description: 'Project title' },
        projectBrief: { type: 'string', description: 'Scope brief to decompose into milestones' },
        clientEmail: { type: 'string', description: 'Client PayPal billing email' },
        totalBudgetCents: { type: 'integer', description: 'Total project budget in integer cents' },
      },
      required: ['projectTitle', 'projectBrief', 'totalBudgetCents'],
    },
  },
  {
    name: 'aegispay_paystream_issue_invoice',
    description:
      'Issue and send a live PayPal Sandbox Invoice (INV2-...) for a specific milestone in a PayStream plan.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'PayStream Plan ID (e.g. PSTRM-...)' },
        milestoneId: { type: 'string', description: 'Milestone ID (e.g. MS-1)' },
      },
      required: ['milestoneId'],
    },
  },
  {
    name: 'aegispay_payrevive_recover',
    description:
      'Diagnose a failed PayPal payment via XGBoost + Exact TreeSHAP, evaluate Contextual Bandit expected net recovery value, enforce hard compliance gates, and execute PayPal recovery if allowed and worth the cost.',
    inputSchema: {
      type: 'object',
      properties: {
        presetId: {
          type: 'string',
          description:
            'Optional preset ID (PAYDAY_LIQUIDITY, EXPIRED_CARD_WALLET_SWITCH, ISSUER_GATEWAY_TIMEOUT, COMPLIANCE_HARD_DECLINE, NEGATIVE_EV_MICRO_PAYMENT)',
        },
        amountCents: { type: 'integer', description: 'Failed payment amount in integer cents' },
        declineCode: {
          type: 'string',
          description:
            'Decline code (INSUFFICIENT_FUNDS, ISSUER_TIMEOUT, EXPIRED_CARD, VELOCITY_EXCEEDED, STOLEN_OR_FRAUD_CARD, REVOKED_AUTHORIZATION)',
        },
        daysUntilPayday: { type: 'integer', description: 'Estimated days until payday (0..14)' },
      },
    },
  },
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendJsonRpc(id, result, error) {
  const payload = error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result };
  process.stdout.write(JSON.stringify(payload) + '\n');
}

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }

  const { id, method, params } = req;

  if (method === 'initialize') {
    sendJsonRpc(id, {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'aegispay-paypal-mcp-server', version: '3.0.0' },
    });
    return;
  }

  if (method === 'tools/list') {
    sendJsonRpc(id, { tools: TOOLS });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments || {};

    try {
      const headers = await ensureAuthHeaders();

      if (toolName === 'aegispay_list_permits') {
        const r = await fetch(`${API_BASE}/api/state`, { headers });
        const state = await r.json();
        sendJsonRpc(id, {
          content: [{ type: 'text', text: JSON.stringify(state.lupa.agentPermits, null, 2) }],
        });
        return;
      }

      const routeMap = {
        aegispay_check_cashflow: '/api/lupa/cashflow-check',
        aegispay_agent_pay: '/api/lupa/agent-pay',
        aegispay_scamshield_review: '/api/scamshield/review',
        aegispay_paystream_create_plan: '/api/paystream/create-plan',
        aegispay_paystream_issue_invoice: '/api/paystream/issue-invoice',
        aegispay_payrevive_recover: '/api/payrevive/recover',
      };

      if (routeMap[toolName]) {
        const r = await fetch(`${API_BASE}${routeMap[toolName]}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(args),
        });
        const data = await r.json();
        sendJsonRpc(id, {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        });
        return;
      }

      sendJsonRpc(id, null, { code: -32601, message: `Unknown tool: ${toolName}` });
    } catch (err) {
      sendJsonRpc(id, null, { code: -32000, message: String(err) });
    }
  }
});
