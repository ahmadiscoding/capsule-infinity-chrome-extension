// ============================================
// Capsule Infinity - Popup Logic
// ============================================

const originalWarn = console.warn;
console.warn = function(...args) {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('Multiple GoTrueClient instances detected')) {
    return;
  }
  originalWarn.apply(console, args);
};

(function () {
  'use strict';

  const API = window.CapsuleAPI;
  const Storage = window.CapsuleStorage;
  const Utils = window.CapsuleUtils;

  // Auth state change and UI refresh listener
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'AUTH_SUCCESS') {
      const user = message.user;
      showToast(`Welcome, ${user.name || 'User'}!`, 'success');
      showDashboard(user);
    } else if (message.action === 'REFRESH_CAPSULES_UI') {
      loadDashboardData();
    }
  });

  // ---- DOM refs ----
  const $ = (sel) => document.querySelector(sel);
  const loginScreen = $('#loginScreen');
  const dashboardScreen = $('#dashboardScreen');
  const mainHeader = $('#mainHeader');
  const loginError = $('#loginError');
  const loginForm = $('#loginForm');
  const registerForm = $('#registerForm');
  const userDropdown = $('#userDropdown');

  // ---- Platform colors ----
  const PLATFORM_COLORS = {
    chatgpt: '#10a37f', claude: '#d97706', gemini: '#4285f4',
    deepseek: '#4f46e5', gmail: '#ea4335', copilot: '#0078d4',
    perplexity: '#20b2aa', poe: '#6366f1', phind: '#3b82f6',
    you: '#f97316', kagi: '#eab308', unknown: '#64748b'
  };

  // ---- Toast ----
  function showToast(message, type = 'info') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateY(8px)'; toast.style.transition = 'all 0.2s'; }, 2500);
    setTimeout(() => toast.remove(), 2800);
  }

  // ---- Auth ----
  function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.add('visible');
    setTimeout(() => loginError.classList.remove('visible'), 4000);
  }

  function showScreen(screen) {
    loginScreen.classList.remove('active');
    dashboardScreen.classList.remove('active');
    screen.classList.add('active');
    mainHeader.style.display = screen === dashboardScreen ? 'flex' : 'none';
  }

  async function init() {
    // Configure API
    if (API) await API.configure();

    const result = await chrome.storage.local.get(['authToken', 'user', 'googleAuth']);
    if (result.authToken || result.user) {
      showDashboard(result.user);
    } else {
      showScreen(loginScreen);
    }
  }

  function showDashboard(user) {
    showScreen(dashboardScreen);
    if (user) {
      const name = user.name || user.email || 'User';
      $('#userName').textContent = name.length > 14 ? name.slice(0, 14) + '…' : name;
      $('#userAvatar').textContent = (name[0] || 'U').toUpperCase();
    }
    loadDashboardData();
  }

  async function loadDashboardData() {
    try {
      // Load capsules
      let capsules = null;
      const settings = await chrome.storage.local.get(['supabaseUrl']);
      if (settings.supabaseUrl) {
        const allCapsules = await Storage.getAllCapsules();
        capsules = Array.isArray(allCapsules) ? allCapsules : [];
      } else {
        if (API) {
          try { capsules = await API.getCapsules({ sortBy: 'recent' }); if (capsules) capsules = capsules.capsules || capsules; } catch {}
        }
        if (!capsules) {
          const allCapsules = await Storage.getAllCapsules();
          capsules = Array.isArray(allCapsules) ? allCapsules : [];
        }
      }
      capsules = capsules || [];

      // Load folders
      let folders = [];
      try {
        if (API) {
          const f = await API.getFolders();
          folders = f && f.folders ? f.folders : (Array.isArray(f) ? f : []);
        }
      } catch {}
      if (folders.length === 0) {
        const fr = await chrome.storage.local.get('folders');
        folders = fr.folders || [];
      }

      // Load teams
      let teams = [];
      try {
        const settings = await chrome.storage.local.get(['supabaseUrl', 'user']);
        if (settings.user?.email) {
          teams = await Storage.getCloudTeams(settings.user.email);
        } else if (API) {
          const t = await API.getTeams();
          teams = t && t.teams ? t.teams : (Array.isArray(t) ? t : []);
        }
      } catch (err) {
        console.error('[Popup] Failed to load teams:', err);
      }
      teams = teams || [];

      // Update stats
      $('#statTotal').textContent = capsules.length;
      $('#statFolders').textContent = folders.length;
      $('#statTeams').textContent = teams.length;

      // Update recent capsules (last 6)
      const recent = capsules.slice(0, 6);
      renderRecentCapsules(recent);
    } catch (err) {
      console.error('[Popup] Dashboard load error:', err);
      const isNetworkError = err.message && (err.message.includes('Failed to fetch') || err.message.includes('fetch')) || !navigator.onLine;
      if (isNetworkError) {
        showToast("Network Error: Unable to connect to cloud storage. Working offline.", "warning");
        try {
          const res = await chrome.storage.local.get(['capsules', 'folders']);
          const capsules = res.capsules || [];
          const folders = res.folders || [];
          $('#statTotal').textContent = capsules.length;
          $('#statFolders').textContent = folders.length;
          $('#statTeams').textContent = 0;
          renderRecentCapsules(capsules.slice(0, 6));
        } catch (localErr) {
          console.error('[Popup] Local fallback load failed:', localErr);
        }
      } else {
        showToast("Sync Error: " + err.message, "error");
      }
    }
  }

  function renderRecentCapsules(capsules) {
    const container = $('#recentCapsules');
    if (!capsules || capsules.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💊</div>
          <div class="empty-state-text">No capsules yet.<br>Start by capturing a conversation!</div>
        </div>`;
      return;
    }

    container.innerHTML = capsules.map(c => {
      const platform = c.platform || c.metadata?.platform || 'unknown';
      const color = PLATFORM_COLORS[platform] || PLATFORM_COLORS.unknown;
      const title = c.title || 'Untitled Capsule';
      const time = Utils?.timeAgo ? Utils.timeAgo(c.updatedAt || c.createdAt || Date.now()) : '';
      const words = Utils?.wordCount ? Utils.wordCount(c.content || '') : 0;
      const truncatedTitle = Utils?.truncate ? Utils.truncate(title, 38) : (title.length > 38 ? title.slice(0, 38) + '…' : title);

      return `
        <div class="capsule-item" data-id="${c.id}">
          <div class="capsule-platform-dot" style="background:${color}"></div>
          <div class="capsule-info">
            <div class="capsule-title" title="${title}">${truncatedTitle}</div>
            <div class="capsule-meta">
              <span class="capsule-platform-tag">${platform}</span>
              <span>${words}w</span>
              <span>${time}</span>
            </div>
          </div>
          <div class="capsule-actions-popup">
            <button class="capsule-action-btn" title="Copy content" data-action="copy" data-id="${c.id}">📋</button>
            <button class="capsule-action-btn" title="Delete" data-action="delete" data-id="${c.id}">🗑</button>
          </div>
        </div>`;
    }).join('');

    // Copy button handler
    container.querySelectorAll('[data-action="copy"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const capsule = capsules.find(c => c.id === id);
        if (capsule?.content && Utils?.copyToClipboard) {
          await Utils.copyToClipboard(Utils.formatWithSystemContext(capsule.content));
          showToast('Copied to clipboard!', 'success');
        }
      });
    });

    // Delete button handler
    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        try {
          if (API) { try { await API.deleteCapsule(id); } catch {} }
          await Storage.deleteCapsule(id);
          showToast('Capsule deleted', 'success');
          loadDashboardData();
        } catch (err) {
          showToast('Failed to delete', 'error');
        }
      });
    });
  }

  // ---- Login handlers ----
  $('#loginBtn').addEventListener('click', async () => {
    const email = $('#loginEmail').value.trim();
    const password = $('#loginPassword').value;

    if (!email || !password) { showLoginError('Please enter email and password'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showLoginError('Please enter a valid email'); return; }

    const btn = $('#loginBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div>';

    try {
      const data = await API.login(email, password);
      if (data?.token) {
        showToast('Welcome back!', 'success');
        showDashboard(data.user);
      } else {
        showLoginError(data?.error || 'Login failed');
      }
    } catch (err) {
      showLoginError(err.message || 'Connection failed. Check API settings.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });

  $('#registerBtn').addEventListener('click', async () => {
    const name = $('#regName').value.trim();
    const email = $('#regEmail').value.trim();
    const password = $('#regPassword').value;

    if (!name || !email || !password) { showLoginError('All fields are required'); return; }
    if (password.length < 6) { showLoginError('Password must be at least 6 characters'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showLoginError('Please enter a valid email'); return; }

    const btn = $('#registerBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div>';

    try {
      const data = await API.register(email, password, name);
      if (data?.token) {
        showToast('Account created!', 'success');
        showDashboard(data.user);
      } else if (data?.confirmationSent) {
        showToast('Verification email sent! Check your inbox.', 'success');
        $('#showLogin').click();
      } else {
        showLoginError(data?.error || 'Registration failed');
      }
    } catch (err) {
      showLoginError(err.message || 'Connection failed. Check API settings.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });

  // Universal Google OAuth Flow using background delegation
  async function handleGoogleAuth() {
    const btn = $('#googleLoginBtn') || $('#googleRegBtn');
    const orgText = btn ? btn.textContent : 'Sign in with Google';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div>';
    }

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'TRIGGER_GOOGLE_AUTH' }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (res?.error) {
            reject(new Error(res.error));
          } else {
            resolve(res);
          }
        });
      });

      if (response && response.success) {
        showToast(`Welcome, ${response.user.name || 'User'}!`, 'success');
        showDashboard(response.user);
      }
    } catch (err) {
      console.error('[Google Auth Error] Sign-in failed:', err);
      showToast(`Google Sign-in failed: ${err.message || 'Please check your connection or try again.'}`, 'error');
      showScreen(loginScreen);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = orgText;
      }
    }
  }

  $('#googleLoginBtn').addEventListener('click', handleGoogleAuth);
  $('#googleRegBtn').addEventListener('click', handleGoogleAuth);

  // Toggle login/register
  $('#showRegister').addEventListener('click', () => {
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    loginError.classList.remove('visible');
  });
  $('#showLogin').addEventListener('click', () => {
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
    loginError.classList.remove('visible');
  });

  // Enter key for login/register
  $('#loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#loginBtn').click(); });
  $('#regPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#registerBtn').click(); });

  // ---- User dropdown ----
  $('#userMenu').addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown.classList.toggle('open');
  });
  document.addEventListener('click', () => userDropdown.classList.remove('open'));

  async function performLogout() {
    try {
      const res = await chrome.storage.local.get('authToken');
      const token = res.authToken;
      if (token) {
        await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'CLEAR_AUTH_TOKEN', token }, () => {
            resolve();
          });
        });
      }
      if (API) await API.clearAuth();
      if (Storage) {
        try {
          const sb = await Storage.initSupabase();
          if (sb) {
            await sb.auth.signOut();
          }
        } catch (e) {
          console.warn('[Popup Logout] Supabase signOut error:', e);
        }
      }
      globalThis.supabaseInstance = null;
      await chrome.storage.local.remove(['authToken', 'user', 'googleAuth', 'lastSync', 'supabaseSession']);
      showToast('Signed out', 'info');
      setTimeout(() => location.reload(), 300);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  }

  $('#dropdownLogout').addEventListener('click', async () => {
    userDropdown.classList.remove('open');
    await performLogout();
  });

  // Account profile & delete
  $('#dropdownAccount').addEventListener('click', async () => {
    userDropdown.classList.remove('open');
    showAccountProfile();
  });

  async function showAccountProfile() {
    document.getElementById('accountModal')?.remove();
    const result = await chrome.storage.local.get('user');
    const user = result.user || {};
    const email = user.email || 'N/A';
    const name = user.name || 'User';
    const created = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
    const id = user.id || 'N/A';

    const stats = await Storage.getStats();

    const modal = document.createElement('div');
    modal.id = 'accountModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div style="background:#1a1a2e;border:1px solid rgba(255,255,255,0.1);border-radius:16px;width:340px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.5);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px 14px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <span style="font-size:15px;font-weight:700;color:#e2e8f0;">My Account</span>
          <button id="accountClose" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:20px;padding:2px 4px;border-radius:4px;">&times;</button>
        </div>
        <div style="padding:20px;">
          <div style="text-align:center;margin-bottom:18px;">
            <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#a855f7);display:flex;align-items:center;justify-content:center;font-size:24px;color:white;margin:0 auto 10px;font-weight:700;">${name[0]?.toUpperCase() || 'U'}</div>
            <div style="font-size:16px;font-weight:700;color:#e2e8f0;">${escHtml(name)}</div>
            <div style="font-size:13px;color:#64748b;margin-top:2px;">${escHtml(email)}</div>
          </div>
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
              <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Member Since</span>
              <span style="font-size:12px;color:#e2e8f0;">${created}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
              <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Capsules</span>
              <span style="font-size:12px;color:#e2e8f0;">${stats.totalCapsules}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
              <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Total Words</span>
              <span style="font-size:12px;color:#e2e8f0;">${stats.totalWords}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">User ID</span>
              <span style="font-size:10px;color:#475569;font-family:monospace;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(id)}</span>
            </div>
          </div>
          <div style="margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06);">
            <button id="accountDeleteBtn" style="width:100%;padding:10px;border-radius:8px;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#fca5a5;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all 0.2s;">
              Delete Account
            </button>
            <div style="font-size:11px;color:#475569;text-align:center;margin-top:8px;line-height:1.4;">This will permanently delete your account and all data.</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#accountClose').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.querySelector('#accountDeleteBtn').onclick = async () => {
      if (!confirm('Are you sure? This will permanently delete your account, all capsules, folders, and teams. This cannot be undone.')) return;
      if (!confirm('LAST WARNING: All your data will be erased forever. Continue?')) return;

      const btn = modal.querySelector('#accountDeleteBtn');
      btn.textContent = 'Deleting...';
      btn.disabled = true;

      try {
        // Try API delete first
        if (API) {
          try {
            await API.request('DELETE', '/api/auth/account');
          } catch {
            // API unreachable, continue with local cleanup
          }
        }
        // Clear all local data
        modal.remove();
        if (API) await API.clearAuth();
        await chrome.storage.local.clear();
        showToast('Account deleted', 'info');
        showScreen(loginScreen);
      } catch {
        // Fallback: clear local data
        await chrome.storage.local.clear();
        modal.remove();
        showToast('Local data cleared. Account deleted.', 'info');
        showScreen(loginScreen);
      }
    };
  }

  function escHtml(s) { if(!s)return''; const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

  $('#dropdownSync').addEventListener('click', async () => {
    userDropdown.classList.remove('open');
    showToast('Syncing…', 'info');
    try {
      chrome.runtime.sendMessage({ type: 'SYNC_TO_SERVER' }, (resp) => {
        if (resp?.error) showToast(resp.error, 'error');
        else showToast('Synced!', 'success');
        loadDashboardData();
      });
    } catch {
      showToast('Sync failed', 'error');
    }
  });

  $('#dropdownExport').addEventListener('click', async () => {
    userDropdown.classList.remove('open');
    try {
      let data;
      if (API) {
        data = await API.exportAll();
      }
      if (!data) {
        data = await Storage.exportCapsules();
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `capsule-infinity-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Exported!', 'success');
    } catch {
      showToast('Export failed', 'error');
    }
  });

  // ---- Quick Actions ----
  $('#qaCapture').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          // Try to get selected text or page content
          const selection = window.getSelection()?.toString() || '';
          return {
            title: document.title,
            url: window.location.href,
            text: selection || document.body?.innerText?.slice(0, 3000) || '',
          };
        }
      });
      if (results?.[0]?.result) {
        const r = results[0].result;
        const capsule = {
          title: r.title || `Captured from ${new URL(r.url).hostname}`,
          content: r.text,
          platform: 'unknown',
          metadata: { sourceUrl: r.url },
        };
        try { if (API) await API.createCapsule(capsule); } catch {}
        try {
          const saved = await Storage.saveCapsule(capsule);
          const res = await chrome.storage.local.get(['capsules']);
          let capsList = res.capsules || [];
          const idx = capsList.findIndex(c => c.id === saved.id);
          if (idx >= 0) capsList[idx] = saved;
          else capsList.unshift(saved);
          await chrome.storage.local.set({ capsules: capsList });
          showToast('Page captured!', 'success');
          loadDashboardData();
          chrome.runtime.sendMessage({ action: "REFRESH_CAPSULES_UI" });
        } catch (dbErr) {
          console.error("Supabase Save Error:", dbErr);
          showToast(dbErr.message || 'Database Save Failed', 'error');
        }
      }
    } catch (err) {
      showToast('Cannot capture this page: ' + err.message, 'error');
    }
  });

  $('#qaNewCapsule').addEventListener('click', async () => {
    const title = prompt('Capsule title:');
    if (!title) return;
    const capsule = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      title,
      content: '',
      platform: 'manual',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try { if (API) await API.createCapsule(capsule); } catch {}
    try {
      const saved = await Storage.saveCapsule(capsule);
      const res = await chrome.storage.local.get(['capsules']);
      let capsList = res.capsules || [];
      const idx = capsList.findIndex(c => c.id === saved.id);
      if (idx >= 0) capsList[idx] = saved;
      else capsList.unshift(saved);
      await chrome.storage.local.set({ capsules: capsList });
      showToast('Capsule created!', 'success');
      loadDashboardData();
      chrome.runtime.sendMessage({ action: "REFRESH_CAPSULES_UI" });
    } catch (dbErr) {
      console.error("Supabase Save Error:", dbErr);
      showToast(dbErr.message || 'Database Save Failed', 'error');
    }
  });

  $('#qaNewFolder').addEventListener('click', async () => {
    const name = prompt('Folder name:');
    if (!name) return;
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#06b6d4'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const folder = { id: 'f_' + Date.now(), name, color, createdAt: Date.now() };
    try { if (API) await API.createFolder(name, color); } catch {}
    const fr = await chrome.storage.local.get('folders');
    const folders = fr.folders || [];
    folders.push(folder);
    await chrome.storage.local.set({ folders });
    showToast('Folder created!', 'success');
    loadDashboardData();
  });

  $('#qaOpenSidebar').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) chrome.sidePanel.open({ tabId: tab.id });
    } catch {}
  });

  $('#openSidebarBtn').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) chrome.sidePanel.open({ tabId: tab.id });
    } catch {}
  });

  $('#viewAllBtn').addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) chrome.sidePanel.open({ tabId: tab.id });
    } catch {}
  });

  // ---- Init ----
  init();
})();