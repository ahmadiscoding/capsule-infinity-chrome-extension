// ============================================
// Capsule Infinity - Background Service Worker
// ============================================

const originalWarn = console.warn;
console.warn = function(...args) {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('Multiple GoTrueClient instances detected')) {
    return;
  }
  originalWarn.apply(console, args);
};

importScripts('lib/supabase-js.js');

let supabaseClient = null;

async function getSupabaseClient() {
  if (globalThis.supabaseInstance) return globalThis.supabaseInstance;
  if (supabaseClient) {
    globalThis.supabaseInstance = supabaseClient;
    return supabaseClient;
  }
  const res = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey', 'supabaseSession']);
  const defaultUrl = 'https://saqruqtjjinuslcxryuc.supabase.co';
  const defaultKey = 'sb_publishable_mp0xexkqtCWhPHRuE0FimQ_yjstjdTC';
  
  let cleanUrl = (res.supabaseUrl || defaultUrl).trim().replace(/\/+$/, '');
  const key = res.supabaseKey || defaultKey;

  if (cleanUrl.includes('saqruqtjinuslcxryuc') && !cleanUrl.includes('saqruqtjjinuslcxryuc')) {
    cleanUrl = 'https://saqruqtjjinuslcxryuc.supabase.co';
    await chrome.storage.local.set({ supabaseUrl: cleanUrl });
    console.log('[Auto-Correct] Background fixed Supabase URL typo: saqruqtjjinuslcxryuc');
  }
  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = 'https://' + cleanUrl;
  }
  if (typeof supabase !== 'undefined' && supabase.createClient) {
    supabaseClient = supabase.createClient(cleanUrl, key);
    globalThis.supabaseInstance = supabaseClient;
    if (res.supabaseSession) {
      try {
        await supabaseClient.auth.setSession(res.supabaseSession);
      } catch (e) {
        console.warn('[Background Supabase] Failed to restore session:', e);
      }
    }
  }
  return supabaseClient;
}

// Open side panel
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Install: create context menus, init defaults
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ci-capture',
    title: '\u{1F48A} Capture as Capsule',
    contexts: ['selection', 'page'],
    documentUrlPatterns: [
      'https://chatgpt.com/*', 'https://claude.ai/*', 'https://gemini.google.com/*',
      'https://chat.deepseek.com/*', 'https://mail.google.com/*',
      'https://copilot.microsoft.com/*', 'https://perplexity.ai/*', 'https://poe.com/*'
    ]
  });

  chrome.storage.local.get(['folders', 'settings', 'user'], (result) => {
    if (!result.folders) {
      chrome.storage.local.set({
        folders: [
          { id: 'default', name: 'General', color: '#6366f1', createdAt: Date.now() },
          { id: 'engineering', name: 'Engineering', color: '#10b981', createdAt: Date.now() },
          { id: 'marketing', name: 'Marketing', color: '#f59e0b', createdAt: Date.now() },
          { id: 'product', name: 'Product', color: '#ec4899', createdAt: Date.now() },
          { id: 'research', name: 'Research', color: '#8b5cf6', createdAt: Date.now() }
        ]
      });
    }
    if (!result.settings) {
      chrome.storage.local.set({
        settings: {
          theme: 'dark',
          showFloatingButton: true,
          dragDropEnabled: true,
          autoSync: true,
          syncInterval: 300000 // 5 minutes
        }
      });
    }
  });
});

// Context menu handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ci-capture' && tab) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'CONTEXT_CAPTURE',
      selectionText: info.selectionText || ''
    });
  }
});

const activeTransfers = {};

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'START_CHUNKED_SAVE': {
      const { transferId, totalChunks, metadata } = message;
      activeTransfers[transferId] = {
        totalChunks,
        metadata,
        chunks: new Array(totalChunks)
      };
      sendResponse({ success: true });
      return false;
    }

    case 'SAVE_CHUNK': {
      const { transferId, chunkIndex, chunkData } = message;
      const transfer = activeTransfers[transferId];
      if (!transfer) {
        sendResponse({ error: 'Transfer not found or timed out' });
        return false;
      }
      transfer.chunks[chunkIndex] = chunkData;
      sendResponse({ success: true });
      return false;
    }

    case 'COMMIT_CHUNKED_SAVE': {
      const { transferId } = message;
      const transfer = activeTransfers[transferId];
      if (!transfer) {
        sendResponse({ error: 'Transfer not found' });
        return false;
      }

      const fullContent = transfer.chunks.join('');
      const uuid = self.crypto?.randomUUID ? self.crypto.randomUUID() : '3ecf8f74-7e8e-4f36-9b6f-' + Math.random().toString(16).substring(2, 14);
      const capsule = {
        ...transfer.metadata,
        content: fullContent,
        id: uuid,
        metadata: {
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1
        }
      };

      // Perform save & Supabase sync inside background worker
      (async () => {
        const res = await chrome.storage.local.get(['capsules']);
        const sb = await getSupabaseClient();
        if (sb) {
          try {
            let userId = null;
            try {
              const { data: { user }, error: userError } = await sb.auth.getUser();
              if (!userError && user?.id) {
                userId = user.id;
              }
            } catch (authErr) {
              console.warn('[Background] Supabase getUser failed, trying fallback:', authErr);
            }

            if (!userId) {
              const localUser = await chrome.storage.local.get(['user']);
              if (localUser?.user?.id) {
                userId = localUser.user.id;
              }
            }

            if (!userId) throw new Error('No user session found for database sync');
            
            const dbObj = {
              id: uuid,
              user_id: userId, // Explicit user_id column complying with RLS or fallback ID
              title: capsule.title || 'Untitled',
              content: JSON.stringify({
                content: capsule.content || '',
                platform: capsule.platform || 'unknown',
                sourceUrl: capsule.sourceUrl || '',
                folderId: capsule.folderId || 'default',
                tags: capsule.tags || [],
                messageCount: capsule.messageCount || 1,
                updatedAt: capsule.metadata.updatedAt,
                version: capsule.metadata.version,
                versionHistory: []
              })
            };
            const { error: insertError } = await sb.from('capsules').upsert(dbObj);
            if (insertError) throw insertError;
          } catch (e) {
            console.error('[Background Chunk Save] Supabase sync failed:', e);
          }
        }

        // Save locally immediately
        let capsules = res.capsules || [];
        capsules.push(capsule);
        await chrome.storage.local.set({ capsules });

        delete activeTransfers[transferId];
        sendResponse({ success: true, savedCapsule: capsule });
      })();

      return true; // Keep channel open for async response
    }

    case 'OPEN_SIDEBAR':
      if (sender.tab) chrome.sidePanel.open({ tabId: sender.tab.id });
      sendResponse({ success: true });
      return false;

    case 'TRIGGER_GOOGLE_AUTH': {
      (async () => {
        try {
          const res = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey', 'googleClientId']);
          const defaultUrl = 'https://saqruqtjjinuslcxryuc.supabase.co';
          const defaultKey = 'sb_publishable_mp0xexkqtCWhPHRuE0FimQ_yjstjdTC';
          
          let token = null;
          let refreshToken = null;
          let userObj = null;

          const url = res.supabaseUrl || defaultUrl;
          const key = res.supabaseKey || defaultKey;

          if (url && key) {
            // Sanitize Supabase URL (strip trailing slashes, ensure protocol is present)
            let cleanUrl = url.trim().replace(/\/+$/, '');
            if (cleanUrl.includes('saqruqtjinuslcxryuc') && !cleanUrl.includes('saqruqtjjinuslcxryuc')) {
              cleanUrl = 'https://saqruqtjjinuslcxryuc.supabase.co';
              await chrome.storage.local.set({ supabaseUrl: cleanUrl });
              console.log('[Auto-Correct] Background fixed Supabase URL typo during OAuth initiate: saqruqtjjinuslcxryuc');
            }
            if (!/^https?:\/\//i.test(cleanUrl)) {
              cleanUrl = 'https://' + cleanUrl;
            }

            const sb = supabase.createClient(cleanUrl, key);
            const redirectUrl = chrome.identity.getRedirectURL();

            // Initiate Supabase OAuth to get the raw authorization URL
            const { data: oauthData, error: oauthErr } = await sb.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: redirectUrl,
                skipBrowserRedirect: true,
                queryParams: {
                  prompt: 'select_account'
                }
              }
            });

            if (oauthErr || !oauthData?.url) {
              throw new Error(oauthErr?.message || 'Failed to initiate Supabase Google OAuth');
            }

            const authUrl = oauthData.url;
            console.log('[Background OAuth] Launching WebAuthFlow with URL:', authUrl);

            let responseUrl = null;
            try {
              responseUrl = await new Promise((resolve, reject) => {
                chrome.identity.launchWebAuthFlow({
                  url: authUrl,
                  interactive: true
                }, (url) => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                  } else {
                    resolve(url);
                  }
                });
              });
            } catch (authFlowErr) {
              console.error('[Background OAuth] launchWebAuthFlow failed for URL:', authUrl, authFlowErr);
              throw authFlowErr;
            }

            if (!responseUrl) throw new Error('No redirect URL returned');

            const parsedUrl = new URL(responseUrl);
            let code = parsedUrl.searchParams.get("code") || new URLSearchParams(parsedUrl.hash.substring(1)).get("code");
            let session = null;

            if (code) {
              const { data: sessionData, error: sessionErr } = await sb.auth.exchangeCodeForSession(code);
              if (sessionErr) throw sessionErr;
              session = sessionData.session;
              token = session.access_token;
              refreshToken = session.refresh_token;
            } else {
              const params = new URLSearchParams(parsedUrl.hash.substring(1));
              token = params.get("access_token");
              refreshToken = params.get("refresh_token");
              if (!token) throw new Error('No auth code or access token found in redirect URL');
              session = { access_token: token, refresh_token: refreshToken };
              await sb.auth.setSession(session);
            }

            const { data: { user }, error: userErr } = await sb.auth.getUser();
            if (userErr || !user) throw new Error('Failed to retrieve user profile from Supabase');

            userObj = {
              id: user.id,
              email: user.email,
              name: user.user_metadata?.full_name || user.email.split('@')[0],
              createdAt: Date.now()
            };

            await chrome.storage.local.set({
              authToken: token,
              supabaseSession: session,
              user: userObj,
              googleAuth: true
            });
          } else {
            // Standalone Google OAuth Fallback
            const clientId = res.googleClientId || "328828088778-k9g6656bjtih0mhjckqrqa78gooimu83.apps.googleusercontent.com";
            const redirectUrl = chrome.identity.getRedirectURL();
            const scopes = encodeURIComponent("https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile");

            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth` +
                            `?client_id=${clientId}` +
                            `&response_type=token` +
                            `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
                            `&scope=${scopes}` +
                            `&prompt=select_account`;

            const responseUrl = await new Promise((resolve, reject) => {
              chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive: true
              }, (url) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else {
                  resolve(url);
                }
              });
            });

            if (!responseUrl) throw new Error('No redirect URL returned');

            const parsedUrl = new URL(responseUrl);
            const params = new URLSearchParams(parsedUrl.hash.substring(1));
            token = params.get("access_token");

            if (!token) throw new Error('No access token found in redirect URL');

            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to retrieve user profile from Google');
            const profile = await response.json();

            const email = profile.email;
            const name = profile.name || email.split('@')[0];

            const id = 'g_' + email.replace(/[^a-zA-Z0-9]/g, '_');
            userObj = { id, email, name, createdAt: Date.now() };

            await chrome.storage.local.set({
              authToken: token,
              user: userObj,
              googleAuth: true
            });
          }

          // Broadcast AUTH_SUCCESS to popup and sidebar
          chrome.runtime.sendMessage({
            type: 'AUTH_SUCCESS',
            user: userObj,
            token: token
          });

          sendResponse({ success: true, user: userObj, token });
        } catch (err) {
          console.error('[Background OAuth Error]:', err);
          sendResponse({ error: err.message });
        }
      })();
      return true; // Keep message channel open for async response
    }

    case 'CLEAR_AUTH_TOKEN': {
      const { token } = message;
      (async () => {
        try {
          if (supabaseClient) {
            try {
              await supabaseClient.auth.signOut();
            } catch (e) {
              console.warn('[Background Logout] error signing out of Supabase:', e);
            }
            supabaseClient = null;
            globalThis.supabaseInstance = null;
          }
          await chrome.storage.local.remove(['supabaseSession']);

          if (chrome.identity && chrome.identity.removeCachedAuthToken) {
            const tokenToClear = token || (await chrome.storage.local.get('authToken')).authToken;
            if (tokenToClear) {
              await new Promise((resolve) => {
                chrome.identity.removeCachedAuthToken({ token: tokenToClear }, () => {
                  if (chrome.runtime.lastError) {
                    console.warn('[Background Logout] error clearing token:', chrome.runtime.lastError.message);
                  }
                  resolve();
                });
              });
            }
          }
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ error: err.message });
        }
      })();
      return true;
    }

    case 'SEND_GMAIL_INVITE_AUTOMATED': {
      const { to, teamName, inviteCode, creatorEmail } = message;
      const subject = `Invite to join Capsule Infinity team: ${teamName}`;
      const body = `Hi,\n\nI have invited you to join my Capsule Infinity team "${teamName}".\n\nTo accept and confirm this invite, open the Capsule Infinity extension, click "Join Team", and enter this invite code:\n\n${inviteCode}\n\nThis invite code is valid for 5 minutes.\n\nBest regards,\n${creatorEmail}`;
      
      const composeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}&ci_auto_send=true`;
      
      chrome.tabs.create({ url: composeUrl, active: false }, (tab) => {
        sendResponse({ success: true, tabId: tab?.id });
      });
      return true;
    }

    case 'CLOSE_TAB': {
      if (sender.tab && sender.tab.id) {
        chrome.tabs.remove(sender.tab.id);
      }
      sendResponse({ success: true });
      return false;
    }

    case 'GET_PLATFORM':
      sendResponse({ platform: detectPlatform(sender.tab?.url) });
      return false;

    case 'SYNC_TO_SERVER':
      syncToServer().then(sendResponse).catch(e => sendResponse({ error: e.message }));
      return true;

    case 'SYNC_FROM_SERVER':
      syncFromServer().then(sendResponse).catch(e => sendResponse({ error: e.message }));
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

function detectPlatform(url) {
  if (!url) return 'unknown';
  if (url.includes('chatgpt.com') || url.includes('openai.com')) return 'chatgpt';
  if (url.includes('claude.ai')) return 'claude';
  if (url.includes('gemini.google.com')) return 'gemini';
  if (url.includes('deepseek.com')) return 'deepseek';
  if (url.includes('mail.google.com')) return 'gmail';
  if (url.includes('copilot.microsoft.com')) return 'copilot';
  if (url.includes('perplexity.ai')) return 'perplexity';
  if (url.includes('poe.com')) return 'poe';
  if (url.includes('phind.com')) return 'phind';
  if (url.includes('you.com')) return 'you';
  if (url.includes('kagi.com')) return 'kagi';
  return 'unknown';
}

// Auto-sync every 5 minutes
setInterval(async () => {
  const result = await chrome.storage.local.get(['settings', 'authToken']);
  if (result.settings?.autoSync && result.authToken) {
    try { await syncToServer(); } catch {}
  }
}, 300000);

async function syncToServer() {
  const result = await chrome.storage.local.get(['authToken', 'capsules', 'lastSync', 'supabaseUrl', 'supabaseKey', 'user']);
  const user = result.user;

  const sb = await getSupabaseClient();
  if (sb && user) {
    const capsules = result.capsules || [];
    const since = result.lastSync || 0;
    const toSync = capsules.filter(c => (c.metadata?.updatedAt || c.createdAt || 0) > since);
    if (toSync.length === 0) return { synced: 0 };

    let successCount = 0;
    for (const capsule of toSync) {
      try {
        const uuid = (capsule.id && capsule.id.length === 36 && !capsule.id.includes('cap_')) 
          ? capsule.id 
          : (self.crypto?.randomUUID ? self.crypto.randomUUID() : '3ecf8f74-7e8e-4f36-9b6f-' + Math.random().toString(16).substring(2, 14));
        
        capsule.id = uuid;

        const dbObj = {
          id: uuid,
          user_id: user.id,
          title: capsule.title || 'Untitled',
          content: JSON.stringify({
            content: capsule.content || '',
            platform: capsule.platform || 'unknown',
            sourceUrl: capsule.sourceUrl || '',
            folderId: capsule.folderId || 'default',
            tags: capsule.tags || [],
            messageCount: capsule.messageCount || 1,
            updatedAt: capsule.metadata?.updatedAt || capsule.updatedAt || Date.now(),
            version: capsule.metadata?.version || 1,
            versionHistory: capsule.metadata?.versionHistory || []
          })
        };

        const { error } = await sb.from('capsules').upsert(dbObj);
        if (!error) {
          successCount++;
        }
      } catch (e) {
        console.error('[Background Sync] Supabase capsule sync failed:', e);
      }
    }
    await chrome.storage.local.set({ capsules, lastSync: Date.now() });
    return { synced: successCount };
  }

  if (!result.authToken) return { synced: 0 };

  const capsules = result.capsules || [];
  const since = result.lastSync || 0;
  const toSync = capsules.filter(c => (c.metadata?.updatedAt || c.createdAt || 0) > since);

  if (toSync.length === 0) return { synced: 0 };

  const response = await fetch('/api/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${result.authToken}`
    },
    body: JSON.stringify({ capsules: toSync })
  });

  if (response.ok) {
    await chrome.storage.local.set({ lastSync: Date.now() });
    return { synced: toSync.length };
  }
  throw new Error('Sync failed');
}

async function syncFromServer() {
  const result = await chrome.storage.local.get(['authToken', 'supabaseUrl', 'supabaseKey', 'user']);
  const user = result.user;

  const sb = await getSupabaseClient();
  if (sb && user) {
    try {
      const { data, error } = await sb
        .from('capsules')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const localCapsules = data.map(row => {
          let parsed = {};
          try {
            parsed = JSON.parse(row.content);
          } catch (e) {
            parsed = { content: row.content };
          }
          return {
            id: row.id,
            title: row.title,
            content: parsed.content || '',
            platform: parsed.platform || 'unknown',
            sourceUrl: parsed.sourceUrl || '',
            folderId: parsed.folderId || 'default',
            tags: parsed.tags || [],
            messageCount: parsed.messageCount || 1,
            createdAt: new Date(row.created_at).getTime(),
            updatedAt: parsed.updatedAt || new Date(row.created_at).getTime(),
            metadata: {
              createdAt: new Date(row.created_at).getTime(),
              updatedAt: parsed.updatedAt || new Date(row.created_at).getTime(),
              version: parsed.version || 1,
              versionHistory: parsed.versionHistory || []
            }
          };
        });
        await chrome.storage.local.set({
          capsules: localCapsules,
          lastSync: Date.now()
        });
        return { downloaded: localCapsules.length };
      }
    } catch (e) {
      console.error('[Background Sync] Supabase download failed:', e);
    }
  }

  if (!result.authToken) return { downloaded: 0 };

  const response = await fetch('/api/capsules', {
    headers: { 'Authorization': `Bearer ${result.authToken}` }
  });

  if (response.ok) {
    const data = await response.json();
    const capsules = data.capsules || data || [];
    await chrome.storage.local.set({
      capsules,
      lastSync: Date.now()
    });
    return { downloaded: capsules.length };
  }
  return { downloaded: 0 };
}