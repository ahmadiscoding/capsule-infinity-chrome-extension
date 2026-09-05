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

importScripts('lib/supabase-js.js', 'lib/supabase-client.js');

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
      const uuid = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
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
        const sb = await SupabaseClient.ensureInitialized();
        const session = await SupabaseClient.getSession();
        if (sb && session?.access_token) {
          try {
            let userId = session.user?.id;
            if (!userId) {
              try {
                const user = await SupabaseClient.getUser();
                if (user?.id) userId = user.id;
              } catch {}
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
            console.error('[Background Chunk Save] Supabase sync failed:', e.message || e.details || JSON.stringify(e));
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
          const clientId = res.googleClientId || "328828088778-k9g6656bjtih0mhjckqrqa78gooimu83.apps.googleusercontent.com";
          const redirectUrl = chrome.identity.getRedirectURL(); // e.g. https://<extension-id>.chromiumapp.org/

          let token = null;
          let refreshToken = null;
          let session = null;
          let userObj = null;

          const sb = await SupabaseClient.ensureInitialized();

          // Strategy 1: Supabase Hosted OAuth with PKCE
          let oauthSuccess = false;
          if (sb) {
            try {
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

              if (!oauthErr && oauthData?.url) {
                console.log('[Background OAuth] Attempting Supabase PKCE flow with URL:', oauthData.url);
                const responseUrl = await new Promise((resolve, reject) => {
                  chrome.identity.launchWebAuthFlow({
                    url: oauthData.url,
                    interactive: true
                  }, (url) => {
                    if (chrome.runtime.lastError) {
                      reject(new Error(chrome.runtime.lastError.message));
                    } else if (!url) {
                      reject(new Error("Authorization flow was cancelled or closed."));
                    } else {
                      resolve(url);
                    }
                  });
                });

                if (responseUrl) {
                  const parsedUrl = new URL(responseUrl);
                  const code = parsedUrl.searchParams.get("code") || (parsedUrl.hash ? new URLSearchParams(parsedUrl.hash.substring(1)).get("code") : null);
                  const hashParams = parsedUrl.hash ? new URLSearchParams(parsedUrl.hash.substring(1)) : null;
                  const accessToken = hashParams?.get("access_token") || parsedUrl.searchParams.get("access_token");
                  const refreshTok = hashParams?.get("refresh_token") || parsedUrl.searchParams.get("refresh_token");

                  if (code) {
                    const { data: sessionData, error: sessionErr } = await sb.auth.exchangeCodeForSession(code);
                    if (!sessionErr && sessionData?.session) {
                      session = sessionData.session;
                      token = session.access_token;
                      refreshToken = session.refresh_token;
                      oauthSuccess = true;
                    }
                  } else if (accessToken) {
                    const { data: sessionData, error: setSessionError } = await sb.auth.setSession({
                      access_token: accessToken,
                      refresh_token: refreshTok || ''
                    });
                    if (!setSessionError) {
                      session = sessionData?.session || { access_token: accessToken, refresh_token: refreshTok };
                      token = session.access_token;
                      refreshToken = session.refresh_token;
                      oauthSuccess = true;
                    }
                  }
                }
              }
            } catch (supabaseOAuthErr) {
              console.warn('[Background OAuth] Supabase OAuth URL failed, falling back to Direct Google OAuth:', supabaseOAuthErr.message || supabaseOAuthErr);
            }
          }

          // Strategy 2: Direct Google OAuth + Supabase signInWithIdToken
          if (!oauthSuccess) {
            console.log('[Background OAuth] Launching Direct Google OAuth flow...');
            const nonce = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2);
            const scopes = encodeURIComponent("openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile");

            const directAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth` +
                                  `?client_id=${clientId}` +
                                  `&response_type=token%20id_token` +
                                  `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
                                  `&scope=${scopes}` +
                                  `&nonce=${nonce}` +
                                  `&prompt=select_account`;

            const responseUrl = await new Promise((resolve, reject) => {
              chrome.identity.launchWebAuthFlow({
                url: directAuthUrl,
                interactive: true
              }, (url) => {
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                } else if (!url) {
                  reject(new Error("Authorization flow was cancelled."));
                } else {
                  resolve(url);
                }
              });
            });

            if (!responseUrl) throw new Error('No redirect URL returned from Google OAuth.');

            const parsedUrl = new URL(responseUrl);
            const hashParams = parsedUrl.hash ? new URLSearchParams(parsedUrl.hash.substring(1)) : null;
            const googleAccessToken = hashParams?.get("access_token") || parsedUrl.searchParams.get("access_token");
            const googleIdToken = hashParams?.get("id_token") || parsedUrl.searchParams.get("id_token");

            if (!googleAccessToken && !googleIdToken) {
              const errDesc = parsedUrl.searchParams.get("error_description") || hashParams?.get("error_description") || parsedUrl.searchParams.get("error");
              throw new Error(errDesc || 'No access token or ID token returned from Google');
            }

            token = googleAccessToken || googleIdToken;

            // Attempt to link to Supabase via signInWithIdToken
            if (sb && googleIdToken) {
              try {
                const { data: idTokenData, error: idTokenErr } = await sb.auth.signInWithIdToken({
                  provider: 'google',
                  token: googleIdToken,
                  access_token: googleAccessToken || undefined,
                  nonce: nonce
                });
                if (!idTokenErr && idTokenData?.session) {
                  session = idTokenData.session;
                  token = session.access_token;
                  refreshToken = session.refresh_token;
                }
              } catch (e) {
                console.warn('[Background OAuth] signInWithIdToken fallback error:', e.message || e);
              }
            }

            // If we have Google access token, fetch Google user profile
            if (googleAccessToken) {
              try {
                const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                  headers: { Authorization: `Bearer ${googleAccessToken}` }
                });
                if (profileRes.ok) {
                  const profile = await profileRes.json();
                  const email = profile.email;
                  const name = profile.name || email?.split('@')[0] || 'User';
                  const id = session?.user?.id || ('g_' + (email ? email.replace(/[^a-zA-Z0-9]/g, '_') : 'user'));
                  userObj = { id, email, name, avatar: profile.picture || null, createdAt: Date.now() };
                }
              } catch (e) {
                console.warn('[Background OAuth] Google userinfo fetch failed:', e.message || e);
              }
            }
          }

          // If session user exists in Supabase, use Supabase profile
          if (sb && session) {
            try {
              const { data: { user } } = await sb.auth.getUser();
              if (user) {
                userObj = {
                  id: user.id,
                  email: user.email,
                  name: user.user_metadata?.full_name || user.user_metadata?.name || userObj?.name || user.email?.split('@')[0] || 'User',
                  avatar: user.user_metadata?.avatar_url || user.user_metadata?.picture || userObj?.avatar || null,
                  createdAt: Date.now()
                };
              }
            } catch {}
          }

          if (!userObj && !token) {
            throw new Error("Unable to complete Google Sign-in. Please try again.");
          }

          if (!userObj) {
            userObj = { id: 'user_' + Date.now(), email: 'user@example.com', name: 'User', createdAt: Date.now() };
          }

          await chrome.storage.local.set({
            authToken: token,
            supabaseSession: session || null,
            user: userObj,
            googleAuth: true
          });

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
      (async () => {
        try {
          await SupabaseClient.signOut();
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

      const composeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

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

    case 'REQUEST_CAPSULE_COMPRESSION': {
      (async () => {
        try {
          console.log('[Background AI Compression] Handler invoked. Getting session...');
          const session = await SupabaseClient.getSession();
          console.log('[Background AI Compression] Session result:', session ? `access_token present, expires_at: ${session.expires_at}` : 'NULL - no session');
          
          if (!session || !session.access_token) {
            console.warn('[Background AI Compression] No active Supabase session. Responding NOT_LOGGED_IN.');
            sendResponse({ error: "NOT_LOGGED_IN" });
            return;
          }

          // Helper: make the actual Edge Function call with a given access_token
          async function callEdgeFunction(accessToken) {
            const { url } = await SupabaseClient.getConfig();
            const cleanUrl = SupabaseClient.fixUrlTypo(url);
            const functionUrl = `${cleanUrl}/functions/v1/compress`;
            console.log('[Background AI Compression] Calling Edge Function:', functionUrl);
            console.log('[Background AI Compression] Transcript length:', message.transcript?.length);

            // 40s timeout on the fetch to Edge Function
            const abortCtrl = new AbortController();
            const fetchTimeout = setTimeout(() => abortCtrl.abort(), 40000);

            let response;
            try {
              response = await fetch(functionUrl, {
                method: "POST",
                signal: abortCtrl.signal,
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${accessToken}`
                },
                body: JSON.stringify({ transcript: message.transcript })
              });
            } finally {
              clearTimeout(fetchTimeout);
            }

            console.log('[Background AI Compression] Edge Function HTTP status:', response.status);
            const result = await response.json().catch(() => ({}));
            console.log('[Background AI Compression] Edge Function result keys:', Object.keys(result));
            return { response, result };
          }

          // First attempt
          let { response, result } = await callEdgeFunction(session.access_token);

          // Part 16 step 2: Retry-once-on-401
          // If the Edge Function rejected the token (expired), force-refresh and retry exactly once
          if (response.status === 401) {
            console.warn('[Background AI Compression] Got 401 UNAUTHORIZED. Attempting session refresh and retry...');
            const refreshedSession = await SupabaseClient.forceRefreshSession();
            if (refreshedSession && refreshedSession.access_token) {
              console.log('[Background AI Compression] Session refreshed. Retrying Edge Function call...');
              ({ response, result } = await callEdgeFunction(refreshedSession.access_token));
              
              if (response.status === 401) {
                // Refresh succeeded but token still rejected — genuine re-login needed
                console.error('[Background AI Compression] Retry still returned 401. User must re-login.');
                sendResponse({ error: "SESSION_EXPIRED", message: "Your session has expired. Please sign in again." });
                return;
              }
            } else {
              // Refresh itself failed — the refresh_token is also expired, user must re-login
              console.error('[Background AI Compression] Session refresh failed. User must re-login.');
              sendResponse({ error: "SESSION_EXPIRED", message: "Your session has expired. Please sign in again." });
              return;
            }
          }

          if (response.status === 403 && result.error === "LIMIT_REACHED") {
            sendResponse({ error: "LIMIT_REACHED", plan: result.plan, monthlyLimit: result.monthlyLimit });
            return;
          }
          if (response.status === 503 && result.error === "DAILY_CAPACITY_REACHED") {
            sendResponse({ error: "DAILY_CAPACITY_REACHED" });
            return;
          }
          if (!response.ok) {
            console.error('[Background AI Compression] Non-OK response:', response.status, JSON.stringify(result).substring(0, 300));
            sendResponse({ error: "UNKNOWN", raw: result });
            return;
          }

          console.log('[Background AI Compression] SUCCESS. servedBy:', result.servedBy);
          sendResponse({ capsule: result.capsule, servedBy: result.servedBy });
        } catch (err) {
          console.error('[Background AI Compression Error]:', err);
          sendResponse({ error: "UNKNOWN", raw: err.message });
        }
      })();
      return true; // Keep message channel open for async response
    }

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
let syncIntervalId = null;

chrome.runtime.onStartup.addListener(() => {
  startAutoSync();
});

chrome.runtime.onInstalled.addListener(() => {
  startAutoSync();
});

function startAutoSync() {
  if (syncIntervalId) clearInterval(syncIntervalId);
  syncIntervalId = setInterval(async () => {
    const result = await chrome.storage.local.get(['settings', 'authToken']);
    if (result.settings?.autoSync && result.authToken) {
      try { await syncToServer(); } catch {}
    }
  }, 300000);
}

chrome.runtime.onSuspend.addListener(() => {
  if (syncIntervalId) clearInterval(syncIntervalId);
});

async function syncToServer() {
  const result = await chrome.storage.local.get(['authToken', 'capsules', 'lastSync', 'supabaseUrl', 'supabaseKey', 'user']);
  const user = result.user;

  const sb = await SupabaseClient.ensureInitialized();
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
          : ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));

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

  const sb = await SupabaseClient.ensureInitialized();
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