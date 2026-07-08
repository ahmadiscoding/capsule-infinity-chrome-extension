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

  function extractCurrentVisibleMessages() {
    const messages = [];

    try {
      if (PLATFORM === 'chatgpt') {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
          acceptNode(node) {
            try {
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
            const text = node.innerText?.trim() || '';
            if (text && text.length > 5) messages.push({ role, content: text });
          } catch (e) {}
        }
      } else if (PLATFORM === 'claude') {
        document.querySelectorAll('[class*="message"], [data-testid]').forEach(el => {
          try {
            if (!el) return;
            const text = el.innerText?.trim() || '';
            if (!text || text.length < 5) return;
            const testId = el.getAttribute('data-testid') || '';
            const role = testId.includes('human') || testId.includes('user') ? 'user' : 'assistant';
            if (messages.length > 0 && messages[messages.length - 1].content === text) return;
            messages.push({ role, content: text });
          } catch (e) {}
        });
      } else if (PLATFORM === 'gemini') {
        document.querySelectorAll('model-response, [class*="query-text"], [class*="response-container"]').forEach(el => {
          try {
            if (!el) return;
            const text = el.innerText?.trim() || '';
            if (!text || text.length < 5) return;
            const tagName = el.tagName?.toLowerCase() || '';
            const isUser = tagName === 'model-response' ? false : true;
            messages.push({ role: isUser ? 'user' : 'assistant', content: text });
          } catch (e) {}
        });
      } else if (PLATFORM === 'deepseek') {
        document.querySelectorAll('.ds-message').forEach(el => {
          try {
            if (!el) return;
            const isAssistant = el.querySelector('.ds-markdown') !== null;
            if (isAssistant) {
              const markdownEl = el.querySelector('.ds-markdown');
              let text = markdownEl ? (markdownEl.innerText?.trim() || '') : '';
              if (text) {
                // Capture R1 reasoning/thinking chain if present
                const thinkingEl = el.querySelector('[class*="think"], [class*="reasoning"], .e1675d8b');
                if (thinkingEl && thinkingEl !== markdownEl) {
                  const thinkingText = thinkingEl.innerText?.trim() || '';
                  if (thinkingText && thinkingText.length > 0) {
                    text = `<thinking>\n${thinkingText}\n</thinking>\n\n${text}`;
                  }
                }
                messages.push({ role: 'assistant', content: text });
              }
            } else {
              // User message
              const text = el.innerText?.trim() || '';
              if (text && text.length > 0) {
                messages.push({ role: 'user', content: text });
              }
            }
          } catch (e) {}
        });
        // Fallback for newer DeepSeek versions
        if (messages.length === 0) {
          document.querySelectorAll('.ds-markdown').forEach(el => {
            try {
              if (!el) return;
              const text = el.innerText?.trim() || '';
              if (text) {
                messages.push({ role: 'assistant', content: text });
              }
            } catch (e) {}
          });
        }
      } else {
        // Generic: try common patterns
        document.querySelectorAll('[data-message-author-role], .message-content, .prose, [role="log"] > div').forEach(el => {
          try {
            if (!el) return;
            const text = el.innerText?.trim() || '';
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

    // Fallback: search parents of any message node
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

  async function fetchFullChatHistory() {
    const container = findScrollContainer();
    if (!container) {
      return extractCurrentVisibleMessages();
    }

    let accumulatedMessages = [];
    let scrollAttempts = 0;
    const maxAttempts = 30; // Safety limit
    let noNewContentCount = 0;

    const originalScrollTop = container.scrollTop;

    while (scrollAttempts < maxAttempts) {
      // 1. Scrape visible
      const currentMessages = extractCurrentVisibleMessages();
      const previousLength = accumulatedMessages.length;
      accumulatedMessages = mergeMessages(currentMessages, accumulatedMessages);

      if (accumulatedMessages.length === previousLength) {
        noNewContentCount++;
      } else {
        noNewContentCount = 0;
      }

      if (container.scrollTop === 0) {
        if (noNewContentCount >= 2) {
          break;
        }
      }

      // 2. Scroll to top to trigger lazy load
      container.scrollTop = 0;
      container.dispatchEvent(new Event('scroll', { bubbles: true }));

      // 3. Pause for rendering
      await new Promise(resolve => setTimeout(resolve, 400));
      scrollAttempts++;
    }

    // Restore scroll position
    container.scrollTop = originalScrollTop;

    return accumulatedMessages;
  }

  async function extractConversationAsync() {
    if (PLATFORM === 'gmail') {
      const subject = document.querySelector('h2.hP, [data-thread-id] h2')?.innerText?.trim() || '';
      const from = document.querySelector('.go .gD')?.getAttribute('email') || '';
      const body = document.querySelector('.a3s.aiL, .ii.gt')?.innerText?.trim() || '';
      if (body) {
        return {
          title: `Email: ${subject || 'No Subject'}`,
          content: `From: ${from}\nSubject: ${subject}\n---\n${body}`,
          messageCount: 1,
          platform: PLATFORM
        };
      }
      return null;
    }

    const messages = await fetchFullChatHistory();

    if (messages.length === 0) {
      const main = document.querySelector('main, [role="main"], .conversation');
      if (main) {
        const text = main.innerText?.trim();
        if (text && text.length > 20) {
          return { title: document.title || 'Conversation', content: text.substring(0, 100000), messageCount: 1, platform: PLATFORM };
        }
      }
      return null;
    }

    const formatted = messages.map(m => `[${m.role.toUpperCase()}]:\n${m.content}`).join('\n\n---\n\n');
    const firstUser = messages.find(m => m.role === 'user');
    const title = firstUser ? firstUser.content.substring(0, 80).split('\n')[0] : document.title;

    return {
      title: title || `${CapsuleUtils.getPlatformInfo(PLATFORM).name} Chat`,
      content: formatted.substring(0, 100000),
      messageCount: messages.length,
      platform: PLATFORM
    };
  }

  // ============================================================
  // CAPTURE HANDLER with Animation
  // ============================================================
  async function handleCapture() {
    showToast('Capturing full chat history...', 'info');
    try {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Capture timed out (8s)')), 8000)
      );

      const conv = await Promise.race([
        extractConversationAsync(),
        timeoutPromise
      ]);

      if (!conv || !conv.content) {
        showToast('No conversation found to capture', 'error');
        return;
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
      console.error('[Capture] Capture failed or timed out:', err);
      showToast(err.message || 'Capture timed out', 'error');
    }
  }

  // ============================================================
  // CAPTURE MODAL
  // ============================================================
  function showCaptureModal(conv) {
    removeModal();

    const overlay = document.createElement('div');
    overlay.className = 'ci-modal-overlay';
    overlay.id = 'ci-capture-modal';
    const pi = CapsuleUtils.getPlatformInfo(PLATFORM);

    overlay.innerHTML = `
      <div class="ci-modal">
        <div class="ci-modal-header">
          <h3>\u{1F48A} Capture as Capsule</h3>
          <button class="ci-modal-close" id="ci-modal-close">&times;</button>
        </div>
        <div class="ci-modal-body">
          <div class="ci-form-group">
            <label class="ci-form-label">Title</label>
            <input class="ci-form-input" id="ci-cap-title" value="${CapsuleUtils.sanitize(conv.title)}" placeholder="Name your capsule..." />
          </div>
          <div class="ci-form-group">
            <label class="ci-form-label">Content <span class="ci-platform-badge" style="background:${pi.color}20;color:${pi.color};margin-left:8px;">${pi.icon} ${pi.name} \u00B7 ${conv.messageCount} messages</span></label>
            <textarea class="ci-form-textarea" id="ci-cap-content">${CapsuleUtils.sanitize(conv.content)}</textarea>
            <div class="ci-char-count" id="ci-charcount">${CapsuleUtils.wordCount(conv.content)} words</div>
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

    // Load folders
    loadFolders();

    // Events
    overlay.querySelector('#ci-modal-close').onclick = removeModal;
    overlay.querySelector('#ci-modal-cancel').onclick = removeModal;
    overlay.addEventListener('click', e => { if (e.target === overlay) removeModal(); });

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

    // Word count
    overlay.querySelector('#ci-cap-content').addEventListener('input', e => {
      document.getElementById('ci-charcount').textContent = CapsuleUtils.wordCount(e.target.value) + ' words';
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

    async function doSave() {
      const title = overlay.querySelector('#ci-cap-title').value.trim() || 'Untitled';
      const content = overlay.querySelector('#ci-cap-content').value.trim();
      if (!content) { showToast('Content is required', 'error'); return null; }

      // Prepend Systemic AI Context to the content
      const formattedContent = CapsuleUtils.formatWithSystemContext(content);

      const capsuleData = {
        title,
        content: formattedContent,
        platform: PLATFORM,
        sourceUrl: window.location.href,
        folderId: overlay.querySelector('#ci-cap-folder').value || null,
        tags,
        messageCount: conv.messageCount,
        captureMethod: 'floating-button'
      };

      let savedCapsule = null;
      try {
        savedCapsule = await saveCapsuleViaBackground(capsuleData);
      } catch (err) {
        console.warn('[Capture Modal] Background chunked save failed, falling back to direct save:', err);
        try {
          savedCapsule = await CapsuleStorage.saveCapsule(capsuleData);
        } catch (localErr) {
          console.error('[Capture Modal] Direct save also failed:', localErr);
        }
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

    select.innerHTML = '<option value="">General</option>' +
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

    // Observer 3: Periodic check as ultimate fallback
    setInterval(() => {
      if (!document.getElementById(FLOATING_ID)) injectFloatingButton();
      setupInputDragDrop();
    }, 2000);
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
    // Inject floating button immediately
    injectFloatingButton();

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