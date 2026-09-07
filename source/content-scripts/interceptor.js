// ============================================================
// Capsule Infinity - Main World Network Interceptor
// Runs in world: MAIN to intercept API requests in the page context
// ============================================================
(function() {
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;

    const isTarget = url && (
      url.includes('backend-api/conversation/') ||
      url.includes('chat_conversations/') ||
      url.includes('_/BardChatUi/data/assistant.php') ||
      url.includes('assistant.php')
    );

    if (!isTarget) {
      return originalFetch.apply(this, args);
    }

    return (async () => {
      try {
        const response = await originalFetch.apply(this, args);
        
        // 1. ChatGPT Interception
        if (url.includes('backend-api/conversation/')) {
          try {
            const clone = response.clone();
            const data = await clone.json();
            window.dispatchEvent(new CustomEvent('ci-network-payload', {
              detail: { platform: 'chatgpt', data, pageUrl: window.location.href, timestamp: Date.now() }
            }));
          } catch (e) {
            console.warn('[Interceptor] Failed to parse ChatGPT response:', e);
          }
        }
        // 2. Claude Interception
        else if (url.includes('chat_conversations/') && !url.includes('/page')) {
          try {
            const orgMatch = url.match(/\/organizations\/([a-f0-9-]+)\//);
            const orgId = orgMatch ? orgMatch[1] : null;
            if (orgId) {
              window.__CI_CLAUDE_ORG_ID__ = orgId;
              try { sessionStorage.setItem('ci_claude_org_id', orgId); } catch (e) {}
            }
            const clone = response.clone();
            const data = await clone.json();
            window.dispatchEvent(new CustomEvent('ci-network-payload', {
              detail: { platform: 'claude', data, pageUrl: window.location.href, orgId, timestamp: Date.now() }
            }));
          } catch (e) {
            console.warn('[Interceptor] Failed to parse Claude response:', e);
          }
        }
        // 3. Gemini Interception
        else if (url.includes('_/BardChatUi/data/assistant.php') || url.includes('assistant.php')) {
          try {
            const clone = response.clone();
            const text = await clone.text();
            window.dispatchEvent(new CustomEvent('ci-network-payload', {
              detail: { platform: 'gemini', data: text, pageUrl: window.location.href, timestamp: Date.now() }
            }));
          } catch (e) {
            console.warn('[Interceptor] Failed to parse Gemini response:', e);
          }
        }
        
        return response;
      } catch (err) {
        throw err;
      }
    })();
  };
})();
