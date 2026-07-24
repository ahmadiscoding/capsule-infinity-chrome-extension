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

  stripSpeakerPrefix(text) {
    if (!text) return '';
    let cleaned = text;
    let prev = '';
    while (cleaned !== prev) {
      prev = cleaned;
      cleaned = cleaned.replace(/\b(User|Assistant|System|Result:\s*User|Result:\s*Assistant):\s*/i, '').trim();
      cleaned = cleaned.replace(/^(also|then|however|therefore|so|and)[\s,]+/i, '').trim();
    }
    return cleaned;
  },

  stripPleasantries(text) {
    if (!text) return '';
    return text.replace(/^(great choice|that makes complete sense|that makes sense|makes sense|i see|got it|sounds good|awesome|cool|perfect|to be honest|honestly|basically|actually|sure thing|no problem|ok|okay)[\s!.,]*/i, '').trim();
  },

  hasTechnicalOrDecisionKeywords(text) {
    const lower = text.toLowerCase();
    const technicalKeywords = [
      'use', 'adopt', 'implement', 'deploy', 'configure', 'setup', 'run', 'integrate',
      'build', 'write', 'replace', 'refactor', 'migrate', 'host', 'store', 'enable',
      'disable', 'allow', 'restrict', 'bind', 'call', 'fetch', 'query', 'save',
      'persist', 'cache', 'decide', 'decision', 'choose', 'chose', 'select', 'prefer',
      'switch', 'schema', 'table', 'database', 'rls', 'token', 'jwt', 'auth'
    ];
    return technicalKeywords.some(kw => {
      const regex = new RegExp(`\\b${kw}\\w*\\b`, 'i');
      return regex.test(lower);
    });
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

    // 4. Strip boilerplate meta-prompts (ensure thank you/thanks matches sentence boundaries only)
    const boilerplate = [
      /\bcopy this prompt\b/gi,
      /\bhere is the revised code:\b/gi,
      /\bas an ai language model\b/gi,
      /\bdoes this make sense\b/gi,
      /\bhope this helps\b/gi,
      /\bfeel free to ask\b/gi,
      /(?:^|[\.\?\!\n])\s*thank\s+you\b[^.!?\n]*(?:[\.\?\!\n]|$)/gi,
      /(?:^|[\.\?\!\n])\s*thanks\b[^.!?\n]*(?:[\.\?\!\n]|$)/gi
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
   * Recursively clean up empty values ([], "", {}, null, undefined) from JSON
   */
  cleanEmptyFields(obj) {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) {
      const cleanedArr = obj.map(item => this.cleanEmptyFields(item)).filter(item => {
        if (item === null || item === undefined || item === '') return false;
        if (Array.isArray(item) && item.length === 0) return false;
        if (typeof item === 'object' && Object.keys(item).length === 0) return false;
        return true;
      });
      return cleanedArr.length > 0 ? cleanedArr : null;
    }
    if (typeof obj === 'object') {
      const cleanedObj = {};
      Object.keys(obj).forEach(key => {
        const cleanedVal = this.cleanEmptyFields(obj[key]);
        if (cleanedVal !== null && cleanedVal !== undefined && cleanedVal !== '') {
          if (Array.isArray(cleanedVal) && cleanedVal.length === 0) return;
          if (typeof cleanedVal === 'object' && Object.keys(cleanedVal).length === 0) return;
          cleanedObj[key] = cleanedVal;
        }
      });
      return Object.keys(cleanedObj).length > 0 ? cleanedObj : null;
    }
    return obj;
  },

  /**
   * Safe JSON Mutation Payload Parser (Fallback & Regex-based)
   */
  parseJsonPayload(rawResponse) {
    if (!rawResponse) return {};
    let cleaned = rawResponse.trim();
    let parsed = null;

    // Strip markdown code fences
    cleaned = cleaned.replace(/```(?:json)?\n([\s\S]*?)\n```/g, '$1');
    cleaned = cleaned.replace(/```/g, '').trim();

    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      // Fallback: search for first '{' and last '}'
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const candidate = cleaned.slice(firstBrace, lastBrace + 1);
        try {
          parsed = JSON.parse(candidate);
        } catch (innerErr) {
          console.warn('[Parser Fallback] Regex JSON object extraction failed:', innerErr);
        }
      }

      // Fallback: search for first '[' and last ']'
      if (!parsed) {
        const firstBracket = cleaned.indexOf('[');
        const lastBracket = cleaned.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
          const candidate = cleaned.slice(firstBracket, lastBracket + 1);
          try {
            parsed = JSON.parse(candidate);
          } catch (innerErr) {
            console.warn('[Parser Fallback] Regex JSON array extraction failed:', innerErr);
          }
        }
      }
    }

    // Default fallback to safe state
    if (!parsed) {
      return {};
    }

    // Run clean-up pass to remove empty fields recursively
    const cleanedResult = this.cleanEmptyFields(parsed);
    return cleanedResult || (Array.isArray(parsed) ? [] : {});
  },

  /**
   * Cleans and deduces user intent from first user message
   */
  deduceIntent(firstMsg) {
    if (!firstMsg) return 'maintain conversation context';
    const lines = firstMsg.split('\n').map(l => l.trim()).filter(Boolean);
    
    const fluffRegex = /^(great choice|that makes complete sense|that makes sense|makes sense|i see|got it|sounds good|awesome|cool|perfect|to be honest|honestly|basically|actually|sure thing|no problem|ok|okay)[\s!.,]*/i;
    const opinionFluff = /\b(is simpler|are simpler|simpler than|easier to|better option)\b/i;

    for (const line of lines) {
      let cleaned = this.stripSpeakerPrefix(line);
      cleaned = this.stripPleasantries(cleaned);
      if (cleaned && !fluffRegex.test(cleaned.toLowerCase()) && !opinionFluff.test(cleaned.toLowerCase())) {
        return cleaned.substring(0, 100);
      }
    }
    
    return 'maintain conversation context';
  },

  /**
   * Before extracting knowledge, ask: "If this sentence disappeared forever, would the project lose important knowledge?"
   */
  isImportantKnowledge(line) {
    const lower = line.toLowerCase();
    
    // Discard short conversational expressions
    if (lower.match(/^(ok|okay|yes|no|sure|certainly|thanks|thank you|hello|hi|hey|salam|greetings)/i)) {
      if (lower.length < 30) return false;
    }
    
    const techIndicators = [
      'manifest', 'v3', 'chrome', 'extension', 'supabase', 'database', 'table', 'rls',
      'uuid', 'chunk', 'token', 'compress', 'scroll', 'dom', 'picker', 'file',
      'oauth', 'api', 'http', 'https', 'fetch', 'auth', 'cookie', 'session',
      'javascript', 'css', 'html', 'git', 'revert', 'commit', 'push', 'json',
      'error', 'bug', 'fail', 'fix', 'solve', 'resolved', 'implement', 'decide',
      'must', 'constraint', 'limit', 'require', 'todo', 'pending', 'blocker',
      'function', 'class', 'import', 'export', 'node', 'npm', 'react', 'next',
      'architecture', 'tradeoff', 'should', 'prefer', 'workflow', 'design', 'strategy',
      'choice', 'approach', 'compare', 'difference', 'pros', 'cons'
    ];
    
    const containsTech = techIndicators.some(tech => lower.includes(tech));
    const containsFile = /\b[\w-]+\.(?:js|css|json|html|md|py|go|ts|sh|yml|yaml|txt)\b/i.test(lower) || /[\w-]+\/[\w.-]+/i.test(lower) || /[\w-]+\\[\w.-]+/i.test(lower);
    
    return containsTech || containsFile;
  },

  validateInput(text) {
    if (!text || typeof text !== 'string') return;
    
    // Check density of raw HTML tags/attributes
    const htmlMatches = text.match(/(<div|class="|<\/button>|<\/div>|<span|id="ci-)/gi) || [];
    if (htmlMatches.length > 0) {
      const density = (htmlMatches.length * 15) / text.length;
      if (density > 0.005) {
        throw new Error('Input validation failed: Injected extension UI markup detected.');
      }
    }
  },

  calculateJaccardSimilarity(str1, str2) {
    const words1 = new Set(str1.toLowerCase().match(/\b\w+\b/g) || []);
    const words2 = new Set(str2.toLowerCase().match(/\b\w+\b/g) || []);
    if (words1.size === 0 || words2.size === 0) return 0;
    
    let intersection = 0;
    words1.forEach(w => {
      if (words2.has(w)) intersection++;
    });
    
    const union = words1.size + words2.size - intersection;
    return intersection / union;
  },

  /**
   * Extract mutations from cleaned text deterministically
   */
  extractMutations(cleanedText, firstUserMsg = '') {
    const mutations = [];
    if (!cleanedText) return mutations;

    const goalFallback = this.deduceIntent(firstUserMsg || cleanedText);
    const lines = cleanedText.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 10 && this.isImportantKnowledge(l));
    const addedSentences = new Set();

    // Enforce Goal
    mutations.push({
      action: 'UPSERT',
      type: 'todo',
      id: 'todo.conversation.goal',
      attributes: { goal: goalFallback },
      confidence: 0.95
    });

    lines.forEach(line => {
      let cleanedLine = line.replace(/^[-*•\d.]+\s*/, '').trim();
      cleanedLine = this.stripSpeakerPrefix(cleanedLine);
      cleanedLine = this.stripPleasantries(cleanedLine);
      cleanedLine = this.stripSpeakerPrefix(cleanedLine);
      if (!cleanedLine) return;

      const lower = cleanedLine.toLowerCase();
      
      if (cleanedLine.includes('function ') || cleanedLine.includes('class ') || cleanedLine.includes('const ') || cleanedLine.includes('import ')) {
        return;
      }

      // Filter out conversational pleasantries, transitional commentary, and opinion fluff
      const fluffRegex = /^(great choice|that makes complete sense|that makes sense|makes sense|i see|got it|sounds good|awesome|cool|perfect|to be honest|honestly|basically|actually|sure thing|no problem)/i;
      if (fluffRegex.test(lower) && lower.length < 60) {
        return;
      }
      if (lower.includes('is simpler') && lower.length < 40) {
        return;
      }

      const parts = cleanedLine.split(':');
      if (parts.length >= 2 && ['decision', 'preference', 'constraint', 'todo', 'bug', 'problem', 'solution', 'recommendation', 'suggestion'].includes(parts[0].trim().toLowerCase())) {
        const key = parts[0].trim().toLowerCase();
        const value = this.stripSpeakerPrefix(parts.slice(1).join(':').trim());
        if (!value) return;
        
        let type = 'preference';
        let action = 'UPSERT';
        if (key === 'decision') type = 'decision';
        else if (key === 'constraint') type = 'constraint';
        else if (key === 'todo') type = 'todo';
        else if (key === 'bug' || key === 'problem') type = 'bug';
        else if (key === 'recommendation' || key === 'suggestion') type = 'recommendation';
        else if (key === 'solution') {
          type = 'bug';
          action = 'RESOLVE';
        }

        // Require decisions and facts (preference) to contain technical verbs/keywords
        if ((type === 'decision' || type === 'preference') && !this.hasTechnicalOrDecisionKeywords(value)) {
          return;
        }
        
        const id = `${type}.${value.substring(0, 30).toLowerCase().replace(/[^a-z0-9]/g, '.')}`;
        mutations.push({
          action,
          type,
          id,
          attributes: { [key]: value },
          confidence: 0.95
        });
        return;
      }

      const categories = [
        { type: 'todo', attrKey: 'task', keywords: [
          { word: 'todo', weight: 3 },
          { word: 'pending', weight: 2 },
          { word: 'next step', weight: 2 },
          { word: 'task', weight: 1 },
          { word: 'need to', weight: 2 }
        ]},
        { type: 'bug', attrKey: 'blocker', keywords: [
          { word: 'bug', weight: 3 },
          { word: 'error', weight: 2 },
          { word: 'fail', weight: 2 },
          { word: 'issue', weight: 1 },
          { word: 'blocker', weight: 3 }
        ]},
        { type: 'decision', attrKey: 'decision', keywords: [
          { word: 'decide', weight: 3 },
          { word: 'decision', weight: 3 },
          { word: 'choose', weight: 2 },
          { word: 'chose', weight: 2 },
          { word: 'implement', weight: 2 },
          { word: 'prefer', weight: 2 },
          { word: 'switch', weight: 2 },
          { word: 'adopt', weight: 2 },
          { word: 'select', weight: 2 }
        ]},
        { type: 'recommendation', attrKey: 'recommendation', keywords: [
          { word: 'recommend', weight: 3 },
          { word: 'suggest', weight: 3 },
          { word: 'option', weight: 2 },
          { word: 'advisory', weight: 3 },
          { word: 'advise', weight: 3 }
        ]},
        { type: 'constraint', attrKey: 'constraint', keywords: [
          { word: 'must', weight: 2 },
          { word: 'restrict', weight: 2 },
          { word: 'limit', weight: 2 },
          { word: 'constraint', weight: 3 },
          { word: 'rule', weight: 2 },
          { word: 'require', weight: 2 }
        ]}
      ];

      let bestCategory = null;
      let maxScore = 0;

      categories.forEach(cat => {
        let score = 0;
        cat.keywords.forEach(kwObj => {
          const kw = kwObj.word;
          const regexStr = `\\b${kw.replace(' ', '\\s+')}\\w*\\b`;
          const regex = new RegExp(regexStr, 'gi');
          const matches = lower.match(regex) || [];
          score += matches.length * kwObj.weight;

          if (lower.trim().startsWith(kw)) {
            score += kwObj.weight * 2;
          }
        });
        if (score > maxScore) {
          maxScore = score;
          bestCategory = cat;
        }
      });

      let type = 'preference';
      let attrKey = 'detail';
      if (bestCategory && maxScore > 0) {
        type = bestCategory.type;
        attrKey = bestCategory.attrKey;
      }

      const cleanVal = this.stripSpeakerPrefix(cleanedLine.replace(/^[-*•\d.]+\s*/, '').trim());
      if (!cleanVal) return;

      // Require decisions and facts (preference) to contain technical verbs/keywords
      if ((type === 'decision' || type === 'preference') && !this.hasTechnicalOrDecisionKeywords(cleanVal)) {
        return;
      }

      const cleanLower = cleanVal.toLowerCase();
      if (type && !addedSentences.has(cleanLower)) {
        addedSentences.add(cleanLower);
        const id = `${type}.${cleanVal.substring(0, 30).toLowerCase().replace(/[^a-z0-9]/g, '.')}`;
        mutations.push({
          action: 'UPSERT',
          type,
          id,
          attributes: { [attrKey]: cleanVal },
          confidence: 0.85
        });
      }
    });

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

      // 4. Jaccard similarity to prevent duplicate sentences
      const valStr = Object.values(mut.attributes || {})[0] || '';
      if (valStr) {
        const duplicateIdx = entities.findIndex(e => {
          if (e.type !== mut.type) return false;
          const existingVal = Object.values(e.attributes || {})[0] || '';
          return this.calculateJaccardSimilarity(valStr, existingVal) >= 0.80;
        });
        if (duplicateIdx !== -1) {
          const existing = entities[duplicateIdx];
          const existingVal = Object.values(existing.attributes || {})[0] || '';
          if (valStr.length > existingVal.length) {
            existing.attributes = { ...existing.attributes, ...mut.attributes };
          }
          return;
        }
      }

      const idx = entities.findIndex(e => e.id === id);
      const now = new Date().toISOString();

      if (mut.action === 'UPSERT') {
        if (idx !== -1) {
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
    let firstUserMsg = '';
    if (Array.isArray(rawInput)) {
      rawText = rawInput.map(m => m.content).join('\n\n');
      const userMsg = rawInput.find(m => m.role === 'user');
      if (userMsg) firstUserMsg = userMsg.content;
    } else {
      rawText = String(rawInput);
    }

    // Step 0: Input Validation density check
    this.validateInput(rawText);

    const cleaned = this.cleanText(rawText);
    const mutations = this.extractMutations(cleaned, firstUserMsg);
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
    const composedMarkdown = ContextComposer.compose(res.json, { ...options, originalWords: res.rawContent.split(/\s+/).filter(Boolean).length });
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
  joinSentences(list) {
    if (!list || list.length === 0) return '';
    const cleaned = list.map(item => {
      let text = item.trim();
      if (text.endsWith('.')) text = text.slice(0, -1);
      return text;
    });

    const chunks = [];
    const chunkSize = 3;
    for (let i = 0; i < cleaned.length; i += chunkSize) {
      chunks.push(cleaned.slice(i, i + chunkSize));
    }

    const chunkStrings = chunks.map(chunk => {
      if (chunk.length === 1) return chunk[0] + '.';
      if (chunk.length === 2) return `${chunk[0]} and ${chunk[1]}.`;
      return `${chunk.slice(0, -1).join(', ')}, and ${chunk[chunk.length - 1]}.`;
    });

    return chunkStrings.join(' ');
  },

  clusterEntities(entities) {
    const topics = {};
    const stopwords = new Set(['about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves']);
    const classificationStopwords = new Set(['todo', 'task', 'decide', 'decision', 'choose', 'chose', 'implement', 'preference', 'constraint', 'bug', 'issue', 'problem', 'blocker', 'recommendation', 'recommend', 'suggest', 'suggestion', 'option', 'advisory', 'advise', 'must', 'require', 'need', 'pending', 'next', 'step', 'work', 'code', 'file', 'project', 'line', 'user', 'assistant', 'system', 'chat', 'conversation', 'capsule', 'source', 'folder', 'tag', 'save', 'detail', 'should', 'would', 'could', 'want', 'make', 'find', 'take', 'give', 'know', 'look', 'think', 'come', 'show', 'tell', 'use', 'using', 'add', 'adding', 'making', 'get', 'getting', 'set', 'setting', 'update', 'updating', 'fix', 'fixing']);

    // Extract bigrams and clean unigrams
    entities.forEach(e => {
      const val = Object.values(e.attributes || {})[0] || '';
      if (!val) return;
      
      const words = val.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
      const cleanWords = words.filter(w => !stopwords.has(w) && !classificationStopwords.has(w));
      
      e._keywords = cleanWords;
      
      const bigrams = [];
      for (let i = 0; i < words.length - 1; i++) {
        const w1 = words[i];
        const w2 = words[i+1];
        if (!stopwords.has(w1) && !stopwords.has(w2) && !classificationStopwords.has(w1) && !classificationStopwords.has(w2)) {
          bigrams.push(`${w1} ${w2}`);
        }
      }
      e._bigrams = bigrams;
    });

    const bigramFreq = {};
    const unigramFreq = {};
    
    entities.forEach(e => {
      (e._bigrams || []).forEach(b => {
        bigramFreq[b] = (bigramFreq[b] || 0) + 1;
      });
      (e._keywords || []).forEach(u => {
        unigramFreq[u] = (unigramFreq[u] || 0) + 1;
      });
    });

    // Keep bigrams and unigrams that appear at least 2 times
    const sortedBigrams = Object.keys(bigramFreq)
      .filter(b => bigramFreq[b] >= 2)
      .sort((a, b) => bigramFreq[b] - bigramFreq[a]);
      
    const sortedUnigrams = Object.keys(unigramFreq)
      .filter(u => unigramFreq[u] >= 2)
      .sort((a, b) => unigramFreq[b] - unigramFreq[a]);

    const assigned = new Set();
    const capitalizeTopic = (name) => name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // First try clustering by multi-word bigrams
    sortedBigrams.forEach(bigram => {
      const topicName = capitalizeTopic(bigram);
      entities.forEach(e => {
        if (!assigned.has(e.id) && (e._bigrams || []).includes(bigram)) {
          if (!topics[topicName]) topics[topicName] = [];
          topics[topicName].push(e);
          assigned.add(e.id);
        }
      });
    });

    // Fallback to unigrams
    sortedUnigrams.forEach(unigram => {
      const topicName = capitalizeTopic(unigram);
      entities.forEach(e => {
        if (!assigned.has(e.id) && (e._keywords || []).includes(unigram)) {
          if (!topics[topicName]) topics[topicName] = [];
          topics[topicName].push(e);
          assigned.add(e.id);
        }
      });
    });

    // Default catch-all buckets
    entities.forEach(e => {
      if (!assigned.has(e.id)) {
        let bucket = 'General Specifications';
        if (e.type === 'decision' || e.type === 'recommendation') {
          bucket = 'Architecture & Design';
        } else if (e.type === 'todo' || e.type === 'bug') {
          bucket = 'Project Tasks';
        }
        if (!topics[bucket]) topics[bucket] = [];
        topics[bucket].push(e);
        assigned.add(e.id);
      }
    });

    return topics;
  },

  compileMarkdown(entities, options = {}) {
    const topics = this.clusterEntities(entities);
    const capsuleTitle = options.title || 'Project Capsule';

    let markdown = `**CAPSULE: ${capsuleTitle}**\n\n`;
    
    Object.keys(topics).forEach(topicName => {
      const topicEntities = topics[topicName];
      if (topicEntities.length === 0) return;

      const decisions = topicEntities.filter(e => e.type === 'decision').map(e => Object.values(e.attributes)[0]);
      const recommendations = topicEntities.filter(e => e.type === 'recommendation').map(e => Object.values(e.attributes)[0]);
      const constraints = topicEntities.filter(e => e.type === 'constraint').map(e => Object.values(e.attributes)[0]);
      const todos = topicEntities.filter(e => e.type === 'todo' && e.id !== 'todo.conversation.goal').map(e => Object.values(e.attributes)[0]);
      const bugs = topicEntities.filter(e => e.type === 'bug').map(e => Object.values(e.attributes)[0]);
      const preferences = topicEntities.filter(e => e.type === 'preference' || e.type === 'generic').map(e => Object.values(e.attributes)[0]);

      // Topic Type
      const isDecision = decisions.length > 0;
      const typeText = isDecision ? 'Decision' : 'Advisory';

      // Goal
      let goalText = '';
      const goalEnt = topicEntities.find(e => e.id === 'todo.conversation.goal');
      if (goalEnt) goalText = Object.values(goalEnt.attributes)[0];
      if (!goalText) {
        goalText = `Resolve topic context for ${topicName}`;
      }

      // Result
      let resultText = '';
      if (isDecision) {
        resultText = this.joinSentences(decisions);
      } else if (recommendations.length > 0) {
        resultText = this.joinSentences(recommendations);
      }

      // Facts
      const factsText = preferences.length > 0 ? this.joinSentences(preferences) : 'Standard specifications utilized.';

      // Open/Next
      const openNextList = [...todos.map(t => `Pending task ${t}`), ...bugs.map(b => `Blocker ${b}`)];
      const openNextText = openNextList.length > 0 ? this.joinSentences(openNextList) : '';

      markdown += `### 📁 ${topicName}\n`;
      markdown += `Type: ${typeText}\n`;
      markdown += `Goal: ${goalText}\n`;
      markdown += `Facts/Criteria: ${factsText}\n`;
      if (resultText) {
        markdown += `Result: ${resultText}\n`;
      }
      if (constraints.length > 0) {
        markdown += `Constraints: ${this.joinSentences(constraints)}\n`;
      }
      if (openNextText) {
        markdown += `Open/Next: ${openNextText}\n`;
      }
      markdown += `\n`;
    });

    return markdown.trim();
  },

  compose(entities, options = {}) {
    const activeEntities = entities.filter(e => !['RESOLVED', 'DEPRECATED'].includes(e.status));

    const IMPORTANCE_SCORES = {
      decision: 10,
      bug: 10,
      constraint: 9,
      recommendation: 8,
      todo: 7,
      preference: 5,
      generic: 3
    };

    const originalWords = options.originalWords || 2000;
    const wordLimit = Math.max(300, Math.min(2500, Math.round(originalWords * 0.10)));

    let currentEntities = [...activeEntities];
    let composedMarkdown = '';

    for (let attempts = 0; attempts < 25; attempts++) {
      composedMarkdown = this.compileMarkdown(currentEntities, options);
      const wordCount = composedMarkdown.split(/\s+/).filter(Boolean).length;
      
      if (wordCount <= wordLimit || currentEntities.length <= 3) {
        break;
      }
      
      currentEntities.sort((a, b) => (IMPORTANCE_SCORES[a.type] || 3) - (IMPORTANCE_SCORES[b.type] || 3));
      currentEntities.pop();
    }

    return composedMarkdown;
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
