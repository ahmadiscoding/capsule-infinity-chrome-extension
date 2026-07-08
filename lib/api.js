// ============================================
// Capsule Infinity - API Client
// Handles all backend communication
// ============================================

const CapsuleAPI = {
  // Will be set from config
  baseUrl: '',

  async getSupabaseClient() {
    const res = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey', 'supabaseSession']);
    const defaultUrl = 'https://saqruqtjjinuslcxryuc.supabase.co';
    const defaultKey = 'sb_publishable_mp0xexkqtCWhPHRuE0FimQ_yjstjdTC';
    
    let cleanUrl = (res.supabaseUrl || defaultUrl).trim().replace(/\/+$/, '');
    const key = res.supabaseKey || defaultKey;

    if (cleanUrl.includes('saqruqtjinuslcxryuc') && !cleanUrl.includes('saqruqtjjinuslcxryuc')) {
      cleanUrl = 'https://saqruqtjjinuslcxryuc.supabase.co';
    }
    if (!/^https?:\/\//i.test(cleanUrl)) {
      cleanUrl = 'https://' + cleanUrl;
    }
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      const client = supabase.createClient(cleanUrl, key);
      if (res.supabaseSession) {
        try {
          await client.auth.setSession(res.supabaseSession);
        } catch (e) {
          console.warn('[API Supabase] Failed to set session:', e);
        }
      }
      return client;
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
    return this.request('POST', '/api/auth/register', { email, password, name });
  },

  async login(email, password) {
    const data = await this.request('POST', '/api/auth/login', { email, password });
    if (data?.token) {
      await this.setToken(data.token);
      await chrome.storage.local.set({ user: data.user });
    }
    return data;
  },

  async googleAuth(email, name, googleId) {
    const data = await this.request('POST', '/api/auth/google', { email, name, googleId });
    if (data?.token) {
      await this.setToken(data.token);
      await chrome.storage.local.set({ user: data.user });
    }
    return data;
  },

  async getMe() {
    return this.request('GET', '/api/auth/me');
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

  // ---- Teams ----
  async getTeams() {
    try {
      const sb = await this.getSupabaseClient();
      if (sb) {
        const { data: { user }, error: userError } = await sb.auth.getUser();
        if (userError) throw userError;
        if (user && user.email) {
          const { data, error } = await sb.from('teams').select('*').contains('user_emails', [user.email]);
          if (!error) return data || [];
        }
      }
    } catch (err) {
      console.error('[API getTeams] failed:', err);
    }
    return [];
  },

  async createTeam(name, description) {
    try {
      const sb = await this.getSupabaseClient();
      if (sb) {
        const { data: { user }, error: userError } = await sb.auth.getUser();
        if (userError) throw userError;
        if (user && user.email) {
          const id = 'team_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
          const inviteCode = Math.floor(100000 + Math.random() * 900000).toString();
          const dbObj = {
            team_id: id,
            name,
            description: description || '',
            invite_code: inviteCode,
            invite_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            members: [{ email: user.email, role: 'owner' }],
            user_emails: [user.email],
            created_at: new Date().toISOString()
          };
          const { data, error } = await sb.from('teams').insert(dbObj).select();
          if (!error) return data?.[0] || dbObj;
        }
      }
    } catch (err) {
      console.error('[API createTeam] failed:', err);
    }
    return null;
  },

  async inviteToTeam(teamId, email, role) {
    try {
      const sb = await this.getSupabaseClient();
      if (sb) {
        const { data: teamData, error: fetchErr } = await sb.from('teams').select('*').eq('team_id', teamId).single();
        if (!fetchErr && teamData) {
          const members = teamData.members || [];
          if (!members.some(m => m.email === email)) {
            members.push({ email, role: role || 'member' });
          }
          const user_emails = members.map(m => m.email);
          const { error: updateErr } = await sb.from('teams').update({ members, user_emails }).eq('team_id', teamId);
          if (!updateErr) return true;
        }
      }
    } catch (err) {
      console.error('[API inviteToTeam] failed:', err);
    }
    return false;
  },

  async joinTeam(inviteCode) {
    try {
      const sb = await this.getSupabaseClient();
      if (sb) {
        const { data: { user }, error: userError } = await sb.auth.getUser();
        if (userError) throw userError;
        if (user && user.email) {
          const { data: teamData, error: fetchErr } = await sb.from('teams').select('*').eq('invite_code', inviteCode).single();
          if (!fetchErr && teamData) {
            const members = teamData.members || [];
            if (!members.some(m => m.email === user.email)) {
              members.push({ email: user.email, role: 'member' });
            }
            const user_emails = members.map(m => m.email);
            const { error: updateErr } = await sb.from('teams').update({ members, user_emails }).eq('invite_code', inviteCode);
            if (!updateErr) return teamData;
          }
        }
      }
    } catch (err) {
      console.error('[API joinTeam] failed:', err);
    }
    return null;
  },

  async getTeamMembers(teamId) {
    try {
      const sb = await this.getSupabaseClient();
      if (sb) {
        const { data, error } = await sb.from('teams').select('members').eq('team_id', teamId).single();
        if (!error && data) {
          return data.members || [];
        }
      }
    } catch (err) {
      console.error('[API getTeamMembers] failed:', err);
    }
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