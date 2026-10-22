#!/usr/bin/env node
/**
 * AegisPay Model Context Protocol (MCP) Server for Autonomous AI Agents
 * Allows Claude Code, Cursor, or any MCP-compatible AI agent to:
 * 1. List buyer-delegated PayPal spending permits (`aegispay_list_permits`)
 * 2. Check post-bill disposable cashflow affordability (`aegispay_check_cashflow`)
 * 3. Propose a payment under deterministic monotonic policy (`aegispay_agent_pay`)
 * 4. Scan an external invoice for scams/prompt-injections (`aegispay_scamshield_review`)
 *
 * Rule: "The model proposes, deterministic code decides. An AI agent can never approve its own payment."
 */

import readline from 'node:readline';

const API_BASE = process.env.AEGISPAY_API_URL || 'http://localhost:8787';

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
        proposedSpendCents: { type: 'integer', description: 'Proposed purchase price in integer cents (e.g. 4500 for $45.00)' },
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
        category: { type: 'string', description: 'Purchase category (HARDWARE, SAAS, OFFICE, CLOUD)' },
        itemDescription: { type: 'string', description: 'Line-item description' },
        aiConfidenceScore: { type: 'number', description: 'Agent confidence score from 0.0 to 1.0' },
      },
      required: ['permitId', 'amountCents', 'merchantName', 'category', 'itemDescription', 'aiConfidenceScore'],
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
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

function sendJsonRpc(id, result, error) {
  const payload = error
    ? { jsonrpc: '2.0', id, error }
    : { jsonrpc: '2.0', id, result };
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
      serverInfo: { name: 'aegispay-paypal-mcp-server', version: '1.0.0' },
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
      if (toolName === 'aegispay_list_permits') {
        const r = await fetch(`${API_BASE}/api/state`);
        const state = await r.json();
        sendJsonRpc(id, {
          content: [{ type: 'text', text: JSON.stringify(state.lupa.agentPermits, null, 2) }],
        });
        return;
      }

      if (toolName === 'aegispay_check_cashflow') {
        const r = await fetch(`${API_BASE}/api/lupa/cashflow-check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        const data = await r.json();
        sendJsonRpc(id, {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        });
        return;
      }

      if (toolName === 'aegispay_agent_pay') {
        const r = await fetch(`${API_BASE}/api/lupa/agent-pay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
        const data = await r.json();
        sendJsonRpc(id, {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        });
        return;
      }

      if (toolName === 'aegispay_scamshield_review') {
        const r = await fetch(`${API_BASE}/api/scamshield/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
