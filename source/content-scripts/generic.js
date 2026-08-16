// ============================================
// Capsule Infinity - Universal Content Script
// Uses MutationObserver for RELIABLE button injection
// Works on EVERY page load, EVERY reload, ALWAYS
// ============================================

(function() {
  'use strict';

  // Check if we are in the automated email compose tab
  if (location.href.includes('mail.google.com') && location.href.includes('ci_auto_send=true')) {
    console.log('[Capsule Infinity] Automated invite email sender tab active.');
    
    const checkInterval = setInterval(() => {
      // Look for Gmail's Send button
      const sendBtn = document.querySelector('div[role="button"][aria-label*="Send"], .aoO, .T-I-atl');
      if (sendBtn) {
        clearInterval(checkInterval);
        console.log('[Capsule Infinity] Send button found. Sending email in 1.5s...');
        setTimeout(() => {
          sendBtn.click();
          console.log('[Capsule Infinity] Email sent! Closing tab in 2s...');
          setTimeout(() => {
            chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
          }, 2000);
        }, 1500);
      }
    }, 500);

    // Timeout safety fallback
    setTimeout(() => {
      clearInterval(checkInterval);
      chrome.runtime.sendMessage({ type: 'CLOSE_TAB' });
    }, 25000);
  }

  const PLATFORM = CapsuleUtils.detectPlatform();
  const FLOATING_ID = 'ci-floating-btn';
  const DIALOGUE_BTN_ID = 'ci-dialogue-btn';
  let observer = null;
  let dialogueObserver = null;
  let injectAttempts = 0;
  const MAX_INJECT_ATTEMPTS = 50;
  let currentCapture = null;

  // ============================================================
  // FIND THE INPUT/DIALOGUE BOX — Platform-specific selectors
  // ============================================================
  const DIALOGUE_SELECTORS = {
    chatgpt: [
      '#prompt-textarea',
      '[contenteditable="true"][data-placeholder]',
      'div.ProseMirror',
      '[id*="prompt"]',
      'form textarea'
    ],
    claude: [
      '[contenteditable="true"]',
      'div[role="textbox"]',
      '[class*="prose"] [contenteditable]',
      'div[aria-label*="prompt" i]',
      '[class*="rich-text-editor"]'
    ],
    gemini: [
      'textarea[aria-label*="prompt" i]',
      'textarea[aria-label*="Enter" i]',
      'textarea[placeholder*="Enter" i]',
      'rich-textarea textarea',
      '[class*="text-input"] textarea',
      'textarea'
    ],
    deepseek: [
      'textarea',
      '[contenteditable="true"]',
      '[role="textbox"]',
      'div[class*="input"] textarea'
    ],
    gmail: [
      '[role="textbox"]',
      'textarea[name="body"]',
      '[contenteditable="true"][aria-label*="body" i]',
      'div[aria-label="Message Body"]'
    ],
    generic: [
      'textarea',
      '[contenteditable="true"]',
      '[role="textbox"]',
      'input[type="text"][placeholder*="message" i]',
      '[class*="chat-input"]',
      '[class*="prompt"] textarea'
    ]
  };

  // ============================================================
  // FIND DIALOGUE BOX with retries
  // ============================================================
  function findDialogueBox() {
    const selectors = DIALOGUE_SELECTORS[PLATFORM] || DIALOGUE_SELECTORS.generic;
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetWidth > 0 && el.offsetHeight > 0) return el;
      } catch(e) {}
    }
    return null;
  }

  // Find the input's parent container (for positioning the drag button)
  function findDialogueContainer() {
    const input = findDialogueBox();
    if (!input) return null;

    // Walk up to find a suitable container (usually the form or input wrapper)
    let el = input;
    for (let i = 0; i < 5; i++) {
      el = el.parentElement;
      if (!el) break;
      const rect = el.getBoundingClientRect();
      if (rect.width > 200 && rect.height > 30) return el;
    }
    return input.parentElement || input;
  }

  // ============================================================
  // INJECT FLOATING CAPTURE BUTTON
  // Always visible, always at bottom-right
  // ============================================================
  function injectFloatingButton() {
    if (document.getElementById(FLOATING_ID)) return;

    const btn = document.createElement('button');
    btn.id = FLOATING_ID;
    btn.className = 'ci-floating-btn';
    btn.title = 'Capsule Infinity - Capture conversation';
    btn.innerHTML = '\u{1F48A}'; // 💊
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleCapture();
    });
    document.body.appendChild(btn);
  }

  // ============================================================
  // INJECT DRAG-DROP BUTTON ON DIALOGUE BOX
  // This button sits RIGHT ON the input area
  // ============================================================
  function injectDialogueButton() {
    const container = findDialogueContainer();
    if (!container) return false;

    // Don't duplicate
    if (document.getElementById(DIALOGUE_BTN_ID)) return true;

    const wrapper = document.createElement('div');
    wrapper.id = DIALOGUE_BTN_ID;
    wrapper.className = 'ci-dialogue-wrapper';
    wrapper.innerHTML = `
      <button class="ci-dialogue-btn" id="ci-dialogue-btn-action" title="Capsule Infinity - Click to inject a capsule">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="6" width="14" height="5" rx="2.5" fill="currentColor" opacity="0.3"/>
          <rect x="2" y="5" width="12" height="5" rx="2.5" fill="currentColor"/>
          <circle cx="8" cy="7.5" r="1" fill="white"/>
        </svg>
        <span class="ci-dialogue-label">Capsule</span>
      </button>
      <div class="ci-dialogue-menu" id="ci-dialogue-menu">
        <div class="ci-dialogue-menu-header">
          <span>\u{1F48A} Capsule Infinity</span>
          <span class="ci-dialogue-menu-count" id="ci-menu-count">0</span>
        </div>
        <div class="ci-dialogue-menu-search">
          <input type="text" placeholder="Search capsules..." id="ci-menu-search" class="ci-menu-search-input" />
        </div>
        <div class="ci-dialogue-menu-list" id="ci-menu-list">
          <div class="ci-menu-empty">No capsules yet</div>
        </div>
      </div>
    `;

    // Position relative to the container
    wrapper.style.position = 'relative';
    const input = findDialogueBox();
    if (input) {
      // Insert before the input, as a sibling
      input.parentElement?.insertBefore(wrapper, input);
    } else {
      container.appendChild(wrapper);
    }

    // Wire up the button
    const actionBtn = wrapper.querySelector('#ci-dialogue-btn-action');
    const menu = wrapper.querySelector('#ci-dialogue-menu');
    const searchInput = wrapper.querySelector('#ci-menu-search');

    actionBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = menu.classList.contains('open');
      if (isOpen) {
        menu.classList.remove('open');
      } else {
        loadCapsuleMenu();
        menu.classList.add('open');
        setTimeout(() => searchInput?.focus(), 50);
      }
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) {
        menu.classList.remove('open');
      }
    });

    // Search in menu
    searchInput?.addEventListener('input', () => {
      loadCapsuleMenu(searchInput.value);
    });

    // Prevent clicks inside menu from propagating
    menu.addEventListener('click', (e) => e.stopPropagation());

    // Bind drag & drop to the input element
    setupInputDragDrop();

    return true;
  }

  // ============================================================
  // LOAD CAPSULES INTO DIALOGUE MENU
  // ============================================================
  async function loadCapsuleMenu(search = '') {
    const list = document.getElementById('ci-menu-list');
    const countEl = document.getElementById('ci-menu-count');
    if (!list) return;

    // Try API first, fall back to local
    let capsules = [];
    try {
      await CapsuleAPI.configure();
      const result = await CapsuleAPI.getCapsules({ search: search || undefined, sortBy: 'newest' });
      capsules = result?.capsules || result || [];
    } catch {
      capsules = await CapsuleStorage.getAllCapsules();
      if (search) {
        const q = search.toLowerCase();
        capsules = capsules.filter(c =>
          c.title?.toLowerCase().includes(q) ||
          c.content?.toLowerCase().includes(q) ||
          (c.tags || []).some(t => t.toLowerCase().includes(q))
        );
      }
    }

    if (countEl) countEl.textContent = capsules.length;

    if (capsules.length === 0) {
      list.innerHTML = '<div class="ci-menu-empty">No capsules found</div>';
      return;
    }

    const pi = CapsuleUtils.getPlatformInfo(PLATFORM);
    list.innerHTML = capsules.slice(0, 20).map(c => {
      const pInfo = CapsuleUtils.getPlatformInfo(c.platform);
      return `
        <div class="ci-menu-item" data-capsule-id="${c.id}" draggable="true">
          <div style="flex:1;min-width:0;">
            <div class="ci-menu-item-title">${CapsuleUtils.sanitize(c.title)}</div>
            <div class="ci-menu-item-meta">
              <span style="color:${pInfo.color}">${pInfo.icon} ${pInfo.name}</span>
              <span>${CapsuleUtils.timeAgo(c.metadata?.createdAt || c.createdAt)}</span>
            </div>
          </div>
          <button class="ci-menu-delete" data-delete-id="${c.id}" title="Delete capsule" style="flex-shrink:0;width:24px;height:24px;border:none;background:transparent;color:#64748b;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;border-radius:4px;transition:all 0.15s;opacity:0.5;" onmouseover="this.style.opacity='1';this.style.color='#ef4444';this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.opacity='0.5';this.style.color='#64748b';this.style.background='transparent'">&times;</button>
        </div>`;
    }).join('');

    // Click to inject
    list.querySelectorAll('.ci-menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.capsuleId;
        injectCapsuleById(id);
        document.getElementById('ci-dialogue-menu')?.classList.remove('open');
      });

      // Drag support
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/capsule-id', item.dataset.capsuleId);
        e.dataTransfer.effectAllowed = 'copy';
        item.style.opacity = '0.5';
        const ghost = document.createElement('div');
        ghost.style.cssText = 'position:fixed;z-index:99999;background:linear-gradient(135deg,#6366f1,#a855f7);color:white;padding:6px 12px;border-radius:8px;font-size:12px;pointer-events:none;box-shadow:0 8px 25px rgba(99,102,241,0.4);';
        ghost.textContent = '\u{1F48A} ' + item.querySelector('.ci-menu-item-title').textContent;
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 0, 0);
        setTimeout(() => ghost.remove(), 0);
      });
      item.addEventListener('dragend', () => {
        item.style.opacity = '1';
      });
    });

    // Delete buttons in dialogue menu
    list.querySelectorAll('.ci-menu-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.cancelBubble = true;
        const id = btn.dataset.deleteId;
        const title = btn.closest('.ci-menu-item')?.querySelector('.ci-menu-item-title')?.textContent || 'this capsule';
        if (!confirm('Delete "' + title + '"?')) return;
        try { await CapsuleAPI.configure(); await CapsuleAPI.deleteCapsule(id); } catch {}
        await CapsuleStorage.deleteCapsule(id);
        showToast('Deleted!', 'success');
        loadCapsuleMenu(searchInput?.value || '');
      });
    });
  }

  // ============================================================
  // INJECT CAPSULE CONTENT INTO THE INPUT
  // ============================================================
  async function injectCapsuleById(id) {
    let capsule = null;

    // Try API first
    try {
      await CapsuleAPI.configure();
      capsule = await CapsuleAPI.request('GET', `/api/capsules/${id}`);
    } catch {
      capsule = await CapsuleStorage.getCapsule(id);
    }

    if (!capsule) {
      showToast('Capsule not found', 'error');
      return;
    }

    const text = " [System Context]: The following text contains information/context I have saved previously. Please use this as reference context for our conversation: \n\n" + (capsule.content || "");
    const input = findDialogueBox();

    if (!input) {
      // Fallback: copy
      await CapsuleUtils.copyToClipboard(text);
      showToast('Copied! Paste into chat.', 'success');
      return;
    }

    // Inject based on input type
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
        'value'
      )?.set;
      if (nativeSetter) nativeSetter.call(input, text);
      else input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.focus();
    } else if (input.contentEditable === 'true') {
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
    }

    // Animation
    const rect = input.getBoundingClientRect();
    CapsuleAnimation.playInjectPulse(rect);
    showToast('Capsule injected!', 'success');
  }

  // ============================================================
  // DRAG & DROP FOR INPUT BOX
  // ============================================================
  function setupInputDragDrop() {
    const input = findDialogueBox();
    if (!input) return;

    if (input.dataset.ciDragDropBound === 'true') return;
    input.dataset.ciDragDropBound = 'true';

    input.addEventListener('dragover', (e) => {
      const isCapsule = e.dataTransfer.types.includes('text/capsule-id') || 
                        e.dataTransfer.types.includes('text/plain');
      if (isCapsule) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        input.classList.add('ci-drag-over');
      }
    });

    input.addEventListener('dragleave', () => {
      input.classList.remove('ci-drag-over');
    });

    input.addEventListener('drop', async (e) => {
      const id = e.dataTransfer.getData('text/capsule-id') || e.dataTransfer.getData('text/plain');
      if (id && id.startsWith('cap_')) {
        e.preventDefault();
        input.classList.remove('ci-drag-over');
        await injectCapsuleById(id);
      }
    });
  }

  // ============================================================
  // CONVERSATION EXTRACTION
  // ============================================================
  // ============================================================
  // CONVERSATION EXTRACTION (Infinite scroll / Lazy-loading support)
  // ============================================================
  function messagesEqual(m1, m2) {
    if (!m1 || !m2) return false;
    return m1.role === m2.role && m1.content.trim() === m2.content.trim();
  }

  function mergeMessages(newBatch, accumulated) {
    if (accumulated.length === 0) return newBatch;
    if (newBatch.length === 0) return accumulated;

    // Find the longest overlap where the end of newBatch matches the start of accumulated
    const maxSearch = Math.min(newBatch.length, accumulated.length);
    for (let len = maxSearch; len > 0; len--) {
      let match = true;
      for (let i = 0; i < len; i++) {
        const bMsg = newBatch[newBatch.length - len + i];
        const aMsg = accumulated[i];
        if (!messagesEqual(bMsg, aMsg)) {
          match = false;
          break;
        }
      }
      if (match) {
        return [...newBatch.slice(0, newBatch.length - len), ...accumulated];
      }
    }
    return [...newBatch, ...accumulated];
  }

  /**
   * Helper to check if a DOM node belongs to injected Extension UI
   */
  function isExtensionElement(el) {
    if (!el || !el.closest) return false;
    return !!el.closest([
      '#ci-capture-modal',
      '[class*="ci-"]',
      '[id*="ci-"]',
      '[class*="capsule-"]',
      '[id*="capsule-"]',
      '#capsule-injected-root',
      '#capsule-root',
      '.capsule-limit-overlay',
      '.capsule-limit-card',
      '.capsule-pricing-options',
      '.btn-pro',
      '.btn-dismiss',
      '.ci-banner-wrapper',
      '.ci-feedback-overlay',
      '.ci-toast',
      '.ci-floating-btn',
      '.ci-dialogue-wrapper'
    ].join(', '));
  }

  /**
   * Deep Clone & Sanitize DOM Node before text extraction
   * Removes all inputs, file attachments, images, svgs, buttons, and extension UI elements
   */
  function getSanitizedText(el) {
    if (!el) return '';
    try {
      if (isExtensionElement(el)) return '';
      const clone = el.cloneNode(true);
      const injectedSelectors = [
        'input', '[type="file"]', 'img', 'svg', 'button', '.file-picker', 'label[for*="file" i]',
        '#ci-capture-modal', '[class*="ci-"]', '[id*="ci-"]',
        '[class*="capsule-"]', '[id*="capsule-"]', '#capsule-injected-root', '#capsule-root',
        '.capsule-limit-overlay', '.capsule-limit-card', '.capsule-pricing-options',
        '.btn-pro', '.btn-dismiss', '.ci-banner-wrapper', '.ci-feedback-overlay',
        '.ci-toast', '.ci-floating-btn', '.ci-dialogue-wrapper'
      ].join(', ');

      clone.querySelectorAll(injectedSelectors).forEach(e => {
        try { e.remove(); } catch(err) {}
      });

      let text = clone.innerText?.trim() || '';
      // Clean residual raw HTML markup tags if present
      text = text.replace(/<[^>]*>/g, '').trim();
      text = text.replace(/^(You|Gemini|Claude|ChatGPT|User|Assistant)\s+said:?/i, '').trim();
      return text;
    } catch(e) {
      return el.innerText?.trim() || '';
    }
  }

  // ============================================================
  // HYBRID EXTRACTION ENGINE (v2.1)
  // ============================================================

  // Platform API Parsers
  const ChatGPTAdapter = {
    parse(data) {
      if (!data || !data.mapping) return null;
      const msgs = [];
      Object.values(data.mapping).forEach(node => {
        const msg = node.message;
        if (msg && msg.content && msg.content.parts) {
          const role = msg.author?.role || 'user';
          const text = msg.content.parts.filter(p => typeof p === 'string').join('\n').trim();
          if (text && role !== 'system') {
            msgs.push({ role: role === 'assistant' ? 'assistant' : 'user', content: text });
          }
        }
      });
      return msgs;
    }
  };

  const ClaudeAdapter = {
    parse(data) {
      const rawMsgs = data?.chat_messages || (Array.isArray(data) ? data : data?.messages);
      if (!Array.isArray(rawMsgs)) return null;
      const msgs = [];
      rawMsgs.forEach(msg => {
        const role = msg.sender === 'assistant' ? 'assistant' : 'user';
        let text = '';
        if (typeof msg.text === 'string') {
          text = msg.text.trim();
        } else if (Array.isArray(msg.content)) {
          text = msg.content.map(c => c.text || '').join('\n').trim();
        }
        if (text) {
          msgs.push({ role, content: text });
        }
      });
      return msgs;
    }
  };

  const GeminiAdapter = {
    parse(rawText) {
      if (!rawText || typeof rawText !== 'string') return null;
      try {
        const lines = rawText.split('\n');
        const msgs = [];
        for (const line of lines) {
          if (line.includes('wrt.r')) {
            const startIdx = line.indexOf('[');
            if (startIdx !== -1) {
              const parsed = JSON.parse(line.substring(startIdx));
              const traverse = (obj) => {
                if (Array.isArray(obj)) {
                  obj.forEach(traverse);
                } else if (typeof obj === 'string' && obj.startsWith('[[')) {
                  try {
                    const inner = JSON.parse(obj);
                    inner.forEach(item => {
                      if (Array.isArray(item)) {
                        const userPrompt = item[2]?.[0]?.[0];
                        const assistantText = item[1]?.[0]?.[0];
                        if (userPrompt && typeof userPrompt === 'string') {
                          msgs.push({ role: 'user', content: userPrompt });
                        }
                        if (assistantText && typeof assistantText === 'string') {
                          msgs.push({ role: 'assistant', content: assistantText });
                        }
                      }
                    });
                  } catch (e) {}
                }
              };
              traverse(parsed);
            }
          }
        }
        if (msgs.length > 0) return msgs;
      } catch (e) {
        console.warn('[GeminiAdapter] Failed to parse batch payload:', e);
      }
      return null;
    }
  };

  // In-memory cache of last intercepted conversation payload, strictly bound to URL
  let lastInterceptedCache = {
    pageUrl: null,
    messages: null,
    timestamp: 0
  };

  // Invalidate cache immediately on navigation / URL change
  let activeNavUrl = window.location.href;
  const invalidateStaleNetworkCache = () => {
    if (window.location.href !== activeNavUrl) {
      activeNavUrl = window.location.href;
      lastInterceptedCache = { pageUrl: null, messages: null, timestamp: 0 };
    }
  };
  window.addEventListener('popstate', invalidateStaleNetworkCache);
  window.addEventListener('hashchange', invalidateStaleNetworkCache);
  setInterval(invalidateStaleNetworkCache, 1000);

  window.addEventListener('ci-network-payload', (event) => {
    const { platform, data, pageUrl } = event.detail;
    const targetUrl = pageUrl || window.location.href;

    // Discard payload if it belongs to a different URL than current window
    if (targetUrl !== window.location.href) {
      return;
    }

    let msgs = null;
    try {
      if (platform === 'chatgpt') {
        msgs = ChatGPTAdapter.parse(data);
      } else if (platform === 'claude') {
        msgs = ClaudeAdapter.parse(data);
      } else if (platform === 'gemini') {
        msgs = GeminiAdapter.parse(data);
      }

      if (msgs && msgs.length > 0) {
        lastInterceptedCache = {
          pageUrl: window.location.href,
          messages: msgs,
          timestamp: Date.now()
        };
        console.log(`[Capsule Extractor] Intercepted ${msgs.length} messages for target URL: ${window.location.href}`);
      }
    } catch (e) {
      console.warn('[Capsule Extractor] Error processing intercepted payload:', e);
    }
  });

  const ExtractionController = {
    async tryNetworkExtraction() {
      // 1. Check in-memory intercepted cache with STRICT URL MATCH & freshness (< 5 mins)
      if (
        lastInterceptedCache.messages &&
        lastInterceptedCache.messages.length > 0 &&
        lastInterceptedCache.pageUrl === window.location.href &&
        (Date.now() - lastInterceptedCache.timestamp) < 300000
      ) {
        console.log(`[Capsule Extractor] Using URL-matched Tier 1 payload for ${window.location.href}`);
        return lastInterceptedCache.messages;
      }

      // 2. Fallback to active API fetch (like ChatGPT endpoints)
      if (PLATFORM === 'chatgpt') {
        const match = location.pathname.match(/\/c\/([a-f0-9-]+)/);
        if (match && match[1]) {
          try {
            const resp = await fetch(`https://chatgpt.com/backend-api/conversation/${match[1]}`, { credentials: 'include' });
            if (resp.ok) {
              const data = await resp.json();
              const msgs = ChatGPTAdapter.parse(data);
              if (msgs && msgs.length > 0) return msgs;
            }
          } catch (e) {}
        }
      }
      return null;
    },

    async tryTier2ForceLoadAndSelectAll(container) {
      let mountedCount = 0;
      let observer = null;

      const getMessageElements = () => {
        if (PLATFORM === 'chatgpt') {
          return container.querySelectorAll('[data-message-author-role]');
        } else if (PLATFORM === 'claude') {
          return container.querySelectorAll('[class*="message"], [data-testid*="message"]');
        } else if (PLATFORM === 'gemini') {
          return container.querySelectorAll('.query-content, message-content, [class*="message"]');
        } else {
          return container.querySelectorAll('[data-message-author-role], [class*="message"], [class*="query"]');
        }
      };

      mountedCount = getMessageElements().length;

      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(() => {
          mountedCount = getMessageElements().length;
        });
        observer.observe(container, { childList: true, subtree: true });
      }

      const originalScrollTop = container.scrollTop;
      let scrollAttempts = 0;
      const maxAttempts = 100;
      let noNewContentCount = 0;
      let emptyMutationCount = 0;
      let lastMountedCount = mountedCount;

      try {
        while (scrollAttempts < maxAttempts) {
          const prevScrollTop = container.scrollTop;

          // Aggressive scroll up
          container.scrollTop = Math.max(0, container.scrollTop - 1500);
          container.dispatchEvent(new Event('scroll', { bubbles: true }));

          if (mountedCount === lastMountedCount) {
            emptyMutationCount++;
          } else {
            emptyMutationCount = 0;
            lastMountedCount = mountedCount;
          }

          if (container.scrollTop === prevScrollTop || container.scrollTop === 0) {
            noNewContentCount++;
          } else {
            noNewContentCount = 0;
          }

          if (noNewContentCount >= 2 && emptyMutationCount >= 5) {
            break;
          }

          await new Promise(resolve => setTimeout(resolve, 50));
          scrollAttempts++;
        }

        // Fix Bug 2: read via getSanitizedText to exclude extension UI completely
        const rawText = getSanitizedText(container);
        console.log('[Capsule Capture Debug] TIER 2 RAW LENGTH:', rawText.length, 'PREVIEW:', rawText.slice(0, 300));
        
        const blocksCount = (rawText.match(/^(You|Gemini|Claude|ChatGPT|User|Assistant|System)\s+said:?/gim) || []).length;
        const ratio = mountedCount > 0 ? (blocksCount / mountedCount) : 1;

        if (mountedCount > 4 && (ratio < 0.7 || ratio > 1.4)) {
          console.warn(`[Tier 2 Sanity Check] Mismatch: blocksCount=${blocksCount}, mountedCount=${mountedCount}. Falling through to Tier 3.`);
          throw new Error('Virtualized trimming detected');
        }

        return rawText;
      } finally {
        if (observer) observer.disconnect();
        container.scrollTop = originalScrollTop;
      }
    },

    async fallbackDOMAccumulation(container) {
      if (typeof DOMAccumulator === 'undefined') {
        console.warn('[Capsule Extractor] DOMAccumulator script not loaded, using legacy walker.');
        return this.legacyWalker(container);
      }
      
      const getMessageKey = (msg) => {
        if (!msg || !msg.content) return null;
        return `${msg.role}_${msg.content.substring(0, 100)}`;
      };

      const progressCallback = (count) => {
        showToast(`Captured ${count} messages so far...`, 'info');
      };

      // Fix Bug 2: pass container context to query visible messages within the scroll container
      return await DOMAccumulator.accumulate(
        container, 
        () => extractCurrentVisibleMessages(container), 
        getMessageKey,
        progressCallback
      );
    },

    async legacyWalker(container) {
      let accumulatedMessages = [];
      let scrollAttempts = 0;
      const maxAttempts = 30;
      let noNewContentCount = 0;
      const originalScrollTop = container.scrollTop;

      while (scrollAttempts < maxAttempts) {
        const currentMessages = extractCurrentVisibleMessages(container);
        accumulatedMessages = mergeMessages(currentMessages, accumulatedMessages);
        const lastScrollTop = container.scrollTop;
        container.scrollTop = Math.max(0, container.scrollTop - 600);
        container.dispatchEvent(new Event('scroll', { bubbles: true }));

        if (container.scrollTop === lastScrollTop || container.scrollTop === 0) {
          noNewContentCount++;
        } else {
          noNewContentCount = 0;
        }
        if (noNewContentCount >= 2) break;

        await new Promise(resolve => setTimeout(resolve, 100));
        scrollAttempts++;
      }
      container.scrollTop = originalScrollTop;
      return accumulatedMessages;
    },

    async extract() {
      // Tier 1: Network Capture (Lossless & Zero scroll)
      try {
        const apiMessages = await this.tryNetworkExtraction();
        if (apiMessages && apiMessages.length > 0) {
          console.log('[Capsule Extractor] Using Tier 1 (Network Interception).');
          return apiMessages;
        }
      } catch (err) {
        console.warn('[Capsule Extractor] Tier 1 network fetch failed:', err);
      }

      const container = findScrollContainer();
      if (!container) {
        console.warn('[Capsule Extractor Debug] No scroll container found, using fallback visible elements.');
        return extractCurrentVisibleMessages(document);
      }

      // Check currently visible messages first (Zero scroll jump)
      const visibleMsgs = extractCurrentVisibleMessages(container);
      if (visibleMsgs && visibleMsgs.length > 0) {
        console.log(`[Capsule Extractor] Captured ${visibleMsgs.length} visible messages directly without page scroll.`);
        return visibleMsgs;
      }

      // Tier 2: Force-Load & Select-All (Restores scroll position)
      try {
        console.log('[Capsule Extractor] Attempting Tier 2: Force-Load + Select-All.');
        const tier2Text = await this.tryTier2ForceLoadAndSelectAll(container);
        if (tier2Text) {
          console.log('[Capsule Extractor] Using Tier 2: Force-Load + Select-All.');
          return tier2Text;
        }
      } catch (err) {
        console.warn('[Capsule Extractor] Tier 2 fallback triggered due to:', err.message);
      }

      // Tier 3: Scroll-Accumulate (Last Resort)
      console.log('[Capsule Extractor] Using Tier 3: Scroll-Accumulate.');
      return await this.fallbackDOMAccumulation(container);
    }
  };

  async function fetchFullChatHistory() {
    return await ExtractionController.extract();
  };

  function extractCurrentVisibleMessages(container = document) {
    const messages = [];
    const root = container || document;

    try {
      if (PLATFORM === 'chatgpt') {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
          acceptNode(node) {
            try {
              if (isExtensionElement(node)) {
                return NodeFilter.FILTER_REJECT;
              }
              if (node && node.hasAttribute && node.hasAttribute('data-message-author-role')) {
                return NodeFilter.FILTER_ACCEPT;
              }
            } catch (e) {}
            return NodeFilter.FILTER_SKIP;
          }
        });
        let node;
        while (node = walker.nextNode()) {
          try {
            const role = node.getAttribute('data-message-author-role') || 'unknown';
            const text = getSanitizedText(node);
            if (text && text.length > 5) messages.push({ role, content: text });
          } catch (e) {}
        }
      } else if (PLATFORM === 'claude') {
        root.querySelectorAll('[class*="message"], [data-testid]').forEach(el => {
          try {
            if (!el || isExtensionElement(el)) return;
            const text = getSanitizedText(el);
            if (!text || text.length < 5) return;
            const testId = el.getAttribute('data-testid') || '';
            const role = testId.includes('human') || testId.includes('user') ? 'user' : 'assistant';
            if (messages.length > 0 && messages[messages.length - 1].content === text) return;
            messages.push({ role, content: text });
          } catch (e) {}
        });
      } else if (PLATFORM === 'gemini') {
        root.querySelectorAll('model-response, [class*="query-text"], [class*="response-container"]').forEach(el => {
          try {
            if (!el || isExtensionElement(el)) return;
            const text = getSanitizedText(el);
            if (!text || text.length < 5) return;
            const tagName = el.tagName?.toLowerCase() || '';
            const isUser = tagName === 'model-response' ? false : true;
            messages.push({ role: isUser ? 'user' : 'assistant', content: text });
          } catch (e) {}
        });
      } else if (PLATFORM === 'deepseek') {
        root.querySelectorAll('.ds-message').forEach(el => {
          try {
            if (!el || isExtensionElement(el)) return;
            const isAssistant = el.querySelector('.ds-markdown') !== null;
            if (isAssistant) {
              const markdownEl = el.querySelector('.ds-markdown');
              let text = markdownEl ? getSanitizedText(markdownEl) : '';
              if (text) {
                const thinkingEl = el.querySelector('[class*="think"], [class*="reasoning"], .e1675d8b');
                if (thinkingEl && thinkingEl !== markdownEl) {
                  const thinkingText = getSanitizedText(thinkingEl);
                  if (thinkingText && thinkingText.length > 0) {
                    text = `<thinking>\n${thinkingText}\n</thinking>\n\n${text}`;
                  }
                }
                messages.push({ role: 'assistant', content: text });
              }
            } else {
              const text = getSanitizedText(el);
              if (text && text.length > 0) {
                messages.push({ role: 'user', content: text });
              }
            }
          } catch (e) {}
        });
      } else {
        root.querySelectorAll('[data-message-author-role], .message-content, .prose, [role="log"] > div').forEach(el => {
          try {
            if (!el || isExtensionElement(el)) return;
            const text = getSanitizedText(el);
            if (text && text.length > 5) {
              const role = el.getAttribute('data-message-author-role') || 'unknown';
              messages.push({ role, content: text });
            }
          } catch (e) {}
        });
      }
    } catch (outerErr) {
      console.warn('[Capture Error] Failed to extract visible messages:', outerErr);
    }

    return messages;
  }

  function findScrollContainer() {
    let selectors = [];
    if (PLATFORM === 'chatgpt') {
      selectors = ['div[class*="react-scroll-to-bottom"]', 'main div.overflow-y-auto', 'main'];
    } else if (PLATFORM === 'claude') {
      selectors = ['div.overflow-y-auto', 'main'];
    } else if (PLATFORM === 'gemini') {
      selectors = ['gai-slotted-scroll-container', '.chat-history', 'div.overflow-y-auto', 'main'];
    } else if (PLATFORM === 'deepseek') {
      selectors = ['div[class*="message-list"]', 'div.overflow-y-auto', 'main'];
    } else {
      selectors = ['div.overflow-y-auto', 'main'];
    }

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.scrollHeight > el.clientHeight) {
        return el;
      }
    }

    const messageNode = document.querySelector('[data-message-author-role], [class*="message"], [class*="query-text"], .ds-message, [role="log"]');
    if (messageNode) {
      let parent = messageNode.parentElement;
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent);
        const overflowY = style.overflowY || style.overflow;
        if ((overflowY.includes('auto') || overflowY.includes('scroll')) && parent.scrollHeight > parent.clientHeight) {
          return parent;
        }
        parent = parent.parentElement;
      }
    }
    return document.querySelector('main') || document.documentElement || document.body;
  }

  // ============================================================
  // Part 19: Conversation Fingerprinting & Deduplication Cache
  // ============================================================
  function getConversationFingerprint(platform, conversationUrl, visibleMessageCount, lastMessageSnippet) {
    const cleanSnippet = (lastMessageSnippet || '').substring(0, 80).replace(/\s+/g, ' ').trim();
    return `${platform}::${conversationUrl}::${visibleMessageCount}::${cleanSnippet}`;
  }

  async function getCachedCapture(conversationUrl, fingerprint) {
    try {
      const res = await chrome.storage.local.get(['captureCache']);
      const cache = res.captureCache || {};
      const entry = cache[conversationUrl];
      // Only treat as cache hit if it was generated by the AI backend
      if (entry && entry.fingerprint === fingerprint && entry.servedBy) {
        console.log('[Capsule Cache] Fingerprint match! Reusing cached AI capsule for:', conversationUrl);
        return entry;
      }
    } catch (e) {
      console.warn('[Capsule Cache] Error reading cache:', e);
    }
    return null;
  }

  async function setCachedCapture(conversationUrl, fingerprint, captureData) {
    // Only cache if the capsule was served by the AI backend
    if (!captureData.servedBy) return;

    try {
      const res = await chrome.storage.local.get(['captureCache']);
      let cache = res.captureCache || {};

      // Prune entries older than 30 days and any non-AI entries
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const cleaned = {};
      for (const [url, item] of Object.entries(cache)) {
        if (item && item.servedBy && item.capturedAt && item.capturedAt > thirtyDaysAgo) {
          cleaned[url] = item;
        }
      }

      cleaned[conversationUrl] = {
        fingerprint: fingerprint,
        compressedContent: captureData.compressedContent,
        savingsPercent: captureData.savingsPercent,
        rawTokens: captureData.rawTokens,
        compressedTokens: captureData.compressedTokens,
        json: captureData.json || [],
        servedBy: captureData.servedBy,
        capturedAt: Date.now()
      };

      await chrome.storage.local.set({ captureCache: cleaned });
      console.log('[Capsule Cache] Saved new AI capsule cache entry for:', conversationUrl);
    } catch (e) {
      console.warn('[Capsule Cache] Error saving cache:', e);
    }
  }

  async function extractConversationAsync() {
    if (PLATFORM === 'gmail') {
      const subject = document.querySelector('h2.hP, [data-thread-id] h2')?.innerText?.trim() || '';
      const from = document.querySelector('.go .gD')?.getAttribute('email') || '';
      const body = document.querySelector('.a3s.aiL, .ii.gt')?.innerText?.trim() || '';
      if (body) {
        const content = `From: ${from}\nSubject: ${subject}\n---\n${body}`;
        return {
          title: `Email: ${subject || 'No Subject'}`,
          content: content,
          rawContent: content,
          compressedContent: content,
          savingsPercent: 0,
          rawTokens: CapsuleCompressor ? CapsuleCompressor.estimateTokens(content) : 0,
          compressedTokens: CapsuleCompressor ? CapsuleCompressor.estimateTokens(content) : 0,
          messageCount: 1,
          platform: PLATFORM
        };
      }
      return null;
    }

    const messagesOrText = await fetchFullChatHistory();

    console.log('[Capsule Capture Debug] Raw messagesOrText type:', typeof messagesOrText, Array.isArray(messagesOrText) ? `Array size: ${messagesOrText.length}` : `Text length: ${messagesOrText ? messagesOrText.length : 0}`);
    if (typeof messagesOrText === 'string') {
      console.log('[Capsule Capture Debug] RAW LENGTH:', messagesOrText.length, 'PREVIEW:', messagesOrText.slice(0, 300));
    }

    if (!messagesOrText || messagesOrText.length === 0) {
      const main = document.querySelector('main, [role="main"], .conversation');
      if (main) {
        const text = getSanitizedText(main);
        if (text && text.length > 20) {
          return { title: document.title || 'Conversation', content: text.substring(0, 100000), rawContent: text, compressedContent: text, messageCount: 1, platform: PLATFORM };
        }
      }
      return null;
    }

    let rawFormatted = '';
    let messageCount = 0;
    let titleSrc = '';

    if (Array.isArray(messagesOrText)) {
      rawFormatted = messagesOrText.map(m => `[${m.role.toUpperCase()}]:\n${m.content}`).join('\n\n---\n\n').substring(0, 100000);
      messageCount = messagesOrText.length;
      const firstUser = messagesOrText.find(m => m.role === 'user');
      titleSrc = firstUser ? firstUser.content : document.title;
    } else {
      rawFormatted = String(messagesOrText).substring(0, 100000);
      messageCount = (rawFormatted.match(/\[(USER|ASSISTANT|SYSTEM|YOU|GEMINI|CLAUDE|CHATGPT)\]:/gi) || []).length || 1;
      titleSrc = document.title || 'Captured Conversation';
    }

    let rawTitle = titleSrc.substring(0, 80).split('\n')[0];
    let title = rawTitle.replace(/^(You|Gemini|Claude|ChatGPT|User|Assistant)\s+said:?\s*/i, '').trim();
    if (!title || title.toLowerCase() === 'you said') {
      title = `${CapsuleUtils.getPlatformInfo(PLATFORM).name} Chat`;
    }

    console.log(`[Capsule Capture Assertion] Page URL: ${window.location.href} | Extracted preview: "${rawFormatted.slice(0, 120).replace(/\n/g, ' ')}"`);

    // Part 19: Check deduplication cache before calling AI / local compressor
    let lastMessageSnippet = '';
    if (Array.isArray(messagesOrText) && messagesOrText.length > 0) {
      const lastMsg = messagesOrText[messagesOrText.length - 1];
      lastMessageSnippet = lastMsg ? (lastMsg.content || '') : '';
    } else if (typeof rawFormatted === 'string') {
      lastMessageSnippet = rawFormatted.slice(-150);
    }

    const conversationUrl = window.location.href.split('#')[0];
    const currentFingerprint = getConversationFingerprint(PLATFORM, conversationUrl, messageCount, lastMessageSnippet);

    const cached = await getCachedCapture(conversationUrl, currentFingerprint);
    if (cached) {
      console.log('[Capsule Cache] Conversation unchanged — returning cached capsule without AI API call.');
      return {
        title: title || `${CapsuleUtils.getPlatformInfo(PLATFORM).name} Chat`,
        content: cached.compressedContent,
        rawContent: rawFormatted,
        compressedContent: cached.compressedContent,
        savingsPercent: cached.savingsPercent,
        rawTokens: cached.rawTokens,
        compressedTokens: cached.compressedTokens,
        messageCount: messageCount,
        platform: PLATFORM,
        json: cached.json || [],
        servedBy: cached.servedBy,
        isFromCache: true
      };
    }

    let compressedObj = { compressedContent: rawFormatted, savingsPercent: 0, rawTokens: 0, compressedTokens: 0, json: [] };
    let aiServedBy = null;

    // Try AI Compression Backend via Edge Function first
    let aiRes = null;
    console.time('[Capsule Capture Timing] AI Edge Function Compression');
    try {
      if (typeof CapsuleStorage !== 'undefined' && CapsuleStorage.requestAICompression) {
        console.log('[Capsule AI Path] CapsuleStorage.requestAICompression found, calling Edge Function...');
        console.log('[Capsule AI Path] Transcript length being sent:', rawFormatted.length);
        aiRes = await CapsuleStorage.requestAICompression(rawFormatted);
        console.log('[Capsule AI Path] Edge Function response:', JSON.stringify(aiRes).substring(0, 500));
      } else {
        console.warn('[Capsule AI Path] CapsuleStorage.requestAICompression NOT available — skipping AI path');
      }
    } catch (e) {
      console.warn('[Capsule AI Path] AI Backend compression error, falling back to local engine:', e);
    } finally {
      console.timeEnd('[Capsule Capture Timing] AI Edge Function Compression');
    }

    if (aiRes && aiRes.capsule) {
      // Reconstruct human-readable narrative markdown from backend JSON schema (Part 13)
      const jsonCapsule = aiRes.capsule;
      aiServedBy = aiRes.servedBy;

      const lines = ["**ACTIVE CAPSULE CONTEXT**"];
      if (jsonCapsule.user_intent) {
        lines.push(`• **User Intent**: ${jsonCapsule.user_intent}`);
      } else if (jsonCapsule.intent) {
        lines.push(`• **User Intent**: ${jsonCapsule.intent}`);
      }

      if (jsonCapsule.key_decisions) {
        lines.push(`• **Key decisions made**: ${jsonCapsule.key_decisions}`);
      } else if (Array.isArray(jsonCapsule.decisions) && jsonCapsule.decisions.length > 0) {
        lines.push(`• **Key decisions made**: ${jsonCapsule.decisions.join(' ')}`);
      }

      if (jsonCapsule.constraints) {
        lines.push(`• **Constraints or requirements identified**: ${jsonCapsule.constraints}`);
      } else if (Array.isArray(jsonCapsule.constraints) && jsonCapsule.constraints.length > 0) {
        lines.push(`• **Constraints or requirements identified**: ${jsonCapsule.constraints.join(' ')}`);
      }

      if (jsonCapsule.technicalities) {
        lines.push(`• **Technicalities/Details**: ${jsonCapsule.technicalities}`);
      } else if (Array.isArray(jsonCapsule.facts) && jsonCapsule.facts.length > 0) {
        lines.push(`• **Technicalities/Details**: ${jsonCapsule.facts.join(' ')}`);
      }

      const md = lines.join("\n\n");

      const rawTokens = CapsuleCompressor ? CapsuleCompressor.estimateTokens(rawFormatted) : Math.ceil(rawFormatted.length / 4);
      const compressedTokens = CapsuleCompressor ? CapsuleCompressor.estimateTokens(md) : Math.ceil(md.length / 4);
      const savingsPercent = rawTokens > 0 ? Math.max(0, Math.round(((rawTokens - compressedTokens) / rawTokens) * 100)) : 0;

      compressedObj = {
        compressedContent: md.trim(),
        savingsPercent,
        rawTokens,
        compressedTokens,
        json: [jsonCapsule]
      };
    } else {
      // Handle AI Backend Errors / Limits / Logged out fallback
      if (aiRes?.error === "LIMIT_REACHED") {
        setTimeout(() => showLimitReachedModal(aiRes.monthlyLimit || 30), 500);
      } else if (aiRes?.error === "SESSION_EXPIRED") {
        // Part 16: Session was present but expired, and refresh failed — user must re-login
        console.warn('[Capsule AI Path] Session expired and refresh failed. Showing sign-in nudge.');
        setTimeout(() => showLoggedOutBanner(), 500);
      } else if (aiRes?.error === "NOT_LOGGED_IN") {
        setTimeout(() => showLoggedOutBanner(), 500);
      } else if (aiRes?.error) {
        console.warn('[Capsule AI Path] AI backend returned error:', aiRes.error, aiRes.raw || '');
      }

      // Fallback to local rule-based compressor
      if (typeof CapsuleCompressor !== 'undefined') {
        const existingEntities = currentCapture?.json || [];
        compressedObj = CapsuleCompressor.compress(messagesOrText, { 
          title: title,
          existingEntities: existingEntities
        });
      }
    }

    // Part 19: Save newly computed compression to cache
    if (compressedObj && compressedObj.compressedContent) {
      await setCachedCapture(conversationUrl, currentFingerprint, {
        compressedContent: compressedObj.compressedContent,
        savingsPercent: compressedObj.savingsPercent,
        rawTokens: compressedObj.rawTokens,
        compressedTokens: compressedObj.compressedTokens,
        json: compressedObj.json || [],
        servedBy: aiServedBy
      });
    }

    return {
      title: title || `${CapsuleUtils.getPlatformInfo(PLATFORM).name} Chat`,
      content: compressedObj.compressedContent,
      rawContent: rawFormatted,
      compressedContent: compressedObj.compressedContent,
      savingsPercent: compressedObj.savingsPercent,
      rawTokens: compressedObj.rawTokens,
      compressedTokens: compressedObj.compressedTokens,
      messageCount: messageCount,
      platform: PLATFORM,
      json: compressedObj.json || [],
      servedBy: aiServedBy
    };
  }

  let captureBannerInterval = null;

  function showCaptureLoadingBanner() {
    if (captureBannerInterval) clearInterval(captureBannerInterval);

    const statusMessages = [
      "Reading your entire life story… give us a sec.",
      "Condensing 10,000 words of brilliance into a tiny capsule.",
      "Arguing with the AI about what actually matters in this chat...",
      "Extracting actual facts and ignoring the fluff.",
      "Reading between the lines…",
      "Compressing the important bits…",
      "Almost there…"
    ];

    let msgIdx = 0;

    let wrapper = document.querySelector('.ci-banner-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'ci-banner-wrapper';
      document.body.appendChild(wrapper);
    }

    // Remove any existing capture loading banner
    document.querySelector('.ci-banner-capture-loading')?.remove();

    const banner = document.createElement('div');
    banner.className = 'ci-banner ci-banner-capture-loading';
    banner.innerHTML = `
      <span class="ci-banner-icon">⚡</span>
      <span class="ci-banner-text">${statusMessages[0]}</span>
    `;

    wrapper.appendChild(banner);

    // Trigger entrance animation next frame
    requestAnimationFrame(() => {
      banner.classList.add('ci-banner-visible');
    });

    // Rotate messages every 2.2 seconds
    captureBannerInterval = setInterval(() => {
      msgIdx = (msgIdx + 1) % statusMessages.length;
      const textEl = banner.querySelector('.ci-banner-text');
      if (textEl) {
        textEl.style.opacity = '0';
        textEl.style.transform = 'translateY(-4px)';
        setTimeout(() => {
          textEl.textContent = statusMessages[msgIdx];
          textEl.style.opacity = '1';
          textEl.style.transform = 'translateY(0)';
        }, 150);
      }
    }, 2200);
  }

  function updateCaptureLoadingBannerSuccess(message = "Capsule captured successfully!") {
    if (captureBannerInterval) {
      clearInterval(captureBannerInterval);
      captureBannerInterval = null;
    }
    const banner = document.querySelector('.ci-banner-capture-loading');
    if (banner) {
      banner.className = 'ci-banner ci-banner-capture-success ci-banner-visible';
      const icon = banner.querySelector('.ci-banner-icon');
      const text = banner.querySelector('.ci-banner-text');
      if (icon) icon.textContent = '✨';
      if (text) {
        text.textContent = message;
        text.style.opacity = '1';
        text.style.color = '#10b981';
      }
      setTimeout(() => hideCaptureLoadingBanner(), 1400);
    }
  }

  function hideCaptureLoadingBanner() {
    if (captureBannerInterval) {
      clearInterval(captureBannerInterval);
      captureBannerInterval = null;
    }
    const banner = document.querySelector('.ci-banner-capture-loading, .ci-banner-capture-success');
    if (banner) {
      banner.classList.remove('ci-banner-visible');
      banner.classList.add('ci-banner-exiting');
      setTimeout(() => {
        banner.remove();
        if (activeBannerEl === banner) activeBannerEl = null;
      }, 220);
    }
  }

  // ============================================================
  // CAPTURE HANDLER with Instant Loading Feedback & Animation
  // ============================================================
  async function handleCapture() {
    // 1. Trigger instant UI loading banner synchronously on click before network/scraping
    showCaptureLoadingBanner();

    try {
      const conv = await extractConversationAsync();

      if (!conv || !conv.content) {
        hideCaptureLoadingBanner();
        showToast('No conversation found to capture', 'error');
        return;
      }

      // Smoothly transition banner state to success
      if (conv.isFromCache) {
        updateCaptureLoadingBannerSuccess("Using existing capsule — no changes since last capture");
        showToast('Using existing capsule (no changes)', 'info');
      } else {
        updateCaptureLoadingBannerSuccess("Capsule captured successfully!");
      }

      // Get source rect for animation
      const sourceEl = document.querySelector('main, [role="main"]') || document.body;
      const sourceRect = sourceEl.getBoundingClientRect();

      // Play rolling paper animation
      CapsuleAnimation.playCaptureAnimation(sourceRect, () => {
        // After animation, show the save modal
        showCaptureModal(conv);
      });
    } catch (err) {
      hideCaptureLoadingBanner();
      console.error('[Capture] Capture failed or timed out:', err);
      showToast(err.message || 'Capture timed out', 'error');
    }
  }

  // ============================================================
  // CAPTURE MODAL
  // ============================================================
  function showCaptureModal(conv) {
    currentCapture = conv;
    removeModal();

    const overlay = document.createElement('div');
    overlay.className = 'ci-modal-overlay';
    overlay.id = 'ci-capture-modal';
    const pi = CapsuleUtils.getPlatformInfo(PLATFORM);

    const savingsText = currentCapture.savingsPercent > 0 ? `⚡ ${currentCapture.savingsPercent}% Tokens Saved (~${currentCapture.compressedTokens} tokens)` : '';

    const engineLabel = currentCapture.servedBy 
      ? `AI (rich format)`
      : `Local (basic format)`;

    overlay.innerHTML = `
      <div class="ci-modal">
        <div class="ci-modal-header">
          <h3>\u{1F48A} Capture as Capsule</h3>
          <button class="ci-modal-close" id="ci-modal-close">&times;</button>
        </div>
        <div class="ci-modal-body">
          <div class="ci-form-group">
            <label class="ci-form-label">Title</label>
            <input class="ci-form-input" id="ci-cap-title" value="${CapsuleUtils.sanitize(currentCapture.title)}" placeholder="Name your capsule..." />
          </div>
          <div class="ci-form-group">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <label class="ci-form-label" style="margin:0;">Content <span class="ci-platform-badge" style="background:${pi.color}20;color:${pi.color};margin-left:6px;">${pi.icon} ${pi.name} \u00B7 ${engineLabel} \u00B7 ${currentCapture.messageCount} msgs</span></label>
              <span id="ci-token-badge" style="font-size:10px;font-weight:600;color:#10b981;background:rgba(16,185,129,0.12);padding:2px 8px;border-radius:10px;">${savingsText}</span>
            </div>
            <div style="display:flex;gap:6px;margin-bottom:8px;">
              <button type="button" class="ci-btn" id="ci-btn-mode-compressed" style="padding:4px 10px;font-size:11px;background:#6366f1;color:#fff;border-radius:6px;border:none;cursor:pointer;">⚡ Compressed (Recommended)</button>
              <button type="button" class="ci-btn" id="ci-btn-mode-raw" style="padding:4px 10px;font-size:11px;background:rgba(255,255,255,0.08);color:#94a3b8;border-radius:6px;border:none;cursor:pointer;">📄 Raw Transcript</button>
            </div>
            <textarea class="ci-form-textarea" id="ci-cap-content" placeholder="Loading content..."></textarea>
            <div class="ci-char-count" id="ci-charcount">${CapsuleUtils.wordCount(currentCapture.compressedContent || currentCapture.content)} words</div>
          </div>
          <div class="ci-form-group">
            <label class="ci-form-label">Folder</label>
            <select class="ci-form-select" id="ci-cap-folder">
              <option value="">General</option>
            </select>
          </div>
          <div class="ci-form-group">
            <label class="ci-form-label">Tags (press Enter)</label>
            <input class="ci-form-input" id="ci-cap-tags-input" placeholder="Add tags..." />
            <div class="ci-tags" id="ci-cap-tags"></div>
          </div>
        </div>
        <div class="ci-modal-footer">
          <button class="ci-btn ci-btn-secondary" id="ci-modal-cancel">Cancel</button>
          <button class="ci-btn ci-btn-add" id="ci-add-another">+ Add Another</button>
          <button class="ci-btn ci-btn-primary" id="ci-modal-save">\u{1F48A} Save Capsule</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const contentTextarea = overlay.querySelector('#ci-cap-content');
    const charCountEl = overlay.querySelector('#ci-charcount');
    const btnCompressed = overlay.querySelector('#ci-btn-mode-compressed');
    const btnRaw = overlay.querySelector('#ci-btn-mode-raw');
    const tokenBadge = overlay.querySelector('#ci-token-badge');

    let isCompressedMode = true;

    // Asynchronously set initial content to prevent UI freezing
    setTimeout(() => {
      const initialVal = currentCapture.compressedContent || currentCapture.content || '';
      contentTextarea.value = initialVal.slice(0, 30000);
      charCountEl.innerText = `${CapsuleUtils.wordCount(initialVal)} words`;
    }, 20);

    btnCompressed.addEventListener('click', () => {
      isCompressedMode = true;
      btnCompressed.style.background = '#6366f1';
      btnCompressed.style.color = '#fff';
      btnRaw.style.background = 'rgba(255,255,255,0.08)';
      btnRaw.style.color = '#94a3b8';
      const content = currentCapture.compressedContent || currentCapture.content || '';
      setTimeout(() => {
        contentTextarea.value = content.slice(0, 30000);
        charCountEl.innerText = `${CapsuleUtils.wordCount(content)} words`;
      }, 20);
      if (tokenBadge) tokenBadge.style.display = 'inline-block';
    });

    btnRaw.addEventListener('click', () => {
      isCompressedMode = false;
      btnRaw.style.background = '#6366f1';
      btnRaw.style.color = '#fff';
      btnCompressed.style.background = 'rgba(255,255,255,0.08)';
      btnCompressed.style.color = '#94a3b8';
      const content = currentCapture.rawContent || currentCapture.content || '';
      setTimeout(() => {
        contentTextarea.value = content.slice(0, 30000);
        charCountEl.innerText = `${CapsuleUtils.wordCount(content)} words`;
      }, 20);
      if (tokenBadge) tokenBadge.style.display = 'none';
    });

    // Load folders
    loadFolders();

    // Events
    overlay.querySelector('#ci-modal-close').onclick = (e) => { e.stopPropagation(); removeModal(); };
    overlay.querySelector('#ci-modal-cancel').onclick = (e) => { e.stopPropagation(); removeModal(); };
    
    // Prevent any modal mouse/keyboard event from bubbling to the host page
    overlay.addEventListener('click', e => {
      e.stopPropagation();
      if (e.target === overlay) removeModal();
    });
    overlay.addEventListener('mousedown', e => e.stopPropagation());
    overlay.addEventListener('mouseup', e => e.stopPropagation());
    overlay.addEventListener('keydown', e => e.stopPropagation());
    overlay.addEventListener('keyup', e => e.stopPropagation());

    // Tags
    const tags = [];
    const tagInput = overlay.querySelector('#ci-cap-tags-input');
    const tagsContainer = overlay.querySelector('#ci-cap-tags');
    tagInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = tagInput.value.trim().toLowerCase();
        if (v && !tags.includes(v)) { tags.push(v); renderTags(); tagInput.value = ''; }
      }
    });
    function renderTags() {
      tagsContainer.innerHTML = tags.map((t, i) =>
        `<span class="ci-tag">${CapsuleUtils.sanitize(t)}<button class="ci-tag-remove" data-idx="${i}">&times;</button></span>`
      ).join('');
      tagsContainer.querySelectorAll('.ci-tag-remove').forEach(b =>
        b.addEventListener('click', () => { tags.splice(+b.dataset.idx, 1); renderTags(); })
      );
    }

    // Word count / update state on edit
    contentTextarea.addEventListener('input', e => {
      const val = e.target.value;
      if (isCompressedMode) {
        currentCapture.compressedContent = val;
      } else {
        currentCapture.rawContent = val;
      }
      charCountEl.textContent = CapsuleUtils.wordCount(val) + ' words';
    });

    async function saveCapsuleViaBackground(capsuleData) {
      const text = capsuleData.content;
      const chunkSize = 50000; // 50K chars per chunk
      const chunks = [];
      for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.substring(i, i + chunkSize));
      }

      const transferId = 'tr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
      
      // 1. Start transfer
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'START_CHUNKED_SAVE',
          transferId,
          totalChunks: chunks.length,
          metadata: {
            title: capsuleData.title,
            platform: capsuleData.platform,
            sourceUrl: capsuleData.sourceUrl,
            folderId: capsuleData.folderId,
            tags: capsuleData.tags,
            messageCount: capsuleData.messageCount,
            captureMethod: capsuleData.captureMethod
          }
        }, (response) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (response?.error) reject(new Error(response.error));
          else resolve();
        });
      });

      // 2. Send each chunk
      for (let index = 0; index < chunks.length; index++) {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: 'SAVE_CHUNK',
            transferId,
            chunkIndex: index,
            chunkData: chunks[index]
          }, (response) => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else if (response?.error) reject(new Error(response.error));
            else resolve();
          });
        });
      }

      // 3. Commit transfer
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'COMMIT_CHUNKED_SAVE',
          transferId
        }, (response) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (response?.error) reject(new Error(response.error));
          else resolve(response.savedCapsule);
        });
      });
    }

    function isContextValid() {
      return typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined' && !!chrome.runtime.id;
    }

    async function doSave() {
      if (!isContextValid()) {
        showToast("Extension updated in the background. Please refresh this webpage to continue saving!", "warning");
        return null;
      }

      const title = overlay.querySelector('#ci-cap-title').value.trim() || 'Untitled';
      const content = isCompressedMode
        ? (currentCapture.compressedContent || currentCapture.content || '').trim()
        : (currentCapture.rawContent || currentCapture.content || '').trim();

      if (!content) { showToast('Content is required', 'error'); return null; }

      // NOTE: formatWithSystemContext header is only applied on clipboard-copy & injection,
      // NOT on save. The stored capsule content stays clean.
      const capsuleData = {
        title,
        content: content,
        platform: PLATFORM,
        sourceUrl: window.location.href,
        folderId: overlay.querySelector('#ci-cap-folder').value || 'default',
        tags,
        messageCount: currentCapture.messageCount,
        savingsPercent: currentCapture.savingsPercent || 0,
        rawTokens: currentCapture.rawTokens || 0,
        compressedTokens: currentCapture.compressedTokens || 0,
        captureMethod: 'floating-button'
      };

      let savedCapsule = null;
      let cloudSaved = true;
      try {
        savedCapsule = await saveCapsuleViaBackground(capsuleData);
      } catch (err) {
        console.warn('[Capture Modal] Background chunked save failed, falling back to direct save:', err);
        cloudSaved = false;
        try {
          savedCapsule = await CapsuleStorage.saveCapsule(capsuleData);
        } catch (localErr) {
          console.error('[Capture Modal] Direct save also failed:', localErr);
          throw new Error('All storage layers failed: ' + localErr.message);
        }
      }

      if (savedCapsule && !cloudSaved) {
        showToast('Cloud sync unreachable. Saved locally instead.', 'warning');
      }

      return savedCapsule || capsuleData;
    }

    const saveBtn = overlay.querySelector('#ci-modal-save');
    const addAnotherBtn = overlay.querySelector('#ci-add-another');

    saveBtn.addEventListener('click', async () => {
      saveBtn.textContent = '\u23F3 Saving...';
      saveBtn.disabled = true;

      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Save timed out (8s)')), 8000)
        );

        const saved = await Promise.race([doSave(), timeoutPromise]);
        if (saved) {
          showSaveSuccessToast(saved);
          removeModal();
        } else {
          saveBtn.textContent = '\u{1F48A} Save Capsule';
          saveBtn.disabled = false;
        }
      } catch (err) {
        console.error('[Capture Modal] Save failed or timed out:', err);
        showToast(err.message || 'Save failed', 'error');
        saveBtn.textContent = '\u{1F48A} Save Capsule';
        saveBtn.disabled = false;
      }
    });

    addAnotherBtn.addEventListener('click', async () => {
      addAnotherBtn.textContent = '\u23F3 Saving...';
      addAnotherBtn.disabled = true;

      try {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Save timed out (8s)')), 8000)
        );

        const saved = await Promise.race([doSave(), timeoutPromise]);
        if (saved) {
          showSaveSuccessToast(saved);
          saveBtn.textContent = '\u{1F48A} Save Capsule';
          saveBtn.disabled = false;
          overlay.querySelector('#ci-cap-title').value = '';
          overlay.querySelector('#ci-cap-content').value = '';
          document.getElementById('ci-charcount').textContent = '0 words';
        }
      } catch (err) {
        console.error('[Capture Modal] Add another save failed:', err);
        showToast(err.message || 'Save failed', 'error');
      } finally {
        addAnotherBtn.textContent = '+ Add Another';
        addAnotherBtn.disabled = false;
      }
    });
  }

  async function loadFolders() {
    const select = document.querySelector('#ci-cap-folder');
    if (!select) return;

    let folders = [];
    try {
      await CapsuleAPI.configure();
      const result = await CapsuleAPI.getFolders();
      folders = result || [];
    } catch {
      folders = await CapsuleStorage.getFolders();
    }

    select.innerHTML = '<option value="default">General</option>' +
      folders.map(f => `<option value="${f.id}">${CapsuleUtils.sanitize(f.name)}</option>`).join('');
  }

  function removeModal() {
    document.getElementById('ci-capture-modal')?.remove();
  }

  // ============================================================
  // TOAST & HUD NOTIFICATIONS
  // ============================================================
  function showSaveSuccessToast(capsule) {
    document.querySelectorAll('.ci-toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'ci-toast ci-toast-success ci-toast-hud';
    toast.innerHTML = `
      <div class="ci-toast-hud-header">
        <span class="ci-toast-hud-icon">\u2705</span>
        <span class="ci-toast-hud-message">Capsule saved successfully!</span>
      </div>
      <div class="ci-toast-hud-actions">
        <button class="ci-toast-hud-btn ci-toast-copy-btn" id="ci-hud-copy-btn">
          📋 Copy to Clipboard
        </button>
        <button class="ci-toast-hud-btn ci-toast-delete-btn" id="ci-hud-delete-btn">
          🗑 Delete Now
        </button>
      </div>
    `;

    document.body.appendChild(toast);

    let dismissTimeout;
    const copyBtn = toast.querySelector('#ci-hud-copy-btn');
    const deleteBtn = toast.querySelector('#ci-hud-delete-btn');

    const closeToast = () => {
      clearTimeout(dismissTimeout);
      toast.classList.add('ci-toast-exit');
      setTimeout(() => toast.remove(), 300);
    };

    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(CapsuleUtils.formatWithSystemContext(capsule.content));
        showToast('Copied to clipboard!', 'success');
      } catch (err) {
        showToast('Failed to copy to clipboard', 'error');
      }
      closeToast();
    });

    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        try {
          await CapsuleAPI.configure();
          await CapsuleAPI.deleteCapsule(capsule.id);
        } catch (apiErr) {
          console.log('[HUD] API delete failed, trying storage:', apiErr);
        }
        await CapsuleStorage.deleteCapsule(capsule.id);
        showToast('Capsule deleted!', 'success');
      } catch (err) {
        showToast('Failed to delete', 'error');
      }
      closeToast();
    });

    dismissTimeout = setTimeout(closeToast, 6000);

    // Trigger feedback prompt check after successful capture save
    if (typeof checkAndShowFeedbackCard === 'function') {
      checkAndShowFeedbackCard();
    }
  }

  function showToast(message, type = 'info') {
    document.querySelectorAll('.ci-toast').forEach(t => t.remove());
    const toast = document.createElement('div');
    toast.className = `ci-toast ci-toast-${type}`;
    const icons = { success: '\u2705', error: '\u274C', info: '\u{1F48A}' };
    toast.innerHTML = `<span>${icons[type] || '\u{1F48A}'}</span><span>${CapsuleUtils.sanitize(message)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add('ci-toast-exit'); setTimeout(() => toast.remove(), 300); }, 3000);
  }

  // ============================================================
  // LIMIT REACHED MODAL (Mailto Pro Lead Capture - Part 7)
  // ============================================================
  function showLimitReachedModal(limitCount = 30) {
    document.querySelector('.capsule-limit-overlay')?.remove();

    const supportEmail = 'capsuleinfinity.support@gmail.com';

    const modalHtml = `
      <div class="capsule-limit-overlay">
        <div class="capsule-limit-card">
          <h3>⚡ Monthly AI Quota Reached</h3>
          <p>You've used all ${limitCount} free AI capsules this month. This capsule was saved using the local fast engine instead.</p>
          <div class="capsule-pricing-options">
            <button id="upgrade-pro-email" class="btn-pro">⚡ Request Pro Access ($2)</button>
          </div>
          <button id="close-limit-modal" class="btn-dismiss">Continue Free</button>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHtml);

    const upgradeBtn = document.getElementById("upgrade-pro-email");
    const closeBtn = document.getElementById("close-limit-modal");

    if (upgradeBtn) {
      upgradeBtn.onclick = async () => {
        let user = null;
        try {
          if (typeof SupabaseClient !== 'undefined') {
            user = await SupabaseClient.getUser();
          }
        } catch (e) {}

        const recipient = supportEmail;
        const subject = "Capsule Infinity Pro Upgrade ($2)";
        const body = 
          `Hi,\n\nI've reached my monthly free limit and would like to activate Pro for $2.\n\n` +
          `User ID: ${user?.id || "N/A"}\nAccount Email: ${user?.email || "N/A"}\n\n` +
          `Please let me know how to pay and get this activated.`;

        if (typeof CapsuleUtils !== 'undefined' && CapsuleUtils.openGmailCompose) {
          CapsuleUtils.openGmailCompose(recipient, subject, body);
        } else {
          const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          window.open(gmailUrl, "_blank");
        }
      };
    }

    if (closeBtn) {
      closeBtn.onclick = () => {
        document.querySelector(".capsule-limit-overlay")?.remove();
      };
    }
  }

  // ============================================================
  // LOGGED OUT NUDGE BANNER (Part 6)
  // ============================================================
  function showLoggedOutBanner() {
    showContextualBanner({
      id: 'logged-out-nudge',
      type: 'logged-out',
      icon: '🔒',
      text: 'Sign in for AI-powered capsules — richer context, fewer tokens. Or continue with the free local compressor.',
      actionText: 'Sign in',
      onAction: () => {
        chrome.runtime.sendMessage({ type: 'TRIGGER_GOOGLE_AUTH' });
      },
      persistent: true
    });
  }

  // ============================================================
  // CONTEXTUAL BANNER COMPONENT (Part 4 & Part 11)
  // Signal-driven, prioritized, dismissible, daily reset
  // ============================================================
  let activeBannerEl = null;
  let bannerAutoDismissTimer = null;
  let sessionBannerDismissed = false;

  async function checkAndShowContextualBanner(forceCheck = false) {
    try {
      // Single source of truth: Do not show if a banner is already mounted or dismissed this session
      if (activeBannerEl || document.querySelector('.ci-banner')) return;
      if (sessionBannerDismissed && !forceCheck) return;

      const today = new Date().toISOString().split('T')[0];
      const storage = await chrome.storage.local.get(['bannerResetDate', 'shownBannersToday']);

      let resetDate = storage.bannerResetDate;
      let shownBanners = storage.shownBannersToday || {};

      // Reset daily flags
      if (resetDate !== today) {
        resetDate = today;
        shownBanners = {};
        await chrome.storage.local.set({ bannerResetDate: today, shownBannersToday: {} });
      }

      // Priority 1: Rate-limit language detected on page
      const pageText = document.body?.innerText || '';
      const rateLimitPattern = /you've reached your|message limit|try again later|upgrade to continue|rate limit|hourly limit|too many requests/i;
      if (rateLimitPattern.test(pageText) && !shownBanners['trigger1']) {
        shownBanners['trigger1'] = true;
        await chrome.storage.local.set({ shownBannersToday: shownBanners });
        showContextualBanner({
          id: 'trigger1',
          type: 'trigger-1',
          icon: '⚡',
          text: "Hit a limit? Your context is already saved — pick it up in Claude, Gemini, or Perplexity without losing anything.",
          actionText: 'Open Picker',
          onAction: () => {
            const wrapper = document.getElementById(DIALOGUE_BTN_ID);
            const menu = wrapper?.querySelector('#ci-dialogue-menu');
            if (menu) {
              loadCapsuleMenu();
              menu.classList.add('open');
            } else {
              chrome.runtime.sendMessage({ type: 'OPEN_SIDEBAR' });
            }
          },
          persistent: true
        });
        return;
      }

      // Priority 2: Long session (>20 messages)
      const currentMessagesCount = (document.querySelectorAll('[data-message-author-role], [class*="message"], .ds-message, [role="log"] > div').length);
      if (currentMessagesCount >= 20 && !shownBanners['trigger2']) {
        shownBanners['trigger2'] = true;
        await chrome.storage.local.set({ shownBannersToday: shownBanners });
        showContextualBanner({
          id: 'trigger2',
          type: 'trigger-2',
          icon: '⏳',
          text: "This chat's getting long — capture it now so you don't lose the thread.",
          actionText: 'Capture Now',
          onAction: () => handleCapture(),
          autoDismissMs: 8000
        });
        return;
      }

      // Priority 3: Saved context available on new chat
      const allCapsules = await CapsuleStorage.getAllCapsules();
      const isNewChat = currentMessagesCount <= 2;
      if (isNewChat && allCapsules.length > 0 && !shownBanners['trigger3']) {
        shownBanners['trigger3'] = true;
        await chrome.storage.local.set({ shownBannersToday: shownBanners });
        showContextualBanner({
          id: 'trigger3',
          type: 'trigger-3',
          icon: '💊',
          text: "You have saved context from earlier — want to bring it into this chat?",
          actionText: 'Bring in Context',
          onAction: () => {
            const wrapper = document.getElementById(DIALOGUE_BTN_ID);
            const menu = wrapper?.querySelector('#ci-dialogue-menu');
            if (menu) {
              loadCapsuleMenu();
              menu.classList.add('open');
            }
          },
          autoDismissMs: 8000
        });
        return;
      }

      // Priority 4: Daily idle prompt (only once per day on initial load)
      if (!shownBanners['trigger4']) {
        shownBanners['trigger4'] = true;
        await chrome.storage.local.set({ shownBannersToday: shownBanners });
        showContextualBanner({
          id: 'trigger4',
          type: 'trigger-4',
          icon: '✨',
          text: "Capsule is on — it's quietly saving context as you go.",
          autoDismissMs: 8000
        });
      }
    } catch (err) {
      console.warn('[Contextual Banner Check Error]:', err);
    }
  }

  function showContextualBanner(config) {
    if (bannerAutoDismissTimer) {
      clearTimeout(bannerAutoDismissTimer);
      bannerAutoDismissTimer = null;
    }

    if (activeBannerEl) {
      activeBannerEl.remove();
      activeBannerEl = null;
    }

    let wrapper = document.querySelector('.ci-banner-wrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'ci-banner-wrapper';
      document.body.appendChild(wrapper);
    }

    const banner = document.createElement('div');
    banner.className = `ci-banner ci-banner-${config.type || 'trigger-4'}`;
    
    let actionsHtml = '';
    if (config.actionText) {
      actionsHtml += `<button class="ci-banner-btn" id="ci-banner-act-btn">${CapsuleUtils.sanitize(config.actionText)}</button>`;
    }
    actionsHtml += `<button class="ci-banner-dismiss" id="ci-banner-dis-btn" aria-label="Dismiss banner">&times;</button>`;

    banner.innerHTML = `
      <span class="ci-banner-icon">${config.icon || '💊'}</span>
      <span class="ci-banner-text">${CapsuleUtils.sanitize(config.text)}</span>
      <div class="ci-banner-actions">${actionsHtml}</div>
    `;

    wrapper.appendChild(banner);
    activeBannerEl = banner;

    // Entrance animation
    requestAnimationFrame(() => {
      banner.classList.add('ci-banner-visible');
    });

    const dismiss = () => {
      if (bannerAutoDismissTimer) {
        clearTimeout(bannerAutoDismissTimer);
        bannerAutoDismissTimer = null;
      }
      sessionBannerDismissed = true;
      banner.classList.remove('ci-banner-visible');
      banner.classList.add('ci-banner-exiting');
      setTimeout(() => {
        banner.remove();
        if (activeBannerEl === banner) activeBannerEl = null;
      }, 220);
    };

    const actionBtn = banner.querySelector('#ci-banner-act-btn');
    const dismissBtn = banner.querySelector('#ci-banner-dis-btn');

    if (actionBtn) {
      actionBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        actionBtn.style.transform = 'scale(0.95)';
        setTimeout(() => {
          if (config.onAction) config.onAction();
          dismiss();
        }, 100);
      });
    }

    if (dismissBtn) {
      dismissBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismiss();
      });
    }

    if (config.autoDismissMs && !config.persistent) {
      bannerAutoDismissTimer = setTimeout(() => {
        if (document.body.contains(banner)) dismiss();
      }, config.autoDismissMs);
    }
  }

  // ============================================================
  // LIGHTWEIGHT 1–5 STAR FEEDBACK CARD (Part 8 & Part 20)
  // Triggered once after 3rd AI capture, with single conditional follow-up for 1-2 stars
  // ============================================================
  async function checkAndShowFeedbackCard() {
    try {
      const storage = await chrome.storage.local.get([
        'aiCaptureCount',
        'feedbackPrompted',
        'firstRating',
        'firstRatingDate',
        'firstRatingCaptureCount',
        'feedbackFollowUpPrompted'
      ]);
      const currentCount = (storage.aiCaptureCount || 0) + 1;
      await chrome.storage.local.set({ aiCaptureCount: currentCount });

      // Trigger 1: Capsule #3 (One-time only)
      if (currentCount >= 3 && !storage.feedbackPrompted) {
        setTimeout(() => showFeedbackCard(false), 1200);
        return;
      }

      // Trigger 2: Conditional follow-up if initial rating was 1 or 2 stars (Part 20)
      // Fires after 15 more captures (capture #18+) OR after 14 days, whichever comes first
      const isLowRating = storage.firstRating === 1 || storage.firstRating === 2;
      if (isLowRating && !storage.feedbackFollowUpPrompted) {
        const capturesSince = currentCount - (storage.firstRatingCaptureCount || 3);
        const daysSince = (Date.now() - (storage.firstRatingDate || 0)) / (1000 * 60 * 60 * 24);

        if (capturesSince >= 15 || daysSince >= 14) {
          setTimeout(() => showFeedbackCard(true), 1200);
        }
      }
    } catch (e) {
      console.warn('[Feedback Check Error]:', e);
    }
  }

  function showFeedbackCard(isFollowUp = false) {
    document.querySelector('.ci-feedback-overlay')?.remove();

    const title = isFollowUp ? '⭐ Quick Check-in' : '⭐ Rate Your AI Capsules';
    const subtitle = isFollowUp
      ? "Last time wasn't great — has it gotten better?"
      : 'How well did the AI backend compress your conversation?';

    const overlay = document.createElement('div');
    overlay.className = 'ci-feedback-overlay';
    overlay.innerHTML = `
      <div class="ci-feedback-card">
        <h3>${title}</h3>
        <p>${subtitle}</p>
        <div class="ci-star-rating" id="ci-star-rating">
          <span class="ci-star" data-val="1">★</span>
          <span class="ci-star" data-val="2">★</span>
          <span class="ci-star" data-val="3">★</span>
          <span class="ci-star" data-val="4">★</span>
          <span class="ci-star" data-val="5">★</span>
        </div>
        <textarea class="ci-feedback-textarea" id="ci-feedback-reason" placeholder="What could be improved? (optional)"></textarea>
        <div class="ci-feedback-actions">
          <button class="ci-btn-skip-feedback" id="ci-feedback-skip">Skip</button>
          <button class="ci-btn-submit-feedback" id="ci-feedback-submit">Submit</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    let selectedRating = 0;
    const stars = overlay.querySelectorAll('.ci-star');

    stars.forEach(s => {
      s.addEventListener('mouseover', () => {
        const val = parseInt(s.dataset.val);
        stars.forEach(st => {
          st.classList.toggle('hovered', parseInt(st.dataset.val) <= val);
        });
      });

      s.addEventListener('mouseout', () => {
        stars.forEach(st => st.classList.remove('hovered'));
      });

      s.addEventListener('click', () => {
        selectedRating = parseInt(s.dataset.val);
        stars.forEach(st => {
          st.classList.toggle('active', parseInt(st.dataset.val) <= selectedRating);
        });
      });
    });

    const closeFeedback = async () => {
      if (isFollowUp) {
        await chrome.storage.local.set({ feedbackFollowUpPrompted: true });
      } else {
        await chrome.storage.local.set({ feedbackPrompted: true });
      }
      overlay.remove();
    };

    overlay.querySelector('#ci-feedback-skip').onclick = () => closeFeedback();

    overlay.querySelector('#ci-feedback-submit').onclick = async () => {
      const reason = overlay.querySelector('#ci-feedback-reason').value.trim();
      if (selectedRating === 0) {
        showToast('Please select a star rating', 'info');
        return;
      }

      try {
        if (typeof SupabaseClient !== 'undefined') {
          const client = await SupabaseClient.ensureInitialized();
          const user = await SupabaseClient.getUser();
          if (client) {
            const insertPayload = {
              rating: selectedRating,
              reason: reason || null,
              user_id: user?.id || null
            };
            if (isFollowUp) {
              insertPayload.follow_up = true;
            }
            await client.from('user_feedback').insert(insertPayload);
          }
        }
        showToast('Thank you for your feedback!', 'success');

        if (!isFollowUp) {
          const storage = await chrome.storage.local.get(['aiCaptureCount']);
          await chrome.storage.local.set({
            feedbackPrompted: true,
            firstRating: selectedRating,
            firstRatingDate: Date.now(),
            firstRatingCaptureCount: storage.aiCaptureCount || 3
          });
        } else {
          await chrome.storage.local.set({ feedbackFollowUpPrompted: true });
        }
      } catch (err) {
        console.warn('[Feedback Submission Error]:', err);
      }

      overlay.remove();
    };
  }

  // ============================================================
  // MUTATION OBSERVER - ENSURES BUTTONS ALWAYS APPEAR
  // This is the KEY fix: watches for DOM changes and re-injects
  // ============================================================
  function startObservers() {
    // Observer 1: Watch for the dialogue box to appear
    dialogueObserver = new MutationObserver(() => {
      if (injectAttempts < MAX_INJECT_ATTEMPTS) {
        injectAttempts++;
        setupInputDragDrop();
        // If we found it, stop retrying (but keep watching for SPA navigations)
        if (findDialogueBox()) injectAttempts = 0;
      }
    });
    dialogueObserver.observe(document.body, { childList: true, subtree: true });

    // Observer 2: Watch for SPA navigations (URL changes)
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        injectAttempts = 0;
        setTimeout(() => {
          setupInputDragDrop();
        }, 500);
      }
    });
    urlObserver.observe(document.body, { childList: true, subtree: true });

    // Observer 3: Periodic check for floating button & drag drop
    setInterval(() => {
      if (!document.getElementById(FLOATING_ID)) injectFloatingButton();
      setupInputDragDrop();
    }, 4000);
  }

  // ============================================================
  // LISTEN FOR MESSAGES
  // ============================================================
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CONTEXT_CAPTURE') {
      if (message.selectionText) {
        showCaptureModal({ title: 'Selected Text', content: message.selectionText, messageCount: 1, platform: PLATFORM });
      } else handleCapture();
    }
    if (message.type === 'INJECT_CAPSULE') {
      injectCapsuleById(message.capsuleId);
    }
  });

  // ============================================================
  // INIT - Run immediately, then observe
  // ============================================================
  function init() {
    // Purge any stale or non-AI entries from captureCache
    try {
      chrome.storage.local.get(['captureCache'], (res) => {
        const cache = res?.captureCache || {};
        let changed = false;
        const clean = {};
        for (const [k, v] of Object.entries(cache)) {
          if (v && v.servedBy) {
            clean[k] = v;
          } else {
            changed = true;
          }
        }
        if (changed) chrome.storage.local.set({ captureCache: clean });
      });
    } catch (e) {}

    // Inject floating button immediately
    injectFloatingButton();

    // Check contextual banner after DOM render
    setTimeout(() => {
      checkAndShowContextualBanner();
    }, 1500);

    // If dialogue not found yet, start retrying to bind drag & drop
    if (!findDialogueBox()) {
      let retryCount = 0;
      const retryInterval = setInterval(() => {
        retryCount++;
        if (findDialogueBox() || retryCount > 25) {
          clearInterval(retryInterval);
          setupInputDragDrop();
        }
      }, 300);
    } else {
      setupInputDragDrop();
    }

    // Start MutationObservers for long-term reliability
    startObservers();
  }

  // Run at document_start (before DOM ready) or document_idle
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for sidebar/other scripts
  window.__capsuleInfinityPlatform = PLATFORM;
  window.__capsuleInfinityInject = injectCapsuleById;
})();