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
    const clean = firstMsg.trim().replace(/^[-*•\d.]+\s*/, '');
    const lower = clean.toLowerCase();
    
    let processed = clean;
    if (lower.startsWith('salam') || lower.startsWith('hello') || lower.startsWith('hi') || lower.startsWith('hey')) {
      const lines = clean.split('\n');
      const nextLine = lines.find(l => l.trim().length > 5 && !/^(hi|hello|hey|salam)/i.test(l.trim()));
      if (nextLine) processed = nextLine.trim();
    }
    
    return processed.split('\n')[0].trim().substring(0, 100);
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
    const containsFile = lower.includes('.') || lower.includes('/') || lower.includes('\\');
    
    return containsTech || containsFile;
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
      id: 'todo.conversation_goal',
      attributes: { goal: goalFallback },
      confidence: 0.95
    });

    lines.forEach(line => {
      const lower = line.toLowerCase();
      
      if (line.includes('function ') || line.includes('class ') || line.includes('const ') || line.includes('import ')) {
        return;
      }

      const parts = line.split(':');
      if (parts.length >= 2 && ['decision', 'preference', 'constraint', 'todo', 'bug', 'problem', 'solution'].includes(parts[0].trim().toLowerCase())) {
        const key = parts[0].trim().toLowerCase();
        const value = parts.slice(1).join(':').trim();
        
        let type = 'preference';
        let action = 'UPSERT';
        if (key === 'decision') type = 'decision';
        else if (key === 'constraint') type = 'constraint';
        else if (key === 'todo') type = 'todo';
        else if (key === 'bug' || key === 'problem') type = 'bug';
        else if (key === 'solution') {
          type = 'bug';
          action = 'RESOLVE';
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

      let type = null;
      let attrKey = '';
      
      if (lower.includes('todo') || lower.includes('pending') || lower.includes('next step') || lower.includes('task') || lower.includes('need to')) {
        type = 'todo';
        attrKey = 'task';
      } else if (lower.includes('bug') || lower.includes('error') || lower.includes('fail') || lower.includes('issue') || lower.includes('blocker')) {
        type = 'bug';
        attrKey = 'blocker';
      } else if (lower.includes('decide') || lower.includes('choose') || lower.includes('chose') || lower.includes('implement') || lower.includes('prefer') || lower.includes('switch') || lower.includes('adopt') || lower.includes('select')) {
        type = 'decision';
        attrKey = 'decision';
      } else if (lower.includes('must') || lower.includes('restrict') || lower.includes('limit') || lower.includes('constraint') || lower.includes('rule') || lower.includes('require')) {
        type = 'constraint';
        attrKey = 'constraint';
      } else {
        type = 'preference';
        attrKey = 'detail';
      }

      if (type && !addedSentences.has(lower)) {
        addedSentences.add(lower);
        const cleanVal = line.replace(/^[-*•\d.]+\s*/, '').trim();
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
    let firstUserMsg = '';
    if (Array.isArray(rawInput)) {
      rawText = rawInput.map(m => m.content).join('\n\n');
      const userMsg = rawInput.find(m => m.role === 'user');
      if (userMsg) firstUserMsg = userMsg.content;
    } else {
      rawText = String(rawInput);
    }

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
    const composedMarkdown = ContextComposer.compose(res.json, options);
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

  compose(entities, options = {}) {
    const activeEntities = entities.filter(e => !['RESOLVED', 'DEPRECATED'].includes(e.status));

    // 1. User Intent / Goal
    const goalEntity = activeEntities.find(e => e.type === 'todo' && (e.id === 'todo.conversation_goal' || e.attributes.goal));
    let goalText = goalEntity ? (goalEntity.attributes.goal || Object.values(goalEntity.attributes)[0]) : '';
    if (!goalText) {
      goalText = 'Discuss and resolve project requirements';
    }

    // Capitalize and format topic title
    let topicTitle = goalText.replace(/^The user wants to /i, '');
    topicTitle = topicTitle.charAt(0).toUpperCase() + topicTitle.slice(1);
    if (topicTitle.endsWith('.')) topicTitle = topicTitle.slice(0, -1);

    // 2. Decisions & Recommendations
    const decisions = activeEntities.filter(e => e.type === 'decision')
      .map(d => Object.values(d.attributes)[0])
      .filter(Boolean);
    
    const isDecision = decisions.length > 0;
    const typeText = isDecision ? 'Decision' : 'Advisory';
    
    const decisionsText = isDecision 
      ? this.joinSentences(decisions)
      : 'Recommended implementation path presented to user and confirmed.';

    // 3. Constraints
    const constraints = activeEntities.filter(e => e.type === 'constraint')
      .map(c => Object.values(c.attributes)[0])
      .filter(Boolean);
    const constraintsText = constraints.length > 0 
      ? this.joinSentences(constraints) 
      : '';

    // 4. Facts/Criteria
    const techDetails = [];
    activeEntities.forEach(e => {
      if (e.type === 'preference' || e.type === 'generic') {
        const val = Object.values(e.attributes)[0];
        if (val) techDetails.push(val);
      }
    });
    const factsText = techDetails.length > 0 
      ? this.joinSentences(techDetails) 
      : 'Standard specifications utilized.';

    // 5. Open/Next
    const todos = activeEntities.filter(e => e.type === 'todo' && e.id !== 'todo.conversation_goal')
      .map(t => Object.values(t.attributes)[0]);
    const bugs = activeEntities.filter(e => e.type === 'bug')
      .map(b => Object.values(b.attributes)[0]);
    const openNextList = [...todos.map(t => `Pending task ${t}`), ...bugs.map(b => `Blocker ${b}`)];
    const openNextText = openNextList.length > 0 ? this.joinSentences(openNextList) : '';

    const capsuleTitle = options.title || topicTitle;

    let markdown = `**CAPSULE: ${capsuleTitle}**\n\n`;
    markdown += `## ${topicTitle}\n`;
    markdown += `Type: ${typeText}\n`;
    markdown += `Goal: ${goalText}\n`;
    markdown += `Facts/Criteria: ${factsText}\n`;
    markdown += `Result: ${decisionsText}\n`;
    if (constraintsText) {
      markdown += `Constraints: ${constraintsText}\n`;
    }
    if (openNextText) {
      markdown += `Open/Next: ${openNextText}\n`;
    }

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
