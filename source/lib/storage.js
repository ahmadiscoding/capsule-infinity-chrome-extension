// ============================================
// Capsule Infinity - Storage Layer (Supabase + Local Fallback)
// ============================================

const CapsuleStorage = {
  supabase: null,

  // Helper to initialize and return the Supabase Client singleton
  async initSupabase() {
    if (typeof window !== 'undefined' && window.SupabaseClient) {
      this.supabase = await window.SupabaseClient.ensureInitialized();
      return this.supabase;
    }
    if (typeof self !== 'undefined' && self.SupabaseClient) {
      this.supabase = await self.SupabaseClient.ensureInitialized();
      return this.supabase;
    }
    return null;
  },

  // Helper for Supabase REST API calls (legacy fallback)
  async supabaseFetch(method, path, body = null, preferHeader = null) {
    const res = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
    const defaultUrl = 'https://saqruqtjjinuslcxryuc.supabase.co';
    const defaultKey = 'sb_publishable_mp0xexkqtCWhPHRuE0FimQ_yjstjdTC';
    
    const url = res.supabaseUrl || defaultUrl;
    const key = res.supabaseKey || defaultKey;
    if (!url || !key) return null;

    const headers = {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    };
    if (preferHeader) {
      headers['Prefer'] = preferHeader;
    }

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${url}/rest/v1${path}`, options);
    if (!response.ok) {
      throw new Error(`Supabase error: ${response.statusText} (${response.status})`);
    }
    if (method === 'DELETE' || response.status === 204) return true;
    return response.json();
  },



  async getCloudTeams(email) {
    const sb = await this.initSupabase();
    if (!sb) return [];

    try {
      // Use the shared client's getUser method
      const client = (typeof window !== 'undefined' && window.SupabaseClient) ? window.SupabaseClient : ((typeof self !== 'undefined' && self.SupabaseClient) ? self.SupabaseClient : null);
      const user = client ? await client.getUser() : null;
      if (!user) return [];

      // Query teams where user is a member
      const { data, error } = await sb
        .from('teams')
        .select('*')
        .contains('user_emails', [email]);

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('[Storage] Supabase getCloudTeams failed:', e);
      return [];
    }
  },

  async getAllCapsules() {
    const sb = await this.initSupabase();
    if (sb) {
      try {
        let userId = null;
        try {
          const { data: { session } } = await sb.auth.getSession();
          if (session?.user?.id) userId = session.user.id;
        } catch {}

        if (!userId) {
          const localUser = await chrome.storage.local.get(['user']);
          userId = localUser?.user?.id;
        }

        if (userId) {
          const { data, error } = await sb
            .from('capsules')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

          if (error) throw error;

          if (data) {
            return data.map(row => {
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
          }
        }
      } catch (e) {
        console.error('[Storage] Supabase fetch capsules failed, falling back to local:', e);
      }
    }

    // Local fallback
    return new Promise(r => chrome.storage.local.get('capsules', (res) => r(res.capsules || [])));
  },

  async getCapsule(id) {
    const sb = await this.initSupabase();
    if (sb) {
      try {
        const { data, error } = await sb.from('capsules').select('*').eq('id', id);
        if (error) throw error;
        if (data && data.length > 0) {
          const row = data[0];
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
        }
      } catch (e) {
        console.error('[Storage] Supabase getCapsule failed:', e);
      }
    }
    const all = await this.getAllCapsules();
    return all.find(c => c.id === id) || null;
  },

  async saveCapsule(capsule) {
    if (!chrome?.runtime?.id || !chrome?.storage?.local) {
      throw new Error("Extension reloaded. Please refresh the page to save.");
    }

    const uuid = (capsule.id && capsule.id.length === 36 && !capsule.id.includes('cap_'))
      ? capsule.id
      : ((typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));

    capsule.id = uuid;
    capsule.metadata = capsule.metadata || {};
    capsule.metadata.createdAt = capsule.metadata.createdAt || Date.now();
    capsule.metadata.updatedAt = Date.now();
    capsule.metadata.version = capsule.metadata.version || 1;

    const sb = await this.initSupabase();
    if (sb) {
      try {
        let userId = null;
        try {
          // Use the shared SupabaseClient's getUser method
          const client = (typeof window !== 'undefined' && window.SupabaseClient) ? window.SupabaseClient : ((typeof self !== 'undefined' && self.SupabaseClient) ? self.SupabaseClient : null);
          const user = client ? await client.getUser() : null;
          if (user?.id) userId = user.id;
        } catch (authErr) {
          console.warn('[Storage] Supabase getUser failed, trying fallback:', authErr);
        }

        if (!userId) {
          const localUser = await chrome.storage.local.get(['user']);
          if (localUser?.user?.id) {
            userId = localUser.user.id;
          }
        }

        if (!userId) {
          throw new Error("Authentication Error: You must be signed in to save capsules.");
        }

        const dbObj = {
          id: uuid,
          user_id: userId,
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
            versionHistory: capsule.metadata.versionHistory || []
          })
        };

        const { data, error: insertError } = await sb
          .from('capsules')
          .upsert(dbObj)
          .select();
        if (insertError) {
          console.error("Supabase Save Error:", insertError);
          throw new Error("Database Save Failed: " + insertError.message);
        }

        if (data && data[0]) {
          capsule.id = data[0].id;
          if (data[0].created_at) {
            capsule.metadata.createdAt = new Date(data[0].created_at).getTime();
          }
        }
      } catch (e) {
        console.error('[Storage] Supabase save capsule failed:', e);
        throw e;
      }
    }

    // Always fallback/save locally immediately so Extension UI updates instantly
    return new Promise(r => {
      chrome.storage.local.get('capsules', (res) => {
        let capsules = res.capsules || [];
        const idx = capsules.findIndex(c => c.id === capsule.id);
        if (idx >= 0) {
          const old = { ...capsules[idx] };
          if (!capsule.metadata.versionHistory) capsule.metadata.versionHistory = [];
          capsule.metadata.versionHistory.push({
            content: old.content,
            title: old.title,
            tags: [...(old.tags||[])],
            version: old.metadata?.version||1,
            savedAt: Date.now(),
            note: `v${old.metadata?.version||1}`
          });
          capsule.metadata.version = (capsule.metadata.version || (old.metadata?.version||0)) + 1;
          capsules[idx] = capsule;
        } else {
          capsules.unshift(capsule);
        }
        chrome.storage.local.set({ capsules }, () => r(capsule));
      });
    });
  },

  async deleteCapsule(id) {
    const sb = await this.initSupabase();
    if (sb) {
      try {
        const { error } = await sb.from('capsules').delete().eq('id', id);
        if (error) throw error;
      } catch (e) {
        console.error('[Storage] Supabase delete capsule failed:', e);
      }
    }

    return new Promise(r => {
      chrome.storage.local.get('capsules', (res) => {
        chrome.storage.local.set({ capsules: (res.capsules||[]).filter(c => c.id !== id) }, () => r(true));
      });
    });
  },

  async searchCapsules(query) {
    const all = await this.getAllCapsules();
    const q = query.toLowerCase();
    return all.filter(c =>
      c.title?.toLowerCase().includes(q) ||
      c.content?.toLowerCase().includes(q) ||
      (c.tags||[]).some(t => t.toLowerCase().includes(q))
    );
  },

  async getFolders() {
    return new Promise(r => chrome.storage.local.get('folders', (res) => r(res.folders || [])));
  },

  async createFolder(name, color = '#6366f1') {
    const folder = { id: 'folder_' + Date.now().toString(36), name, color, createdAt: Date.now() };
    const folders = await this.getFolders();
    folders.push(folder);
    await new Promise(r => chrome.storage.local.set({ folders }, r));
    return folder;
  },

  async deleteFolder(id) {
    let folders = (await this.getFolders()).filter(f => f.id !== id);
    await new Promise(r => chrome.storage.local.set({ folders }, r));
    const capsules = await this.getAllCapsules();
    const updated = capsules.map(c => c.folderId === id ? { ...c, folderId: 'default' } : c);
    await new Promise(r => chrome.storage.local.set({ capsules: updated }, r));
    return true;
  },

  async exportCapsules() {
    const capsules = await this.getAllCapsules();
    return JSON.stringify(capsules, null, 2);
  },

  async importCapsules(json) {
    try {
      const imported = JSON.parse(json);
      const arr = Array.isArray(imported) ? imported : [imported];
      const newCaps = arr.map(c => ({
        ...c,
        id: c.id || ('cap_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2,9)),
        metadata: {
          ...c.metadata,
          createdAt: c.createdAt || Date.now(),
          updatedAt: Date.now(),
          imported: true
        }
      }));

      for (const cap of newCaps) {
        await this.saveCapsule(cap);
      }

      return newCaps.length;
    } catch(e) {
      throw new Error('Invalid import: ' + e.message);
    }
  },

  async getSettings() {
    return new Promise(r => chrome.storage.local.get('settings', (res) => r(res.settings || { theme:'dark', showFloatingButton:true, dragDropEnabled:true, autoSync:true, syncInterval:300000 })));
  },

  async saveSettings(s) {
    return new Promise(r => chrome.storage.local.set({ settings: s }, r));
  },

  async getStats() {
    const capsules = await this.getAllCapsules();
    const platforms = {};
    const tagCloud = {};
    capsules.forEach(c => {
      platforms[c.platform||'unknown'] = (platforms[c.platform||'unknown']||0)+1;
      (c.tags||[]).forEach(t => {
        tagCloud[t] = (tagCloud[t]||0)+1;
      });
    });
    return {
      totalCapsules: capsules.length,
      totalWords: capsules.reduce((s,c)=>s+(c.metadata?.wordCount||c.wordCount||(c.content ? c.content.split(/\s+/).length : 0)),0),
      platforms,
      tagCloud
    };
  },

  // Collaborations helper
  async getCollaborations() {
    const res = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
    if (res.supabaseUrl && res.supabaseKey) {
      try {
        const collabs = await this.supabaseFetch('GET', '/collaborations');
        return collabs || [];
      } catch (e) {
        console.error('[Storage] Supabase fetch collaborations failed:', e);
      }
    }
    return new Promise(r => chrome.storage.local.get('collaborations', (res) => r(res.collaborations || [])));
  },

  async saveCollaboration(collab) {
    const res = await chrome.storage.local.get(['supabaseUrl', 'supabaseKey']);
    collab.id = collab.id || 'collab_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
    if (res.supabaseUrl && res.supabaseKey) {
      try {
        await this.supabaseFetch('POST', '/collaborations', collab, 'resolution=merge-duplicates');
      } catch (e) {
        console.error('[Storage] Supabase save collaboration failed:', e);
      }
    }

    return new Promise(r => {
      chrome.storage.local.get('collaborations', (res) => {
        let list = res.collaborations || [];
        const idx = list.findIndex(c => c.id === collab.id);
        if (idx >= 0) list[idx] = collab;
        else list.push(collab);
        chrome.storage.local.set({ collaborations: list }, () => r(collab));
      });
    });
  }
};

if (typeof window !== 'undefined') window.CapsuleStorage = CapsuleStorage;