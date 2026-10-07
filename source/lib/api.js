// ============================================
// Capsule Infinity - API Client
// Handles all backend communication
// ============================================

const CapsuleAPI = {
  // Will be set from config
  baseUrl: '',

  async getSupabaseClient() {
    if (typeof window !== 'undefined' && window.SupabaseClient) {
      return await window.SupabaseClient.ensureInitialized();
    }
    if (typeof self !== 'undefined' && self.SupabaseClient) {
      return await self.SupabaseClient.ensureInitialized();
    }
    return null;
  },

  async configure() {
    const result = await chrome.storage.local.get('apiBaseUrl');
    // In production, this would be the deployed backend URL
    // For development, use the local Next.js server
    this.baseUrl = result.apiBaseUrl || '';
  },

  async getToken() {
    const result = await chrome.storage.local.get('authToken');
    return result.authToken || null;
  },

  async setToken(token) {
    await chrome.storage.local.set({ authToken: token });
  },

  async clearAuth() {
    await chrome.storage.local.remove(['authToken', 'user']);
  },

  async request(method, path, body = null) {
    if (!this.baseUrl) {
      throw new Error('API Base URL not configured');
    }
    const token = await this.getToken();
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(this.baseUrl + path, options);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired - clear auth
          await this.clearAuth();
        }
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (err) {
      // If API is unreachable, fall back to local storage
      if (err instanceof TypeError && err.message.includes('fetch')) {
        console.log('[Capsule Infinity] API unreachable, using local storage');
        return null; // Caller should fall back to local
      }
      throw err;
    }
  },

  // ---- Auth ----
  async register(email, password, name) {
    try {
      const sb = await this.getSupabaseClient();
      if (sb) {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name
            }
          }
        });
        if (error) throw error;
        if (data?.session) {
          const userObj = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.full_name || data.user.email.split('@')[0],
            createdAt: Date.now()
          };
          await chrome.storage.local.set({
            authToken: data.session.access_token,
            supabaseSession: data.session,
            user: userObj
          });
          return { token: data.session.access_token, user: userObj };
        } else if (data?.user) {
          return { confirmationSent: true, user: { email: data.user.email } };
        }
      }
    } catch (err) {
      console.error('[API register] failed:', err);
      throw err;
    }
    throw new Error('Supabase client not initialized');
  },

  async login(email, password) {
    try {
      const sb = await this.getSupabaseClient();
      if (sb) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data?.session) {
          const userObj = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.full_name || data.user.email.split('@')[0],
            createdAt: Date.now()
          };
          await chrome.storage.local.set({
            authToken: data.session.access_token,
            supabaseSession: data.session,
            user: userObj
          });
          return { token: data.session.access_token, user: userObj };
        }
      }
    } catch (err) {
      console.error('[API login] failed:', err);
      throw err;
    }
    throw new Error('Supabase client not initialized');
  },



  async getMe() {
    try {
      const sb = await this.getSupabaseClient();
      if (sb) {
        const { data: { user }, error } = await sb.auth.getUser();
        if (!error && user) {
          return {
            id: user.id,
            email: user.email,
            name: user.user_metadata?.full_name || user.email.split('@')[0]
          };
        }
      }
    } catch (err) {
      console.error('[API getMe] failed:', err);
    }
    return null;
  },

  // ---- Capsules ----
  async getCapsules(filters = {}) {
    const params = new URLSearchParams();
    if (filters.folderId) params.set('folderId', filters.folderId);
    if (filters.search) params.set('search', filters.search);
    if (filters.platform) params.set('platform', filters.platform);
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    const qs = params.toString();
    return this.request('GET', `/api/capsules${qs ? '?' + qs : ''}`);
  },

  async createCapsule(capsule) {
    return this.request('POST', '/api/capsules', capsule);
  },

  async updateCapsule(id, data) {
    return this.request('PUT', `/api/capsules/${id}`, data);
  },

  async deleteCapsule(id) {
    return this.request('DELETE', `/api/capsules/${id}`);
  },

  async createVersion(id, content, note) {
    return this.request('POST', `/api/capsules/${id}/versions`, { content, note });
  },

  async batchCreate(capsules) {
    return this.request('POST', '/api/capsules/batch', { capsules });
  },

  // ---- Folders ----
  async getFolders() {
    return this.request('GET', '/api/folders');
  },

  async createFolder(name, color) {
    return this.request('POST', '/api/folders', { name, color });
  },

  async deleteFolder(id) {
    return this.request('DELETE', `/api/folders/${id}`);
  },

  // ---- Teams (Disabled in v1.0.3 per user decision TEAMS = DISABLE) ----
  async getTeams() {
    return [];
  },

  async createTeam(name, description) {
    return null;
  },

  async inviteToTeam(teamId, email, role) {
    return false;
  },

  async joinTeam(inviteCode) {
    return null;
  },

  async getTeamMembers(teamId) {
    return [];
  },

  // ---- Sync ----
  async syncCapsules(capsules) {
    return this.request('POST', '/api/sync', { capsules });
  },

  async exportAll() {
    return this.request('GET', '/api/export');
  },

  async importCapsules(data) {
    return this.request('POST', '/api/import', data);
  },
};

if (typeof window !== 'undefined') {
  window.CapsuleAPI = CapsuleAPI;
}