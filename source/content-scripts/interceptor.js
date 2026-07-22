// ============================================================
// Capsule Infinity - Main World Network Interceptor
// Runs in world: MAIN to intercept API requests in the page context
// ============================================================
(function() {
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;

    if (url) {
      // 1. ChatGPT Interception
      if (url.includes('backend-api/conversation/')) {
        try {
          const clone = response.clone();
          const data = await clone.json();
          window.dispatchEvent(new CustomEvent('ci-network-payload', {
            detail: { platform: 'chatgpt', data }
          }));
        } catch (e) {
          console.warn('[Interceptor] Failed to parse ChatGPT response:', e);
        }
      }
      // 2. Claude Interception
      else if (url.includes('chat_conversations/') && !url.includes('/page')) {
        try {
          const clone = response.clone();
          const data = await clone.json();
          window.dispatchEvent(new CustomEvent('ci-network-payload', {
            detail: { platform: 'claude', data }
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
            detail: { platform: 'gemini', data: text }
          }));
        } catch (e) {
          console.warn('[Interceptor] Failed to parse Gemini response:', e);
        }
      }
    }
    return response;
  };
})();
