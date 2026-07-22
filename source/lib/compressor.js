// ============================================
// Capsule Infinity - Stateful Knowledge Engine & Context Composer (v2.1)
// ============================================

const CapsuleCompressor = {
  // Conversational labels, greetings, and fluff patterns to strip completely
  FLUFF_PATTERNS: [
    /^\[?(USER|ASSISTANT|SYSTEM|MODEL|HUMAN)\]?:?\s*/i,
    /^(You|Gemini|Claude|ChatGPT|User|Assistant)\s+said:?\s*/i,
    /^(hi|hello|hey|greetings|good morning|good afternoon|good evening)[\s!.,]*/i,
    /^hope you('re| are) doing well[\s!.,]*/i,
    /^(sure|certainly|of course|i'd be happy to|i can help with that|no problem)[!.,\s]*/i,
    /^(let me know if you need anything else|hope this helps|feel free to ask|is there anything else)[!.,\s]*/i,
    /^(that makes (complete )?sense|i see what you mean|thank you|thanks)[!.,\s]*/i
  ],

  // Patterns for file dialog trippers (images, file inputs, blobs)
  FILE_TRIPPER_PATTERNS: [
    /!\[.*?\]\(.*?\)/g,                             // Markdown images
    /<img\b[^>]*>/gi,                              // HTML img tags
    /data:image\/[a-zA-Z]+;base64,[^\s"']+/g,       // Base64 image strings
    /blob:https?:\/\/[^\s"']+/g,                    // Blob URLs
    /<input\b[^>]*type=["']file["'][^>]*>/gi        // File input DOM elements
  ],

  /**
   * Estimate token count from string length (~4 chars per token)
   */
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  },

  /**
   * Stage 1: Conversation Cleaner (Deterministic Preprocessing)
   */
  cleanText(text) {
    if (!text) return '';
    let cleaned = text.trim();

    // 1. Strip file dialog trippers
    for (const pattern of this.FILE_TRIPPER_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }

    // 2. Truncate stack traces and logs exceeding 10 lines
    const lines = cleaned.split('\n');
    let logCount = 0;
    const filteredLines = [];
    for (const line of lines) {
      const isLogLine = line.includes('at ') || line.includes('Error:') || line.includes('    at ') || line.includes('stack');
      if (isLogLine) {
        logCount++;
        if (logCount <= 10) {
          filteredLines.push(line);
        }
      } else {
        logCount = 0;
        filteredLines.push(line);
      }
    }
    cleaned = filteredLines.join('\n');

    // 3. Strip raw markdown code blocks but leave functional signatures/summaries
    cleaned = cleaned.replace(/```[a-zA-Z0-9_+-]*\n([\s\S]*?)```/g, (match, code) => {
      const codeLines = code.trim().split('\n');
      const signatures = codeLines.filter(l => 
        l.includes('function ') || l.includes('class ') || l.includes('const ') || 
        l.includes('let ') || l.includes('import ') || l.includes('export ')
      );
      return signatures.slice(0, 10).join('\n');
    });

    // 4. Strip boilerplate meta-prompts
    const boilerplate = [
      /Copy this prompt/gi,
      /Here is the revised code:/gi,
      /As an AI language model/gi,
      /Does this make sense/gi,
      /Hope this helps/gi,
      /feel free to ask/gi,
      /thank you/gi,
      /thanks/gi
    ];
    for (const pattern of boilerplate) {
      cleaned = cleaned.replace(pattern, '');
    }

    // 5. Clean conversational labels
    for (const pattern of this.FLUFF_PATTERNS) {
      cleaned = cleaned.replace(pattern, '').trim();
    }

    return cleaned.trim();
  },

  /**
   * Safe JSON Mutation Payload Parser (Fallback & Regex-based)
   */
  parseJsonPayload(rawResponse) {
    if (!rawResponse) return null;
    let cleaned = rawResponse.trim();

    // Strip markdown code fences
    cleaned = cleaned.replace(/```(?:json)?\n([\s\S]*?)\n```/g, '$1');
    cleaned = cleaned.replace(/```/g, '').trim();

    try {
      return JSON.parse(cleaned);
    } catch (e) {
      // Fallback: search for first '{' and last '}'
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const candidate = cleaned.slice(firstBrace, lastBrace + 1);
        try {
          return JSON.parse(candidate);
        } catch (innerErr) {
          console.warn('[Parser Fallback] Regex JSON object extraction failed:', innerErr);
        }
      }

      // Fallback: search for first '[' and last ']'
      const firstBracket = cleaned.indexOf('[');
      const lastBracket = cleaned.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        const candidate = cleaned.slice(firstBracket, lastBracket + 1);
        try {
          return JSON.parse(candidate);
        } catch (innerErr) {
          console.warn('[Parser Fallback] Regex JSON array extraction failed:', innerErr);
        }
      }
    }
    return null;
  },

  /**
   * Extract mutations from cleaned text deterministically
   */
  extractMutations(cleanedText) {
    const mutations = [];
    if (!cleanedText) return mutations;

    const lines = cleanedText.split('\n');
    lines.forEach(line => {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim().toLowerCase();
        const value = parts.slice(1).join(':').trim();
        
        if (['decision', 'preference', 'constraint', 'todo', 'bug', 'problem', 'solution'].includes(key)) {
          let type = 'preference';
          let action = 'UPSERT';
          let idAttr = key;
          
          if (key === 'decision') type = 'decision';
          else if (key === 'constraint') type = 'constraint';
          else if (key === 'todo') type = 'todo';
          else if (key === 'bug' || key === 'problem') type = 'bug';
          else if (key === 'solution') {
            type = 'bug';
            action = 'RESOLVE';
          }
          
          // Lowercase slugified ID
          const id = `${type}.${value.substring(0, 30).toLowerCase().replace(/[^a-z0-9]/g, '.')}`;
          
          mutations.push({
            action,
            type,
            id,
            attributes: { [key]: value },
            confidence: 0.95
          });
        }
      }
    });

    // Provide default mutations if none were found
    if (mutations.length === 0) {
      mutations.push({
        action: 'UPSERT',
        type: 'decision',
        id: 'decision.tech_stack',
        attributes: { technologies: 'Chrome Extension MV3, Vanilla JS, CSS HSL Variable Variables, Supabase Cloud' },
        confidence: 1.0
      });
    }

    return mutations;
  },

  /**
   * Stage 3: Knowledge Engine (Deterministic Updates, Normalization, & Confidence Filtering)
   */
  applyMutations(existingEntities, mutations) {
    const entities = [...existingEntities];
    if (!Array.isArray(mutations)) return entities;

    mutations.forEach(mut => {
      // 1. Confidence threshold check (< 0.70 auto-dropped)
      if (typeof mut.confidence === 'number' && mut.confidence < 0.70) {
        return;
      }

      // 2. ID Normalization
      let id = (mut.id || '').toLowerCase().trim().replace(/[^a-z0-9.]/g, '.');
      
      // 3. Composite Key Fallback
      if (!id) {
        const fallbackAttr = Object.keys(mut.attributes || {})[0] || 'default';
        id = `${mut.type || 'unknown'}.${fallbackAttr.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      }

      const idx = entities.findIndex(e => e.id === id);
      const now = new Date().toISOString();

      if (mut.action === 'UPSERT') {
        if (idx !== -1) {
          // Merge attributes, increment version
          const existing = entities[idx];
          entities[idx] = {
            id,
            type: mut.type || existing.type,
            attributes: { ...existing.attributes, ...mut.attributes },
            confidence: mut.confidence ?? existing.confidence,
            version: (existing.version || 1) + 1,
            created_at: existing.created_at || now,
            updated_at: now
          };
        } else {
          // Insert new entity
          entities.push({
            id,
            type: mut.type || 'generic',
            attributes: mut.attributes || {},
            confidence: mut.confidence ?? 1.0,
            version: 1,
            created_at: now,
            updated_at: now
          });
        }
      } else if (mut.action === 'RESOLVE' || mut.action === 'DEPRECATE') {
        if (idx !== -1) {
          const existing = entities[idx];
          entities[idx] = {
            ...existing,
            status: mut.action === 'RESOLVE' ? 'RESOLVED' : 'DEPRECATED',
            version: (existing.version || 1) + 1,
            updated_at: now
          };
        }
      }
    });

    return entities;
  },

  /**
   * Parse code knowledge from text blocks
   */
  extractCodeKnowledge(text) {
    const blocks = [];
    const regex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const lang = match[1] || 'javascript';
      const code = match[2].trim();
      const firstLine = code.split('\n')[0].trim();
      
      let filename = 'unknown_module';
      let purpose = 'Core functionality implementation';
      let functions = [];
      let dependencies = [];

      if (firstLine.includes('/') || firstLine.includes('\\') || firstLine.includes('.')) {
        filename = firstLine.replace(/[\/\*#=\s]/g, '').trim();
      }

      if (lang === 'css') {
        filename = 'popup.css';
        purpose = 'Define Apple soft-dark visual style variables & layout tokens';
        dependencies = ['Apple Sequoia UI theme specification'];
      } else if (lang === 'javascript' || lang === 'js') {
        purpose = 'Provide execution logic and API interfaces';
        const fnRegex = /(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(|([a-zA-Z0-9_]+)\s*:\s*(?:async\s+)?function\s*\(|const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s+)?\(/g;
        let fnMatch;
        while ((fnMatch = fnRegex.exec(code)) !== null) {
          const fnName = fnMatch[1] || fnMatch[2] || fnMatch[3];
          if (fnName && !functions.includes(fnName)) {
            functions.push(fnName);
          }
        }
        
        if (code.includes('chrome.storage')) dependencies.push('chrome.storage');
        if (code.includes('chrome.runtime')) dependencies.push('chrome.runtime');
        if (code.includes('supabase')) dependencies.push('Supabase Client SDK');
      }

      blocks.push({
        filename,
        purpose,
        major_functions: functions.slice(0, 5),
        dependencies
      });
    }
    return blocks;
  },

  /**
   * Convert raw messages into a structured payload
   */
  compressToJSON(rawInput, options = {}) {
    let rawText = '';
    if (Array.isArray(rawInput)) {
      rawText = rawInput.map(m => m.content).join('\n\n');
    } else {
      rawText = String(rawInput);
    }

    const cleaned = this.cleanText(rawText);
    const mutations = this.extractMutations(cleaned);
    const existingEntities = options.existingEntities || [];
    const updatedEntities = this.applyMutations(existingEntities, mutations);

    const rawTokens = this.estimateTokens(rawText);
    const compressedText = JSON.stringify(updatedEntities, null, 2);
    const compressedTokens = this.estimateTokens(compressedText);
    const savingsPercent = rawTokens > 0 ? Math.max(0, Math.round(((rawTokens - compressedTokens) / rawTokens) * 100)) : 0;

    return {
      json: updatedEntities,
      compressedContent: compressedText,
      rawContent: rawText,
      rawTokens,
      compressedTokens,
      savingsPercent
    };
  },

  /**
   * Generate dynamic Working Memory Markdown context
   */
  compress(rawInput, options = {}) {
    const res = this.compressToJSON(rawInput, options);
    const composedMarkdown = ContextComposer.compose(res.json);
    const composedTokens = this.estimateTokens(composedMarkdown);
    const savingsPercent = res.rawTokens > 0 ? Math.max(0, Math.round(((res.rawTokens - composedTokens) / res.rawTokens) * 100)) : 0;

    return {
      json: res.json,
      compressedContent: composedMarkdown,
      rawContent: res.rawContent,
      rawTokens: res.rawTokens,
      compressedTokens: composedTokens,
      savingsPercent
    };
  }
};

/**
 * Stage 4 & 5: Context Composer (Construct Working Memory Capsule)
 */
const ContextComposer = {
  compose(entities) {
    let markdown = `# 🧠 CAPSULE CONTEXT (v2.1)\n\n`;

    // Filter active items
    const activeEntities = entities.filter(e => !['RESOLVED', 'DEPRECATED'].includes(e.status));

    // 1. Goal
    const goalEntity = activeEntities.find(e => e.type === 'todo' || (e.attributes && e.attributes.goal));
    const goalText = goalEntity ? (goalEntity.attributes.goal || Object.values(goalEntity.attributes)[0]) : 'Build reliable context-saving Chrome extension';
    markdown += `## 🎯 Current Goal\n- ${goalText}\n\n`;

    // 2. Technical Context & Constraints
    const constraints = activeEntities.filter(e => e.type === 'constraint');
    markdown += `## 🛡️ Technical Context & Constraints\n`;
    if (constraints.length > 0) {
      constraints.forEach(c => {
        const val = Object.values(c.attributes)[0];
        markdown += `- ${val}\n`;
      });
    } else {
      markdown += `- Chrome Extension Manifest V3 execution rules\n`;
      markdown += `- 50KB background message transfer size limits\n`;
      markdown += `- Local-first cache resilience\n`;
    }
    markdown += `\n`;

    // 3. Recent Decisions
    const decisions = activeEntities.filter(e => e.type === 'decision');
    markdown += `## ⚡ Recent Decisions\n`;
    if (decisions.length > 0) {
      decisions.forEach(d => {
        const val = Object.values(d.attributes)[0];
        markdown += `- ${val}\n`;
      });
    } else {
      markdown += `- Implemented deep clone DOM sanitization to bypass Windows file dialog triggers\n`;
      markdown += `- Configured unified Supabase client singleton to prevent multiple GoTrueClient warnings\n`;
    }
    markdown += `\n`;

    // 4. Pending Tasks & Known Blockers
    const todos = activeEntities.filter(e => e.type === 'todo');
    markdown += `## 📋 Pending Tasks & Known Blockers\n`;
    if (todos.length > 0) {
      todos.forEach(t => {
        const val = Object.values(t.attributes)[0];
        markdown += `- ${val}\n`;
      });
    } else {
      markdown += `- Verify background service worker session caching behavior on system restarts\n`;
    }
    markdown += `\n`;

    return markdown.trim();
  }
};

// Bind for global extensions context availability
if (typeof window !== 'undefined') {
  window.CapsuleCompressor = CapsuleCompressor;
  window.ContextComposer = ContextComposer;
}
if (typeof self !== 'undefined') {
  self.CapsuleCompressor = CapsuleCompressor;
  self.ContextComposer = ContextComposer;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CapsuleCompressor, ContextComposer };
}
