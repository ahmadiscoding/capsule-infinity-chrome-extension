// ============================================
// Capsule Infinity - Shared Supabase Client
// Single source of truth for Supabase initialization
// ============================================

const DEFAULT_SUPABASE_URL = 'https://saqruqtjjinuslcxryuc.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_mp0xexkqtCWhPHRuE0FimQ_yjstjdTC';

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

      if (session) {
        try {
          await this.instance.auth.setSession(session);
        } catch (e) {
          console.warn('[SupabaseClient] Failed to restore session:', e);
        }
      }

      // Listen for auth changes and persist session
      this.instance.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          chrome.storage.local.set({ supabaseSession: session });
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

  async getSession() {
    if (!this.instance) await this.init();
    if (!this.instance) return null;
    const { data: { session } } = await this.instance.auth.getSession();
    return session;
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