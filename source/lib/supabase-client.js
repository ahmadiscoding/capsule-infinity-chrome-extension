// ============================================
// Capsule Infinity - Shared Supabase Client
// Single source of truth for Supabase initialization
// Handles MV3 service worker suspension-safe session management
// ============================================

const DEFAULT_SUPABASE_URL = 'https://saqruqtjjinuslcxryuc.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_mp0xexkqtCWhPHRuE0FimQ_yjstjdTC';

// Session expiry safety margin: refresh if token expires within this many seconds
const SESSION_EXPIRY_MARGIN_SECONDS = 120;

const SupabaseClient = {
  instance: null,
  url: null,
  key: null,
  initialized: false,

  async getConfig() {
    const res = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey', 'supabaseSession']);
    const url = (res.supabaseUrl || DEFAULT_SUPABASE_URL).trim().replace(/\/+$/, '');
    const key = res.supabaseKey || DEFAULT_SUPABASE_KEY;
    return { url, key, session: res.supabaseSession };
  },

  fixUrlTypo(url) {
    let cleanUrl = url.trim().replace(/\/+$/, '');
    if (cleanUrl.includes('saqruqtjinuslcxryuc') && !cleanUrl.includes('saqruqtjjinuslcxryuc')) {
      cleanUrl = 'https://saqruqtjjinuslcxryuc.supabase.co';
    }
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }
    return cleanUrl;
  },

  async init() {
    if (this.initialized && this.instance) {
      return this.instance;
    }

    const { url, key, session } = await this.getConfig();
    const cleanUrl = this.fixUrlTypo(url);

    // Save corrected URL if it was fixed
    if (cleanUrl !== url) {
      await chrome.storage.local.set({ supabaseUrl: cleanUrl });
    }

    if (typeof supabase !== 'undefined' && supabase.createClient) {
      this.instance = supabase.createClient(cleanUrl, key);
      this.url = cleanUrl;
      this.key = key;
      this.initialized = true;

      // Part 16: Restore session from chrome.storage.local on every init.
      // Critical for MV3 — the service worker can be killed at any time,
      // so we always re-hydrate from persistent storage rather than relying
      // on the in-memory Supabase client which loses state on suspension.
      if (session) {
        try {
          await this.instance.auth.setSession(session);
          console.log('[SupabaseClient] Session restored from chrome.storage.local');
        } catch (e) {
          console.warn('[SupabaseClient] Failed to restore session:', e);
        }
      }

      // Listen for auth changes and persist session to chrome.storage.local
      this.instance.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          chrome.storage.local.set({ supabaseSession: session });
          console.log('[SupabaseClient] Session persisted to chrome.storage.local (event:', event, ')');
        } else if (event === 'SIGNED_OUT') {
          chrome.storage.local.remove(['supabaseSession']);
        }
      });

      return this.instance;
    }

    return null;
  },

  getClient() {
    return this.instance;
  },

  /**
   * Part 16: Session-aware getSession that proactively refreshes expired/near-expiry tokens.
   *
   * MV3 service workers get killed after ~30s of inactivity, which silently breaks
   * Supabase's setInterval-based auto-refresh timer. This method:
   * 1. Re-hydrates from chrome.storage.local if the in-memory client lost state
   * 2. Checks expires_at and proactively refreshes if within the safety margin
   * 3. Returns a guaranteed-fresh session or null
   */
  async getSession() {
    if (!this.instance) await this.init();
    if (!this.instance) return null;

    // First, try to get session from the Supabase client's in-memory state
    let { data: { session } } = await this.instance.auth.getSession();

    // If no in-memory session, try re-hydrating from chrome.storage.local
    // (handles MV3 service worker restart where in-memory state is lost)
    if (!session) {
      const stored = await chrome.storage.local.get(['supabaseSession']);
      if (stored.supabaseSession) {
        console.log('[SupabaseClient] No in-memory session, re-hydrating from chrome.storage.local...');
        try {
          const { data, error } = await this.instance.auth.setSession(stored.supabaseSession);
          if (!error && data?.session) {
            session = data.session;
            console.log('[SupabaseClient] Session re-hydrated successfully');
          } else {
            console.warn('[SupabaseClient] Re-hydration failed:', error?.message);
          }
        } catch (e) {
          console.warn('[SupabaseClient] Re-hydration threw:', e.message);
        }
      }
    }

    if (!session) return null;

    // Check if the token is expired or close to expiring
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at || 0;
    const secondsUntilExpiry = expiresAt - nowSeconds;

    if (secondsUntilExpiry < SESSION_EXPIRY_MARGIN_SECONDS) {
      console.log('[SupabaseClient] Session expires in ' + secondsUntilExpiry + 's (margin: ' + SESSION_EXPIRY_MARGIN_SECONDS + 's). Proactively refreshing...');
      try {
        const { data, error } = await this.instance.auth.refreshSession();
        if (!error && data?.session) {
          session = data.session;
          // Persist the refreshed session immediately
          await chrome.storage.local.set({ supabaseSession: session });
          console.log('[SupabaseClient] Session refreshed successfully. New expires_at:', session.expires_at);
        } else {
          console.warn('[SupabaseClient] Proactive refresh failed:', error?.message);
          // Session is stale but we still return it — the caller's retry-on-401
          // logic will handle the server-side rejection
        }
      } catch (e) {
        console.warn('[SupabaseClient] Proactive refresh threw:', e.message);
      }
    }

    return session;
  },

  /**
   * Part 16: Force-refresh the session and return the new one.
   * Used by the retry-on-401 logic in background.js.
   * Returns the refreshed session or null if refresh fails.
   */
  async forceRefreshSession() {
    if (!this.instance) await this.init();
    if (!this.instance) return null;

    // First try re-hydrating from storage in case service worker restarted
    const stored = await chrome.storage.local.get(['supabaseSession']);
    if (stored.supabaseSession) {
      try {
        await this.instance.auth.setSession(stored.supabaseSession);
      } catch (e) {
        console.warn('[SupabaseClient] forceRefresh: re-hydration failed:', e.message);
      }
    }

    try {
      const { data, error } = await this.instance.auth.refreshSession();
      if (!error && data?.session) {
        await chrome.storage.local.set({ supabaseSession: data.session });
        console.log('[SupabaseClient] forceRefreshSession succeeded. New expires_at:', data.session.expires_at);
        return data.session;
      } else {
        console.error('[SupabaseClient] forceRefreshSession failed:', error?.message);
        return null;
      }
    } catch (e) {
      console.error('[SupabaseClient] forceRefreshSession threw:', e.message);
      return null;
    }
  },

  async getUser() {
    if (!this.instance) await this.init();
    if (!this.instance) return null;
    try {
      const { data: { session } } = await this.instance.auth.getSession();
      if (session?.user) return session.user;
    } catch {}
    const { data: { user } } = await this.instance.auth.getUser();
    return user;
  },

  async signOut() {
    if (this.instance) {
      try {
        await this.instance.auth.signOut();
      } catch (e) {
        console.warn('[SupabaseClient] Sign out error:', e);
      }
    }
    this.instance = null;
    this.initialized = false;
    await chrome.storage.local.remove(['supabaseSession']);
  },

  async ensureInitialized() {
    if (!this.initialized) {
      await this.init();
    } else if (this.instance) {
      try {
        const res = await chrome.storage.local.get(['supabaseSession']);
        const storageSession = res.supabaseSession;
        const { data: { session: currentSession } } = await this.instance.auth.getSession();

        if (storageSession) {
          if (!currentSession || currentSession.access_token !== storageSession.access_token) {
            await this.instance.auth.setSession(storageSession);
          }
        } else if (currentSession) {
          await this.signOut();
          await this.init();
        }
      } catch (e) {
        console.warn('[SupabaseClient] Session sync in ensureInitialized failed:', e);
      }
    }
    return this.instance;
  }
};

// Export for different contexts
if (typeof window !== 'undefined') {
  window.SupabaseClient = SupabaseClient;
}

if (typeof self !== 'undefined' && typeof importScripts === 'function') {
  self.SupabaseClient = SupabaseClient;
}