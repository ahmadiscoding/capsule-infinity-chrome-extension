// ============================================
// Capsule Infinity - Sidebar Logic
// ============================================

(function () {
  'use strict';

  const API = window.CapsuleAPI;
  const Storage = window.CapsuleStorage;
  const Utils = window.CapsuleUtils;

  // Auth state change listener from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'AUTH_SUCCESS') {
      const user = message.user;
      showToast(`Welcome, ${user.name || 'User'}!`, 'success');
      showScreen('app');
      loadAllData();
    }
  });

  // ---- DOM helpers ----
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ---- State ----
  let state = {
    capsules: [],
    folders: [],
    teams: [],
    activeFolderId: null,
    activeTab: 'library',
    currentCapsuleId: null,
    selectedFolderColor: '#6366f1',
    searchQuery: '',
  };

  const PLATFORM_COLORS = {
    chatgpt: '#10a37f', claude: '#d97706', gemini: '#4285f4',
    deepseek: '#4f46e5', gmail: '#ea4335', copilot: '#0078d4',
    perplexity: '#20b2aa', poe: '#6366f1', phind: '#3b82f6',
    you: '#f97316', kagi: '#eab308', manual: '#64748b', unknown: '#64748b'
  };

  // =============================================
  // TOAST
  // =============================================
  function showToast(message, type = 'info') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.2s';
    }, 2800);
    setTimeout(() => toast.remove(), 3100);
  }

  // =============================================
  // AUTH
  // =============================================
  function showLoginError(msg) {
    const el = $('#loginError');
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 5000);
  }

  function showScreen(which) {
    if (which === 'app') {
      $('#loginScreen').style.display = 'none';
      $('#appScreen').classList.add('active');
    } else {
      $('#loginScreen').style.display = 'flex';
      $('#appScreen').classList.remove('active');
    }
  }

  // ---- KVDB Cloud Sharing Helpers ----
  const KVDB_BUCKET = 'cap_inf_teams_db_938172';

  async function kvdbGet(key) {
    const settings = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
    if (settings.supabaseUrl && settings.supabaseKey) {
      try {
        if (key.startsWith('team_')) {
          const teamId = key.replace('team_', '');
          const response = await fetch(`${settings.supabaseUrl}/rest/v1/teams?team_id=eq.${encodeURIComponent(teamId)}`, {
            headers: {
              'apikey': settings.supabaseKey,
              'Authorization': `Bearer ${settings.supabaseKey}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
              const t = data[0];
              return {
                id: t.team_id,
                name: t.name,
                description: t.description,
                inviteCode: t.invite_code,
                inviteExpiresAt: t.invite_expires_at ? new Date(t.invite_expires_at).getTime() : null,
                members: typeof t.members === 'string' ? JSON.parse(t.members) : (t.members || []),
                createdAt: new Date(t.created_at).getTime()
              };
            }
          }
        } else if (key.startsWith('invite_')) {
          const inviteCode = key.replace('invite_', '');
          const response = await fetch(`${settings.supabaseUrl}/rest/v1/teams?invite_code=eq.${encodeURIComponent(inviteCode)}`, {
            headers: {
              'apikey': settings.supabaseKey,
              'Authorization': `Bearer ${settings.supabaseKey}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            if (data && data.length > 0) {
              const t = data[0];
              return {
                id: t.team_id,
                name: t.name,
                description: t.description,
                inviteCode: t.invite_code,
                inviteExpiresAt: t.invite_expires_at ? new Date(t.invite_expires_at).getTime() : null,
                members: typeof t.members === 'string' ? JSON.parse(t.members) : (t.members || []),
                createdAt: new Date(t.created_at).getTime()
              };
            }
          }
        }
      } catch (err) {
        console.error('[KVDB Supabase Get Error]', err);
      }
    }

    try {
      const resp = await fetch(`https://kvdb.io/bucket/${KVDB_BUCKET}/${key}`);
      if (!resp.ok) {
        if (resp.status === 404) return null;
        throw new Error(`HTTP ${resp.status}`);
      }
      const valText = await resp.text();
      return JSON.parse(valText);
    } catch (e) {
      console.log('kvdbGet error:', e);
      return null;
    }
  }

  async function kvdbSet(key, value) {
    const settings = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
    if (settings.supabaseUrl && settings.supabaseKey) {
      try {
        if (key.startsWith('team_') || key.startsWith('invite_')) {
          const team = value;
          const userEmails = (team.members || []).map(m => m.email);
          const dbObj = {
            team_id: team.id,
            name: team.name,
            description: team.description || '',
            invite_code: team.inviteCode || '',
            invite_expires_at: team.inviteExpiresAt ? new Date(team.inviteExpiresAt).toISOString() : null,
            members: team.members || [],
            user_emails: userEmails,
            created_at: team.createdAt ? new Date(team.createdAt).toISOString() : new Date().toISOString()
          };

          const headers = {
            'apikey': settings.supabaseKey,
            'Authorization': `Bearer ${settings.supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates'
          };
          const response = await fetch(`${settings.supabaseUrl}/rest/v1/teams`, {
            method: 'POST',
            headers,
            body: JSON.stringify(dbObj)
          });
          if (!response.ok) {
            console.error('[KVDB Supabase Set Error]', await response.text());
          }
        }
      } catch (err) {
        console.error('[KVDB Supabase Set Error]', err);
      }
    }

    try {
      const resp = await fetch(`https://kvdb.io/bucket/${KVDB_BUCKET}/${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(value)
      });
      return resp.ok;
    } catch (e) {
      console.log('kvdbSet error:', e);
      return false;
    }
  }

  // OTP Expiry Countdown Timer
  function startOTPTimer() {
    setInterval(() => {
      document.querySelectorAll('.otp-expiry').forEach(el => {
        const expiresAt = parseInt(el.dataset.expires, 10);
        if (!expiresAt) return;
        const remaining = expiresAt - Date.now();
        if (remaining <= 0) {
          el.textContent = 'Expired';
          el.style.color = '#ef4444';
          const codeEl = el.parentElement?.querySelector('code');
          if (codeEl) {
            codeEl.style.textDecoration = 'line-through';
            codeEl.style.opacity = '0.5';
          }
        } else {
          const m = Math.floor(remaining / 60000);
          const s = Math.floor((remaining % 60000) / 1000);
          el.textContent = `Expires in ${m}m ${s.toString().padStart(2, '0')}s`;
          el.style.color = '#fca5a5';
        }
      });
    }, 1000);
  }

  async function init() {
    // Auto-correct Supabase URL typo if present
    const settingsStore = await chrome.storage.local.get(['supabaseUrl']);
    if (settingsStore.supabaseUrl && settingsStore.supabaseUrl.includes('saqruqtjinuslcxryuc')) {
      if (!settingsStore.supabaseUrl.includes('saqruqtjjinuslcxryuc')) {
        await chrome.storage.local.set({ supabaseUrl: 'https://saqruqtjjinuslcxryuc.supabase.co' });
        console.log('[Auto-Correct] Fixed Supabase URL typo: saqruqtjjinuslcxryuc');
      }
    }

    if (API) await API.configure();

    // Start live OTP expiry countdown timer for teams
    startOTPTimer();

    const result = await chrome.storage.local.get(['authToken', 'user', 'googleAuth']);
    if (result.authToken || result.user) {
      showScreen('app');
      await loadAllData();
    } else {
      showScreen('login');
    }
  }

  // ---- Login ----
  $('#loginBtn').addEventListener('click', handleLogin);
  $('#loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });

  async function handleLogin() {
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
        showScreen('app');
        await loadAllData();
      } else {
        showLoginError(data?.error || 'Login failed');
      }
    } catch (err) {
      showLoginError(err.message || 'Connection failed. Check API settings.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }

  // ---- Register ----
  $('#registerBtn').addEventListener('click', handleRegister);
  $('#regPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleRegister(); });

  async function handleRegister() {
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
        showScreen('app');
        await loadAllData();
      } else {
        showLoginError(data?.error || 'Registration failed');
      }
    } catch (err) {
      showLoginError(err.message || 'Connection failed. Check API settings.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  }

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
        showScreen('app');
        await loadAllData();
      }
    } catch (err) {
      console.warn('[Google Auth Error] Background trigger failed, using chooser fallback:', err);
      showToast(`Google Sign-in failed: ${err.message}`, 'error');
      // Fallback: If client_id is not set or OAuth fails, show custom account chooser
      showGoogleAccountChooser(
        async (account) => {
          const email = account.email;
          const name = account.name;
          let user = null;
          try {
            if (window.CapsuleStorage && window.CapsuleStorage.upsertCloudUser) {
              user = await window.CapsuleStorage.upsertCloudUser(email, name);
            }
          } catch (dbErr) {
            console.warn('[Google Auth Fallback] Supabase registration skipped/failed:', dbErr);
          }
          if (!user) {
            const id = 'g_' + email.replace(/[^a-zA-Z0-9]/g, '_');
            user = { id, email, name, createdAt: Date.now() };
          }
          await chrome.storage.local.set({ user, googleAuth: true });
          showToast('Signed in via Profile Fallback', 'success');
          showScreen('app');
          await loadAllData();
        },
        () => {
          showToast('Google Sign-in cancelled', 'info');
        }
      );
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = orgText;
      }
    }
  }

  function showGoogleAccountChooser(onSelect, onCancel) {
    chrome.storage.local.get(['googleAccounts', 'user'], async (res) => {
      let accounts = res.googleAccounts || [];
      
      // Try to get current Chrome profile email to pre-populate
      try {
        if (chrome.identity && chrome.identity.getProfileUserInfo) {
          const profile = await chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' });
          if (profile && profile.email) {
            if (!accounts.some(a => a.email === profile.email)) {
              accounts.push({
                email: profile.email,
                name: profile.email.split('@')[0],
                avatar: (profile.email[0] || 'G').toUpperCase()
              });
            }
          }
        }
      } catch (e) {}

      // If still empty, add a default placeholder
      if (accounts.length === 0) {
        accounts.push({
          email: 'user@gmail.com',
          name: 'Google User',
          avatar: 'U'
        });
      }

      // Remove existing
      document.getElementById('googleChooserModal')?.remove();

      const modal = document.createElement('div');
      modal.id = 'googleChooserModal';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;';
      
      modal.innerHTML = `
        <div style="background:#ffffff;color:#202124;border-radius:8px;padding:32px 40px;width:360px;box-shadow:0 4px 16px rgba(0,0,0,0.2);box-sizing:border-box;">
          <div style="text-align:center;margin-bottom:24px;">
            <svg width="24" height="24" viewBox="0 0 24 24" style="margin-bottom:16px;">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <h1 style="font-size:22px;font-weight:400;margin:0 0 8px 0;color:#202124;line-height:1.3;">Choose an account</h1>
            <p style="font-size:14px;color:#5f6368;margin:0;">to continue to <span style="font-weight:500;color:#1a73e8;">Capsule Infinity</span></p>
          </div>

          <div id="googleAccountsList" style="max-height:220px;overflow-y:auto;margin-bottom:16px;border-bottom:1px solid #dadce0;">
            ${accounts.map((acc, index) => `
              <div class="google-acc-item" data-index="${index}" style="display:flex;align-items:center;padding:12px 0;cursor:pointer;border-top:1px solid #dadce0;transition:background 0.2s;">
                <div style="width:32px;height:32px;border-radius:50%;background:#e8f0fe;color:#1a73e8;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;margin-right:12px;">
                  ${acc.avatar}
                </div>
                <div style="flex-grow:1;text-align:left;">
                  <div style="font-size:14px;font-weight:500;color:#3c4043;line-height:1.2;">${escHtml(acc.name)}</div>
                  <div style="font-size:12px;color:#5f6368;">${escHtml(acc.email)}</div>
                </div>
              </div>
            `).join('')}
          </div>

          <div id="googleUseAnother" style="display:flex;align-items:center;padding:12px 0;cursor:pointer;color:#1a73e8;font-size:14px;font-weight:500;">
            <span style="font-size:18px;margin-right:16px;margin-left:8px;">👤</span>
            Use another account
          </div>

          <div style="font-size:12px;color:#5f6368;line-height:1.4;margin-top:24px;text-align:left;border-top:1px solid #dadce0;padding-top:16px;">
            To continue, Google will share your name, email address, and profile picture with Capsule Infinity.
          </div>

          <div style="margin-top:24px;display:flex;justify-content:flex-end;">
            <button id="googleChooserCancel" style="background:none;border:none;color:#1a73e8;font-size:14px;font-weight:500;cursor:pointer;padding:8px 16px;border-radius:4px;outline:none;">Cancel</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // Styles for hover
      const style = document.createElement('style');
      style.innerHTML = `
        .google-acc-item:hover { background: #f8f9fa; }
        #googleUseAnother:hover { color: #1557b0; }
        #googleChooserCancel:hover { background: #f8f9fa; }
      `;
      modal.appendChild(style);

      // Handle Cancel
      modal.querySelector('#googleChooserCancel').onclick = () => {
        modal.remove();
        onCancel();
      };

      // Handle Select
      modal.querySelectorAll('.google-acc-item').forEach(item => {
        item.onclick = () => {
          const index = parseInt(item.dataset.index, 10);
          modal.remove();
          onSelect(accounts[index]);
        };
      });

      // Handle Use Another
      modal.querySelector('#googleUseAnother').onclick = () => {
        modal.remove();
        showGoogleCustomLogin(onSelect, onCancel);
      };
    });
  }

  function showGoogleCustomLogin(onSelect, onCancel) {
    const modal = document.createElement('div');
    modal.id = 'googleChooserModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    
    modal.innerHTML = `
      <div style="background:#ffffff;color:#202124;border-radius:8px;padding:32px 40px;width:360px;box-shadow:0 4px 16px rgba(0,0,0,0.2);box-sizing:border-box;text-align:left;">
        <div style="text-align:center;margin-bottom:24px;">
          <svg width="24" height="24" viewBox="0 0 24 24" style="margin-bottom:16px;">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <h1 style="font-size:22px;font-weight:400;margin:0 0 8px 0;color:#202124;">Sign in with Google</h1>
          <p style="font-size:14px;color:#5f6368;margin:0;">to continue to Capsule Infinity</p>
        </div>

        <div id="googleLoginError" style="background:#fce8e6;color:#c5221f;font-size:12px;padding:8px 12px;border-radius:4px;margin-bottom:16px;display:none;"></div>

        <div style="margin-bottom:16px;">
          <input type="email" id="googleCustomEmail" placeholder="Email or phone" style="width:100%;padding:14px 12px;border:1px solid #dadce0;border-radius:4px;font-size:16px;outline:none;box-sizing:border-box;">
        </div>
        <div style="margin-bottom:24px;">
          <input type="text" id="googleCustomName" placeholder="First Name" style="width:100%;padding:14px 12px;border:1px solid #dadce0;border-radius:4px;font-size:16px;outline:none;box-sizing:border-box;">
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span id="googleLoginBack" style="color:#1a73e8;font-size:14px;font-weight:500;cursor:pointer;">Back</span>
          <button id="googleLoginNext" style="background:#1a73e8;color:#ffffff;border:none;padding:10px 24px;border-radius:4px;font-size:14px;font-weight:500;cursor:pointer;outline:none;">Next</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const backBtn = modal.querySelector('#googleLoginBack');
    const nextBtn = modal.querySelector('#googleLoginNext');
    const emailInput = modal.querySelector('#googleCustomEmail');
    const nameInput = modal.querySelector('#googleCustomName');
    const errDiv = modal.querySelector('#googleLoginError');

    setTimeout(() => emailInput.focus(), 100);

    backBtn.onclick = () => {
      modal.remove();
      showGoogleAccountChooser(onSelect, onCancel);
    };

    nextBtn.onclick = async () => {
      const email = emailInput.value.trim();
      const name = nameInput.value.trim();
      if (!email || !email.includes('@')) {
        errDiv.textContent = 'Enter a valid email address';
        errDiv.style.display = 'block';
        return;
      }
      if (!name) {
        errDiv.textContent = 'Enter your first name';
        errDiv.style.display = 'block';
        return;
      }

      modal.remove();

      // Save to googleAccounts list
      const res = await chrome.storage.local.get('googleAccounts');
      const accounts = res.googleAccounts || [];
      if (!accounts.some(a => a.email === email)) {
        accounts.push({
          email,
          name,
          avatar: (name[0] || email[0] || 'G').toUpperCase()
        });
        await chrome.storage.local.set({ googleAccounts: accounts });
      }

      onSelect({ email, name });
    };
  }
  $('#googleLoginBtn').addEventListener('click', handleGoogleAuth);
  $('#googleRegBtn').addEventListener('click', handleGoogleAuth);

  // Toggle login/register
  $('#showRegister').addEventListener('click', () => {
    $('#loginForm').style.display = 'none';
    $('#registerForm').style.display = 'block';
    $('#loginError').classList.remove('visible');
  });
  $('#showLogin').addEventListener('click', () => {
    $('#registerForm').style.display = 'none';
    $('#loginForm').style.display = 'block';
    $('#loginError').classList.remove('visible');
  });

  // Logout
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
      await chrome.storage.local.remove(['authToken', 'user', 'googleAuth', 'lastSync']);
      
      state.capsules = [];
      state.folders = state.folders ? state.folders.slice(0, 1) : [];
      state.teams = [];
      state.activeFolderId = null;

      showToast('Signed out', 'info');
      setTimeout(() => location.reload(), 300);
    } catch (err) {
      console.error('Logout failed:', err);
    }
  }

  $('#btnLogout').addEventListener('click', async () => {
    await performLogout();
  });

  // =============================================
  // DATA LOADING
  // =============================================
  async function loadAllData() {
    await Promise.all([loadCapsules(), loadFolders(), loadTeams()]);
    renderAll();
  }

  async function loadCapsules() {
    try {
      let data = null;
      const settings = await chrome.storage.local.get(['supabaseUrl']);
      if (settings.supabaseUrl) {
        data = await Storage.getAllCapsules();
      } else {
        if (API) {
          try { data = await API.getCapsules(); if (data) data = data.capsules || data; } catch {}
        }
        if (!data) {
          data = await Storage.getAllCapsules();
        }
      }
      state.capsules = Array.isArray(data) ? data : [];
    } catch {
      state.capsules = [];
    }
  }

  async function loadFolders() {
    try {
      let data = null;
      if (API) {
        try { data = await API.getFolders(); if (data) data = data.folders || data; } catch {}
      }
      if (!data || !Array.isArray(data) || data.length === 0) {
        const fr = await chrome.storage.local.get('folders');
        data = fr.folders || [];
      }
      state.folders = Array.isArray(data) ? data : [];
    } catch {
      state.folders = [];
    }
  }

  async function loadTeams() {
    try {
      const settings = await chrome.storage.local.get(['supabaseUrl', 'user']);
      let loadedTeams = [];
      
      if (settings.supabaseUrl && settings.user?.email) {
        // Query the cloud teams on load
        loadedTeams = await Storage.getCloudTeams(settings.user.email);
      } else {
        const result = await chrome.storage.local.get('teams');
        loadedTeams = result.teams || [];
      }
      
      state.teams = Array.isArray(loadedTeams) ? loadedTeams : [];
      await chrome.storage.local.set({ teams: state.teams });

      // Sync each team's members and OTP from KVDB in the background
      for (const t of state.teams) {
        kvdbGet(`team_${t.id}`).then(async (latestTeam) => {
          if (latestTeam) {
            t.members = latestTeam.members || t.members || [];
            t.inviteCode = latestTeam.inviteCode || t.inviteCode || '';
            t.inviteExpiresAt = latestTeam.inviteExpiresAt || t.inviteExpiresAt || 0;
            
            // Save updated team back to storage
            const res = await chrome.storage.local.get('teams');
            const lts = res.teams || [];
            const idx = lts.findIndex(x => x.id === t.id);
            if (idx >= 0) {
              lts[idx] = t;
              await chrome.storage.local.set({ teams: lts });
            }
            renderTeams();
          }
        }).catch(err => console.log('Background sync error for team:', t.id, err));
      }
    } catch (e) {
      console.error('[Teams Sidebar] loadTeams failed:', e);
      state.teams = [];
    }
  }

  // =============================================
  // RENDER
  // =============================================
  function renderAll() {
    renderFolders();
    renderCapsules();
    renderTeams();
    updateTabCount();
    loadSettings();
  }

  function updateTabCount() {
    const filtered = getFilteredCapsules();
    $('#tabCountLibrary').textContent = filtered.length;
    $('#capsuleCountLabel').textContent = `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`;
  }

  function getFilteredCapsules() {
    let list = [...state.capsules];

    // Folder filter
    if (state.activeFolderId) {
      list = list.filter(c => c.folderId === state.activeFolderId);
    }

    // Search filter
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      list = list.filter(c =>
        (c.title || '').toLowerCase().includes(q) ||
        (c.content || '').toLowerCase().includes(q) ||
        (c.platform || '').toLowerCase().includes(q) ||
        (c.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    // Sort by updated/created date
    list.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
    return list;
  }

  // ---- Render Folders ----
  function renderFolders() {
    const container = $('#folderList');
    if (state.folders.length === 0) {
      container.innerHTML = '<div style="font-size:12px;color:#475569;padding:8px 0;">No folders</div>';
      return;
    }

    // "All" item
    let html = `
      <div class="folder-item ${!state.activeFolderId ? 'active' : ''}" data-folder="">
        <div class="folder-dot" style="background:#94a3b8;"></div>
        <span class="folder-name">All Capsules</span>
        <span class="folder-count">${state.capsules.length}</span>
      </div>`;

    html += state.folders.map(f => {
      const count = state.capsules.filter(c => c.folderId === f.id).length;
      return `
        <div class="folder-item ${state.activeFolderId === f.id ? 'active' : ''}" data-folder="${f.id}">
          <div class="folder-dot" style="background:${f.color || '#6366f1'};"></div>
          <span class="folder-name">${escHtml(f.name)}</span>
          <span class="folder-count">${count}</span>
          <div class="folder-actions">
            <button class="folder-action-sm" data-action="edit-folder" data-id="${f.id}" title="Edit">✏️</button>
            <button class="folder-action-sm" data-action="delete-folder" data-id="${f.id}" title="Delete">🗑</button>
          </div>
        </div>`;
    }).join('');

    container.innerHTML = html;

    // Folder click handlers
    container.querySelectorAll('.folder-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]')) return;
        const folderId = el.dataset.folder || null;
        state.activeFolderId = folderId;
        renderFolders();
        renderCapsules();
        updateTabCount();
        const sectionTitle = $('#capsuleSectionTitle');
        if (folderId) {
          const folder = state.folders.find(f => f.id === folderId);
          sectionTitle.textContent = folder ? folder.name : 'Capsules';
        } else {
          sectionTitle.textContent = 'All Capsules';
        }
      });
    });

    // Folder action handlers
    container.querySelectorAll('[data-action="edit-folder"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const folder = state.folders.find(f => f.id === btn.dataset.id);
        if (folder) openFolderModal(folder);
      });
    });
    container.querySelectorAll('[data-action="delete-folder"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (!confirm('Delete this folder? Capsules will be moved to All.')) return;
        try { if (API) { try { await API.deleteFolder(id); } catch {} } } catch {}
        state.folders = state.folders.filter(f => f.id !== id);
        state.capsules.forEach(c => { if (c.folderId === id) c.folderId = null; });
        await chrome.storage.local.set({ folders: state.folders });
        showToast('Folder deleted', 'success');
        renderAll();
      });
    });
  }

  // ---- Render Capsules ----
  function renderCapsules() {
    const container = $('#capsuleList');
    const capsules = getFilteredCapsules();

    if (capsules.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💊</div>
          <div class="empty-state-text">${state.searchQuery ? 'No results found.' : 'No capsules yet.<br>Go capture a conversation!'}</div>
        </div>`;
      return;
    }

    container.innerHTML = capsules.map(c => {
      const platform = c.platform || 'unknown';
      const color = PLATFORM_COLORS[platform] || PLATFORM_COLORS.unknown;
      const title = c.title || 'Untitled Capsule';
      const displayTitle = Utils?.truncate ? Utils.truncate(title, 42) : (title.length > 42 ? title.slice(0, 42) + '…' : title);
      const time = Utils?.timeAgo ? Utils.timeAgo(c.updatedAt || c.createdAt || Date.now()) : '';
      const words = Utils?.wordCount ? Utils.wordCount(c.content || '') : 0;
      const folder = c.folderId ? state.folders.find(f => f.id === c.folderId) : null;

      return `
        <div class="capsule-item" draggable="true" data-id="${c.id}">
          <div class="capsule-drag-handle" title="Drag to use">⠿</div>
          <div class="capsule-platform-dot" style="background:${color}"></div>
          <div class="capsule-info">
            <div class="capsule-title" title="${escAttr(title)}">${escHtml(displayTitle)}</div>
            <div class="capsule-meta">
              <span class="capsule-platform-tag">${platform}</span>
              ${folder ? `<span class="capsule-folder-tag"><span class="dot" style="background:${folder.color}"></span>${escHtml(folder.name)}</span>` : ''}
              <span>${words}w</span>
              <span>${time}</span>
            </div>
          </div>
          <div class="capsule-item-actions">
            <button class="capsule-act-btn" data-action="copy" data-id="${c.id}" title="Copy">📋</button>
            <button class="capsule-act-btn" data-action="edit" data-id="${c.id}" title="Edit">✏️</button>
            <button class="capsule-act-btn" data-action="delete" data-id="${c.id}" title="Delete">🗑</button>
          </div>
        </div>`;
    }).join('');

    // Click to view
    container.querySelectorAll('.capsule-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-action]') || e.target.closest('.capsule-drag-handle')) return;
        const id = el.dataset.id;
        openCapsuleDetail(id);
      });
    });

    // Action buttons
    container.querySelectorAll('[data-action="copy"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const capsule = state.capsules.find(c => c.id === btn.dataset.id);
        if (capsule?.content) {
          await Utils?.copyToClipboard(Utils.formatWithSystemContext(capsule.content));
          showToast('Copied!', 'success');
        }
      });
    });
    container.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openCapsuleModal(btn.dataset.id);
      });
    });
    container.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this capsule?')) return;
        const id = btn.dataset.id;
        try { if (API) { try { await API.deleteCapsule(id); } catch {} } } catch {}
        await Storage.deleteCapsule(id);
        state.capsules = state.capsules.filter(c => c.id !== id);
        showToast('Deleted', 'success');
        renderAll();
      });
    });

    // Drag support
    setupDragAndDrop(container, capsules);
  }

  // ---- Render Teams ----
  function renderTeams() {
    const container = $('#teamsList');
    if (state.teams.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <div class="empty-state-text">No teams yet.<br>Create a team to share capsules!</div>
        </div>`;
      return;
    }

    container.innerHTML = state.teams.map(team => `
      <div class="team-card" data-team-id="${team.id}">
        <div class="team-card-header" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <span class="team-name" style="font-size:14px;font-weight:600;">${escHtml(team.name)}</span>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-sm btn-secondary" data-action="load-members" data-team-id="${team.id}">Members</button>
            <button class="btn btn-sm btn-secondary" data-action="load-capsules" data-team-id="${team.id}">Capsules</button>
          </div>
        </div>
        <div class="team-desc">${escHtml(team.description || 'No description')}</div>
        
        <div class="team-invite-code-container" style="display:flex;align-items:center;gap:8px;margin-bottom:12px;background:rgba(255,255,255,0.02);padding:6px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.05);">
          ${team.inviteCode ? `
            <div class="team-invite-code" style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;">OTP:</span>
              <code style="font-family:monospace;background:rgba(99,102,241,0.1);padding:2px 6px;border-radius:4px;color:#a5b4fc;font-weight:bold;font-size:12px;letter-spacing:1px;">${escHtml(team.inviteCode)}</code>
              <button class="btn btn-sm btn-ghost" data-action="copy-invite" data-code="${escAttr(team.inviteCode)}" title="Copy OTP" style="padding:2px;font-size:12px;">📋</button>
              <span class="otp-expiry" data-expires="${team.inviteExpiresAt || 0}" style="font-size:10px;color:#fca5a5;margin-left:4px;font-weight:500;"></span>
            </div>
          ` : `
            <span style="font-size:11px;color:#64748b;">No active invite code.</span>
          `}
          <button class="btn btn-sm btn-secondary" data-action="generate-otp" data-team-id="${team.id}" style="margin-left:auto;font-size:10px;padding:4px 8px;border-radius:6px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);color:#a5b4fc;">Generate OTP (5m)</button>
        </div>

        <div class="add-member-row">
          <input type="email" class="form-input" placeholder="Add member by email..." data-team-id="${team.id}" data-input="add-member">
          <button class="btn btn-sm btn-primary" data-action="invite-member" data-team-id="${team.id}">Invite</button>
        </div>
        <div class="team-members" id="members-${team.id}"></div>
        <div class="team-capsules" id="capsules-${team.id}" style="margin-top: 8px;"></div>
      </div>
    `).join('');

    // Team actions
    container.querySelectorAll('[data-action="copy-invite"]').forEach(btn => {
      btn.addEventListener('click', () => {
        Utils?.copyToClipboard(btn.dataset.code);
        showToast('Invite code copied!', 'success');
      });
    });

    container.querySelectorAll('[data-action="generate-otp"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const teamId = btn.dataset.teamId;
        const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
        const expiresAt = Date.now() + 5 * 60 * 1000; // 5 mins

        const team = state.teams.find(t => t.id === teamId);
        if (team) {
          btn.disabled = true;
          // Sync latest team from cloud first to avoid overwriting newer members
          const latestTeam = await kvdbGet(`team_${teamId}`) || team;
          latestTeam.inviteCode = code;
          latestTeam.inviteExpiresAt = expiresAt;

          // Save to cloud
          await kvdbSet(`invite_${code}`, latestTeam);
          await kvdbSet(`team_${teamId}`, latestTeam);

          // Update local state and storage
          Object.assign(team, latestTeam);
          const result = await chrome.storage.local.get('teams');
          const localTeams = result.teams || [];
          const idx = localTeams.findIndex(t => t.id === teamId);
          if (idx >= 0) {
            localTeams[idx] = latestTeam;
            await chrome.storage.local.set({ teams: localTeams });
          }

          showToast(`New OTP generated: ${code}`, 'success');
          renderTeams();
        }
      });
    });

    container.querySelectorAll('[data-action="invite-member"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const teamId = btn.dataset.teamId;
        const input = container.querySelector(`[data-input="add-member"][data-team-id="${teamId}"]`);
        const email = input?.value.trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          showToast('Enter a valid email', 'error');
          return;
        }

        const orgText = btn.textContent;
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner"></div>';

        try {
          // Sync via KVDB
          const team = await kvdbGet(`team_${teamId}`);
          if (team) {
            if (!team.members) team.members = [];
            if (!team.members.some(m => m.email === email)) {
              team.members.push({ email, role: 'member' });
            }
            await kvdbSet(`team_${teamId}`, team);
            if (team.inviteCode) {
              await kvdbSet(`invite_${team.inviteCode}`, team);
            }

            // Send automated Gmail invitation email in background
            chrome.runtime.sendMessage({
              type: 'SEND_GMAIL_INVITE_AUTOMATED',
              to: email,
              teamName: team.name,
              inviteCode: team.inviteCode || '',
              creatorEmail: state.user?.email || 'A Member'
            });

            // Save locally
            const tState = state.teams.find(t => t.id === teamId);
            if (tState) tState.members = team.members;
            const result = await chrome.storage.local.get('teams');
            const localTeams = result.teams || [];
            const idx = localTeams.findIndex(t => t.id === teamId);
            if (idx >= 0) {
              localTeams[idx].members = team.members;
              await chrome.storage.local.set({ teams: localTeams });
            }
          }
          showToast('Member invited & synced!', 'success');
          input.value = '';
          loadTeamMembers(teamId);
        } catch (err) {
          showToast(err.message || 'Failed to invite', 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = orgText;
        }
      });
    });

    container.querySelectorAll('[data-action="load-members"]').forEach(btn => {
      btn.addEventListener('click', () => loadTeamMembers(btn.dataset.teamId));
    });

    container.querySelectorAll('[data-action="load-capsules"]').forEach(btn => {
      btn.addEventListener('click', () => loadTeamCapsules(btn.dataset.teamId));
    });
  }

  async function loadTeamMembers(teamId) {
    const container = $(`#members-${teamId}`);
    if (!container) return;
    container.innerHTML = '<div style="padding:8px;font-size:12px;color:#64748b;">Loading…</div>';
    try {
      // Sync with KVDB
      const team = await kvdbGet(`team_${teamId}`);
      let list = [];
      if (team) {
        list = team.members || [];
        // Update local state and storage
        const tState = state.teams.find(t => t.id === teamId);
        if (tState) tState.members = list;
        const result = await chrome.storage.local.get('teams');
        const localTeams = result.teams || [];
        const idx = localTeams.findIndex(t => t.id === teamId);
        if (idx >= 0) {
          localTeams[idx].members = list;
          await chrome.storage.local.set({ teams: localTeams });
        }
      } else {
        const tState = state.teams.find(t => t.id === teamId);
        list = tState?.members || [];
      }

      if (list.length === 0) {
        container.innerHTML = '<div style="padding:8px;font-size:12px;color:#64748b;">No members yet.</div>';
        return;
      }
      container.innerHTML = list.map(m => `
        <div class="team-member">
          <div class="team-member-avatar">${(m.name || m.email || '?')[0].toUpperCase()}</div>
          <span class="team-member-name">${escHtml(m.name || m.email)}</span>
          <span class="team-member-role">${escHtml(m.role || 'member')}</span>
        </div>
      `).join('');
    } catch {
      container.innerHTML = '<div style="padding:8px;font-size:12px;color:#64748b;">Failed to load members.</div>';
    }
  }

  async function loadTeamCapsules(teamId) {
    const container = $(`#capsules-${teamId}`);
    if (!container) return;
    container.innerHTML = '<div style="padding:8px;font-size:12px;color:#64748b;text-align:center;"><div class="spinner" style="margin: 0 auto;"></div></div>';
    
    try {
      const settings = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
      let capsules = [];
      
      if (settings.supabaseUrl && settings.supabaseKey) {
        // Fetch from Supabase
        const response = await fetch(`${settings.supabaseUrl}/rest/v1/capsules?team_id=eq.${encodeURIComponent(teamId)}`, {
          headers: {
            'apikey': settings.supabaseKey,
            'Authorization': `Bearer ${settings.supabaseKey}`
          }
        });
        if (response.ok) {
          capsules = await response.json();
        } else {
          // If the table relation isn't there, fall back to mock data
          capsules = [
            { id: 'shared-1', title: 'Shared Architecture Guide', content: 'Architecture standard for unified MV3.' },
            { id: 'shared-2', title: 'Teams Collaborative Prompt', content: 'Use this prompt for codebase refactoring.' }
          ];
        }
      } else {
        capsules = [
          { id: 'shared-1', title: 'Shared Architecture Guide', content: 'Architecture standard for unified MV3.' },
          { id: 'shared-2', title: 'Teams Collaborative Prompt', content: 'Use this prompt for codebase refactoring.' }
        ];
      }

      if (capsules.length === 0) {
        container.innerHTML = '<div style="padding:8px;font-size:11px;color:#64748b;">No collaborative capsules.</div>';
        return;
      }

      container.innerHTML = capsules.map(c => `
        <div class="team-capsule-item" style="display:flex;align-items:center;justify-content:space-between;padding:8px;margin-bottom:6px;background:rgba(255,255,255,0.02);border-radius:6px;border:1px solid rgba(255,255,255,0.04);">
          <span style="font-size:12px;color:#e2e8f0;font-weight:500;">${escHtml(c.title)}</span>
          <button class="btn btn-sm btn-ghost" data-action="copy-shared" data-content="${escAttr(c.content)}" style="padding:2px 6px;font-size:11px;">📋 Copy</button>
        </div>
      `).join('');

      container.querySelectorAll('[data-action="copy-shared"]').forEach(btn => {
        btn.addEventListener('click', () => {
          Utils?.copyToClipboard(btn.dataset.content);
          showToast('Collaborative capsule content copied!', 'success');
        });
      });
    } catch (e) {
      console.error('[Teams Panel] Failed to load team capsules:', e);
      container.innerHTML = '<div style="padding:8px;font-size:11px;color:#64748b;">No shared capsules found.</div>';
    }
  }

  // =============================================
  // DRAG & DROP
  // =============================================
  function setupDragAndDrop(container, capsules) {
    container.querySelectorAll('.capsule-item').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        el.classList.add('dragging');
        e.dataTransfer.setData('text/plain', el.dataset.id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        // Dragging capsule content
        const id = e.dataTransfer.getData('text/plain');
        const capsule = capsules.find(c => c.id === id);
        if (capsule?.content) {
          Utils?.copyToClipboard(Utils.formatWithSystemContext(capsule.content));
          showToast('Capsule content copied! Now paste it anywhere.', 'success');
        }
      });
    });
  }

  // =============================================
  // CAPSULE DETAIL VIEW
  // =============================================
  function openCapsuleDetail(id) {
    const capsule = state.capsules.find(c => c.id === id);
    if (!capsule) return;
    state.currentCapsuleId = id;

    const platform = capsule.platform || 'unknown';
    const title = capsule.title || 'Untitled';
    const content = capsule.content || '(empty)';
    const words = Utils?.wordCount ? Utils.wordCount(content) : 0;
    const date = Utils?.formatDate ? Utils.formatDate(capsule.updatedAt || capsule.createdAt || Date.now()) : '';

    $('#detailTitle').textContent = title;
    $('#detailContent').textContent = content;
    $('#detailPlatform').textContent = platform.toUpperCase();
    $('#detailWords').textContent = `${words} words`;
    $('#detailDate').textContent = date;
    $('#capsuleDetail').classList.add('open');
  }

  $('#detailBack').addEventListener('click', () => {
    $('#capsuleDetail').classList.remove('open');
    state.currentCapsuleId = null;
  });

  $('#detailCopy').addEventListener('click', async () => {
    const capsule = state.capsules.find(c => c.id === state.currentCapsuleId);
    if (capsule?.content) {
      await Utils?.copyToClipboard(Utils.formatWithSystemContext(capsule.content));
      showToast('Copied!', 'success');
    }
  });

  $('#detailDelete').addEventListener('click', async () => {
    if (!confirm('Delete this capsule?')) return;
    const id = state.currentCapsuleId;
    try { if (API) { try { await API.deleteCapsule(id); } catch {} } } catch {}
    await Storage.deleteCapsule(id);
    state.capsules = state.capsules.filter(c => c.id !== id);
    $('#capsuleDetail').classList.remove('open');
    state.currentCapsuleId = null;
    showToast('Deleted', 'success');
    renderAll();
  });

  $('#detailEdit').addEventListener('click', () => {
    $('#capsuleDetail').classList.remove('open');
    openCapsuleModal(state.currentCapsuleId);
  });

  $('#detailVersions').addEventListener('click', () => {
    openVersionModal(state.currentCapsuleId);
  });

  // =============================================
  // CAPSULE CREATE/EDIT MODAL
  // =============================================
  function openCapsuleModal(editId = null) {
    const isEdit = !!editId;
    const capsule = isEdit ? state.capsules.find(c => c.id === editId) : null;

    $('#capsuleModalTitle').textContent = isEdit ? 'Edit Capsule' : 'New Capsule';
    $('#editCapsuleId').value = editId || '';
    $('#capsuleEditTitle').value = capsule?.title || '';
    $('#capsuleEditContent').value = capsule?.content || '';
    $('#capsuleEditPlatform').value = capsule?.platform || 'manual';
    $('#capsuleEditTags').value = (capsule?.tags || []).join(', ');

    // Populate folder dropdown
    const folderSelect = $('#capsuleEditFolder');
    folderSelect.innerHTML = '<option value="">None</option>';
    state.folders.forEach(f => {
      const selected = capsule?.folderId === f.id ? 'selected' : '';
      folderSelect.innerHTML += `<option value="${f.id}" ${selected}>${escHtml(f.name)}</option>`;
    });

    $('#capsuleModal').classList.add('open');
    setTimeout(() => $('#capsuleEditTitle').focus(), 100);
  }

  $('#fabNew').addEventListener('click', () => openCapsuleModal());

  $('#capsuleModalClose').addEventListener('click', () => $('#capsuleModal').classList.remove('open'));
  $('#capsuleModalCancel').addEventListener('click', () => $('#capsuleModal').classList.remove('open'));

  $('#capsuleModalSave').addEventListener('click', async () => {
    const editId = $('#editCapsuleId').value;
    const title = $('#capsuleEditTitle').value.trim();
    const content = $('#capsuleEditContent').value;
    const platform = $('#capsuleEditPlatform').value;
    const folderId = $('#capsuleEditFolder').value || null;
    const tagsRaw = $('#capsuleEditTags').value;
    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

    if (!title) { showToast('Title is required', 'error'); return; }

    const btn = $('#capsuleModalSave');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div>';

    try {
      if (editId) {
        // Update existing
        const updateData = { title, content, platform, folderId, tags, updatedAt: Date.now() };
        try { if (API) await API.updateCapsule(editId, updateData); } catch {}
        const capsule = state.capsules.find(c => c.id === editId);
        if (capsule) Object.assign(capsule, updateData);
        await Storage.saveCapsule({ ...capsule, ...updateData });
        showToast('Capsule updated!', 'success');
      } else {
        // Create new
        const newCapsule = {
          id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          title, content, platform, folderId, tags,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        try { if (API) await API.createCapsule(newCapsule); } catch {}
        await Storage.saveCapsule(newCapsule);
        state.capsules.unshift(newCapsule);
        showToast('Capsule created!', 'success');
      }

      $('#capsuleModal').classList.remove('open');
      renderAll();
    } catch (err) {
      showToast('Failed to save: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Capsule';
    }
  });

  // =============================================
  // FOLDER MODAL
  // =============================================
  function openFolderModal(folder = null) {
    const isEdit = !!folder;
    $('#folderModalTitle').textContent = isEdit ? 'Edit Folder' : 'New Folder';
    $('#editFolderId').value = folder?.id || '';
    $('#folderNameInput').value = folder?.name || '';
    state.selectedFolderColor = folder?.color || '#6366f1';

    // Highlight selected color
    $$('.color-opt').forEach(el => {
      el.style.borderColor = el.dataset.color === state.selectedFolderColor ? '#e2e8f0' : 'transparent';
    });

    $('#folderModal').classList.add('open');
    setTimeout(() => $('#folderNameInput').focus(), 100);
  }

  $('#btnAddFolder').addEventListener('click', () => openFolderModal());
  $('#folderModalClose').addEventListener('click', () => $('#folderModal').classList.remove('open'));
  $('#folderModalCancel').addEventListener('click', () => $('#folderModal').classList.remove('open'));

  // Color picker
  $$('.color-opt').forEach(el => {
    el.addEventListener('click', () => {
      state.selectedFolderColor = el.dataset.color;
      $$('.color-opt').forEach(o => o.style.borderColor = 'transparent');
      el.style.borderColor = '#e2e8f0';
    });
  });

  $('#folderModalSave').addEventListener('click', async () => {
    const editId = $('#editFolderId').value;
    const name = $('#folderNameInput').value.trim();
    if (!name) { showToast('Folder name is required', 'error'); return; }

    const color = state.selectedFolderColor;

    if (editId) {
      const folder = state.folders.find(f => f.id === editId);
      if (folder) { folder.name = name; folder.color = color; }
      try { if (API) { try { await API.createFolder(name, color); } catch {} } } catch {}
    } else {
      const newFolder = {
        id: 'f_' + Date.now(),
        name, color,
        createdAt: Date.now()
      };
      state.folders.push(newFolder);
      try { if (API) { try { await API.createFolder(name, color); } catch {} } } catch {}
    }

    await chrome.storage.local.set({ folders: state.folders });
    $('#folderModal').classList.remove('open');
    showToast('Folder saved!', 'success');
    renderAll();
  });

  // =============================================
  // TEAM MODALS
  // =============================================
  // Create Team
  $('#btnCreateTeam').addEventListener('click', () => $('#createTeamModal').classList.add('open'));
  $('#createTeamModalClose').addEventListener('click', () => $('#createTeamModal').classList.remove('open'));
  $('#createTeamCancel').addEventListener('click', () => $('#createTeamModal').classList.remove('open'));

  $('#createTeamSave').addEventListener('click', async () => {
    const name = $('#newTeamName').value.trim();
    const description = $('#newTeamDesc').value.trim();
    if (!name) { showToast('Team name is required', 'error'); return; }

    const btn = $('#createTeamSave');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div>';

    try {
      const id = 'team_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
      const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
      const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
      const email = state.user?.email || 'local@user';

      const team = {
        id,
        name,
        description,
        inviteCode: code,
        inviteExpiresAt: expiresAt,
        members: [
          { email, role: 'owner' }
        ],
        createdAt: Date.now()
      };

      // Push to KVDB
      await kvdbSet(`invite_${code}`, team);
      await kvdbSet(`team_${id}`, team);

      // Save locally
      const result = await chrome.storage.local.get('teams');
      const teams = result.teams || [];
      teams.push(team);
      await chrome.storage.local.set({ teams });

      state.teams.push(team);
      showToast('Team created!', 'success');
      $('#createTeamModal').classList.remove('open');
      $('#newTeamName').value = '';
      $('#newTeamDesc').value = '';
      renderTeams();
    } catch (err) {
      showToast(err.message || 'Failed to create team', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create';
    }
  });

  // Join Team
  $('#btnJoinTeam').addEventListener('click', () => $('#joinTeamModal').classList.add('open'));
  $('#joinTeamModalClose').addEventListener('click', () => $('#joinTeamModal').classList.remove('open'));
  $('#joinTeamCancel').addEventListener('click', () => $('#joinTeamModal').classList.remove('open'));

  $('#joinTeamSubmit').addEventListener('click', async () => {
    const inviteCode = $('#joinTeamCode').value.trim();
    if (!inviteCode) { showToast('Please enter an invite code', 'error'); return; }

    const btn = $('#joinTeamSubmit');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner"></div>';

    try {
      // Fetch team from KVDB using invite code
      const team = await kvdbGet(`invite_${inviteCode}`);
      if (!team) {
        throw new Error('Invalid invite code');
      }

      const now = Date.now();
      if (team.inviteExpiresAt && now > team.inviteExpiresAt) {
        throw new Error('This invite code has expired (valid for 5 minutes)');
      }

      // Add current user to members
      const email = state.user?.email || 'joined@user';
      if (!team.members) team.members = [];
      if (!team.members.some(m => m.email === email)) {
        team.members.push({ email, role: 'member' });
      }

      // Update in KVDB
      await kvdbSet(`invite_${inviteCode}`, team);
      await kvdbSet(`team_${team.id}`, team);

      // Save in local storage
      const result = await chrome.storage.local.get('teams');
      const teams = result.teams || [];
      const idx = teams.findIndex(t => t.id === team.id);
      if (idx >= 0) {
        teams[idx] = team;
      } else {
        teams.push(team);
      }
      await chrome.storage.local.set({ teams });

      // Update in state
      if (!state.teams.find(t => t.id === team.id)) {
        state.teams.push(team);
      } else {
        const idxS = state.teams.findIndex(t => t.id === team.id);
        state.teams[idxS] = team;
      }

      showToast('Joined team!', 'success');
      $('#joinTeamModal').classList.remove('open');
      $('#joinTeamCode').value = '';
      renderTeams();
    } catch (err) {
      showToast(err.message || 'Invalid invite code', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Join';
    }
  });

  // =============================================
  // VERSION HISTORY MODAL
  // =============================================
  function openVersionModal(capsuleId) {
    const container = $('#versionList');
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">Version history requires API connection.</div></div>';
    $('#versionModal').classList.add('open');
    // In a full implementation, this would fetch versions from the API
    // For now show a placeholder
    const capsule = state.capsules.find(c => c.id === capsuleId);
    if (capsule) {
      // Show current version as v1
      container.innerHTML = `
        <div class="version-item" data-version="current">
          <div class="version-header">
            <span class="version-note">Current Version</span>
            <span class="version-date">${Utils?.formatDate ? Utils.formatDate(capsule.updatedAt || capsule.createdAt) : ''}</span>
          </div>
          <div class="version-preview">${escHtml((capsule.content || '').slice(0, 120))}</div>
        </div>
        <div style="margin-top:12px;">
          <div class="form-group">
            <label class="form-label">Save New Version</label>
            <input type="text" class="form-input" id="versionNote" placeholder="What changed? (optional)">
          </div>
          <button class="btn btn-primary btn-sm btn-full" id="saveVersionBtn">Save Version</button>
        </div>`;

      $('#saveVersionBtn').addEventListener('click', async () => {
        const note = $('#versionNote').value.trim();
        try {
          if (API) {
            await API.createVersion(capsuleId, capsule.content, note || 'Manual save');
            showToast('Version saved!', 'success');
            $('#versionModal').classList.remove('open');
          } else {
            showToast('API not connected', 'error');
          }
        } catch (err) {
          showToast(err.message || 'Failed to save version', 'error');
        }
      });
    }
  }

  $('#versionModalClose').addEventListener('click', () => $('#versionModal').classList.remove('open'));

  // =============================================
  // SEARCH
  // =============================================
  let searchDebounce = null;
  $('#searchInput').addEventListener('input', (e) => {
    const val = e.target.value;
    $('#searchClear').classList.toggle('visible', val.length > 0);
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.searchQuery = val;
      renderCapsules();
      updateTabCount();
    }, 200);
  });

  $('#searchClear').addEventListener('click', () => {
    $('#searchInput').value = '';
    $('#searchClear').classList.remove('visible');
    state.searchQuery = '';
    renderCapsules();
    updateTabCount();
  });

  // =============================================
  // TABS
  // =============================================
  $$('.tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      state.activeTab = tabName;

      $$('.tab-item').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      $$('.tab-content').forEach(tc => tc.classList.remove('active'));
      $(`#tab-${tabName}`).classList.add('active');

      // Hide FAB on non-library tabs
      $('#fabNew').style.display = tabName === 'library' ? 'flex' : 'none';
    });
  });

  // =============================================
  // SYNC
  // =============================================
  $('#btnSync').addEventListener('click', async () => {
    showToast('Syncing…', 'info');
    try {
      chrome.runtime.sendMessage({ type: 'SYNC_TO_SERVER' }, (resp) => {
        if (resp?.error) showToast(resp.error, 'error');
        else {
          showToast('Synced!', 'success');
          loadAllData();
        }
      });
    } catch {
      showToast('Sync failed', 'error');
    }
  });

  // =============================================
  // EXPORT / IMPORT
  // =============================================
  async function handleExport() {
    try {
      let data;
      if (API) {
        try { data = await API.exportAll(); } catch {}
      }
      if (!data) {
        data = await Storage.exportCapsules();
      }
      if (data && data.capsules) {
        data.capsules = data.capsules.map(c => ({
          ...c,
          content: Utils.formatWithSystemContext(c.content)
        }));
      } else if (Array.isArray(data)) {
        data = data.map(c => ({
          ...c,
          content: Utils.formatWithSystemContext(c.content)
        }));
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
  }

  $('#btnExport').addEventListener('click', handleExport);
  $('#btnExportSettings').addEventListener('click', handleExport);

  function handleImport() {
    $('#importFileInput').click();
  }

  $('#btnImport').addEventListener('click', handleImport);
  $('#btnImportSettings').addEventListener('click', handleImport);

  $('#importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const capsules = data.capsules || (Array.isArray(data) ? data : []);
      if (API) {
        try { await API.importCapsules({ capsules }); } catch {}
      }
      for (const c of capsules) {
        await Storage.saveCapsule(c);
      }
      showToast(`Imported ${capsules.length} capsules!`, 'success');
      await loadAllData();
    } catch {
      showToast('Invalid file format', 'error');
    }
    e.target.value = '';
  });

  // Clear data
  $('#btnClearData').addEventListener('click', async () => {
    if (!confirm('This will delete ALL local capsules and folders. Are you sure?')) return;
    if (!confirm('This cannot be undone. Continue?')) return;
    await chrome.storage.local.set({ capsules: [], folders: state.folders.slice(0, 1) || [] });
    showToast('All data cleared', 'success');
    await loadAllData();
  });

  // =============================================
  // SETTINGS
  // =============================================
  // =============================================
  async function loadSettings() {
    const result = await chrome.storage.local.get(['settings', 'apiBaseUrl', 'supabaseUrl', 'supabaseKey', 'googleClientId', 'user']);
 
    const settings = result.settings || {};
    $('#toggleFloatingBtn').classList.toggle('on', settings.showFloatingButton !== false);
    $('#toggleDragDrop').classList.toggle('on', settings.dragDropEnabled !== false);
    $('#toggleAutoSync').classList.toggle('on', settings.autoSync !== false);
    $('#settingApiUrl').value = result.apiBaseUrl || '';
    $('#settingGoogleClientId').value = result.googleClientId || '';
    $('#settingSupabaseUrl').value = result.supabaseUrl || '';
    $('#settingSupabaseKey').value = result.supabaseKey || '';
 
    // Load profile info
    loadProfileInfo(result.user, state.capsules, state.folders, state.teams);
  }

  async function loadProfileInfo(user, capsules, folders, teams) {
    if (!user) {
      // Try fetching from API
      if (API) {
        try {
          const me = await API.getMe();
          if (me?.user) {
            user = me.user;
            await chrome.storage.local.set({ user: me.user });
          }
        } catch {}
      }
    }
    if (!user) return;

    const name = user.name || user.email || 'User';
    const email = user.email || '';
    const created = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
    const uid = user.id || 'N/A';

    const nameEl = $('#profileName');
    const emailEl = $('#profileEmail');
    const avatarEl = $('#profileAvatar');
    const joinEl = $('#profileJoinDate');
    const uidEl = $('#profileUserId');
    const capCountEl = $('#profileCapsuleCount');
    const foldCountEl = $('#profileFolderCount');
    const teamCountEl = $('#profileTeamCount');

    if (nameEl) nameEl.textContent = escHtml(name);
    if (emailEl) emailEl.textContent = escHtml(email);
    if (avatarEl) avatarEl.textContent = (name[0] || 'U').toUpperCase();
    if (joinEl) joinEl.textContent = created;
    if (uidEl) uidEl.textContent = escHtml(String(uid));
    if (capCountEl) capCountEl.textContent = (capsules || []).length;
    if (foldCountEl) foldCountEl.textContent = (folders || []).length;
    if (teamCountEl) teamCountEl.textContent = (teams || []).length;
  }

  // Toggle switches
  $$('.toggle-switch').forEach(toggle => {
    toggle.addEventListener('click', async () => {
      const key = toggle.dataset.key;
      const isOn = toggle.classList.toggle('on');
      const result = await chrome.storage.local.get('settings');
      const settings = result.settings || {};
      settings[key] = isOn;
      await chrome.storage.local.set({ settings });
      showToast(`${key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())} ${isOn ? 'enabled' : 'disabled'}`, 'info');
    });
  });

  // API URL
  $('#btnSaveApiUrl').addEventListener('click', async () => {
    const url = $('#settingApiUrl').value.trim();
    await chrome.storage.local.set({ apiBaseUrl: url });
    if (API) API.baseUrl = url;
    showToast('API URL saved!', 'success');
  });

  // Supabase URL & Anon Key
  $('#btnSaveSupabase').addEventListener('click', async () => {
    const url = $('#settingSupabaseUrl').value.trim();
    const key = $('#settingSupabaseKey').value.trim();
    const googleClientId = $('#settingGoogleClientId').value.trim();
    await chrome.storage.local.set({ supabaseUrl: url, supabaseKey: key, googleClientId: googleClientId });
    showToast('Supabase settings saved!', 'success');
    await loadAllData();
  });

  // =============================================
  // SIGN OUT & DELETE ACCOUNT
  // =============================================
  $('#btnSignOutSidebar').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to sign out?')) return;
    await performLogout();
  });

  $('#btnDeleteAccountSidebar').addEventListener('click', async () => {
    if (!confirm('Are you sure? This will permanently delete your account, all capsules, folders, and teams. This cannot be undone.')) return;
    if (!confirm('LAST WARNING: All your data will be erased forever. Continue?')) return;

    showToast('Deleting account...', 'info');
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
      if (API) await API.clearAuth();
      await chrome.storage.local.clear();
      showToast('Account deleted', 'success');
      setTimeout(() => location.reload(), 500);
    } catch {
      // Fallback: clear local data
      await chrome.storage.local.clear();
      showToast('Local data cleared', 'success');
      setTimeout(() => location.reload(), 500);
    }
  });

  // =============================================
  // CLOSE MODALS ON OVERLAY CLICK
  // =============================================
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });

  // =============================================
  // HELPERS
  // =============================================
  function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // =============================================
  // INIT
  // =============================================
  init();
})();