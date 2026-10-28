// AegisPay Checkout Firewall Manifest V3 Service Worker
// Automatically connects to localhost:8787 if running, or fails over to https://aegispay-orpin.vercel.app

const DEFAULT_ENDPOINTS = [
  'http://localhost:8787',
  'https://aegispay-orpin.vercel.app',
];

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'aegispay-scan-selection',
      title: 'Scan Payment Text with AegisPay Firewall',
      contexts: ['selection'],
    });
  });

  const existing = await chrome.storage.local.get(['apiBaseUrl', 'scanHistory']);
  if (!existing.apiBaseUrl) {
    await chrome.storage.local.set({
      apiBaseUrl: 'http://localhost:8787',
      scanHistory: [],
    });
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'aegispay-scan-selection' || !info.selectionText) {
    return;
  }

  const selectedText = info.selectionText.trim();
  await chrome.storage.local.set({
    lastSelectedText: selectedText,
    lastSelectedUrl: tab?.url || '',
    lastSelectedAt: new Date().toISOString(),
  });

  if (tab?.windowId) {
    try {
      await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (err) {
      console.error('Could not open side panel:', err);
    }
  }

  if (tab?.id) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (snippet) => {
          const toast = document.createElement('div');
          toast.textContent = `[AEGISPAY FIREWALL] Analyzing "${snippet.slice(0, 42)}..." in Side Panel`;
          Object.assign(toast.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: '2147483647',
            background: '#090D16',
            color: '#ffffff',
            padding: '12px 18px',
            borderRadius: '10px',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '13px',
            fontWeight: '600',
            boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
            border: '1px solid #0070E0',
          });
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 3200);
        },
        args: [selectedText],
      });
    } catch (err) {
      console.warn('Toast injection skipped on restricted page:', err);
    }
  }
});

async function fetchWithEndpointFailover(path, payload) {
  let lastError = null;
  for (const base of DEFAULT_ENDPOINTS) {
    try {
      const response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const data = await response.json();
        return { data, endpointUsed: base };
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('Could not reach localhost:8787 or aegispay-orpin.vercel.app');
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === 'AEGISPAY_RUN_REVIEW') {
        const { data, endpointUsed } = await fetchWithEndpointFailover(
          '/api/scamshield/review',
          message.payload
        );
        const { scanHistory = [] } = await chrome.storage.local.get('scanHistory');
        const updatedHistory = [
          {
            timestampIso: new Date().toISOString(),
            verdict: data.finalVerdict,
            riskScore: data.combinedRiskScore,
            payee: message.payload.payeeIdentifier,
            amountCents: message.payload.claimedAmountCents,
            tokenId: data.signedToken?.payload?.tokenId,
            endpointUsed,
          },
          ...scanHistory.slice(0, 19),
        ];
        await chrome.storage.local.set({ scanHistory: updatedHistory, lastReviewResult: data });
        await chrome.action.setBadgeText({ text: data.finalVerdict === 'BLOCK' ? 'BLK' : 'OK' });
        await chrome.action.setBadgeBackgroundColor({
          color: data.finalVerdict === 'BLOCK' ? '#DC2626' : '#059669',
        });
        sendResponse({ ok: true, data, endpointUsed });
        return;
      }
      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (err) {
      sendResponse({ ok: false, error: String(err) });
    }
  })();
  return true;
});
