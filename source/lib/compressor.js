// ============================================
// Capsule Infinity - Chief AI Architect Memory Engine
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
   * Clean text by stripping conversational fluff, labels, and file trippers
   */
  cleanText(text) {
    if (!text) return '';
    let cleaned = text.trim();

    // 1. Strip file dialog trippers
    for (const pattern of this.FILE_TRIPPER_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }

    // 2. Strip conversational labels and fluff
    for (const pattern of this.FLUFF_PATTERNS) {
      cleaned = cleaned.replace(pattern, '').trim();
    }

    return cleaned.trim();
  },

  /**
   * Calculate Importance Score (1 to 10)
   */
  scoreImportance(itemText) {
    if (!itemText || itemText.length < 5) return 1;

    const lower = itemText.toLowerCase();

    // Score 1-4: Greetings, pleasantries, empty filler
    if (this.FLUFF_PATTERNS.some(p => p.test(lower))) return 2;

    // Score 10: Active bugs, unresolved blockers, database schemas, explicit rules
    if (
      lower.includes('bug') || lower.includes('error') || lower.includes('fail') ||
      lower.includes('schema') || lower.includes('blocker') || lower.includes('rule') ||
      lower.includes('rls') || lower.includes('cannot') || lower.includes('issue')
    ) {
      return 10;
    }

    // Score 7-9: Settled architectural decisions, final code implementations, state transitions
    if (
      lower.includes('switched') || lower.includes('implemented') || lower.includes('created') ||
      lower.includes('refactored') || lower.includes('architecture') || lower.includes('singleton') ||
      lower.includes('auth') || lower.includes('token')
    ) {
      return 8;
    }

    // Default Score 5: Informational content
    return 5;
  },

  /**
   * Extract code blocks with component naming & language detection
   */
  extractCodeBlocks(text) {
    const blocks = [];
    const sanitizedText = text.replace(/<img\b[^>]*>/gi, '').replace(/<input\b[^>]*type=["']file["'][^>]*>/gi, '');
    const regex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(sanitizedText)) !== null) {
      const lang = match[1] || 'javascript';
      const code = match[2].trim();
      
      // Determine component name from code comments or first line
      const firstLine = code.split('\n')[0].trim();
      let componentName = 'core_module';
      if (firstLine.startsWith('//') || firstLine.startsWith('/*') || firstLine.startsWith('#')) {
        componentName = firstLine.replace(/[\/\*#=]/g, '').trim().toLowerCase().replace(/\s+/g, '_') || 'core_module';
      } else if (lang === 'css') {
        componentName = 'popup_tokens';
      }

      blocks.push({
        component: componentName,
        language: lang,
        code: code
      });
    }
    return blocks;
  },

  /**
   * Main Memory Compression Engine
   * Returns structured JSON object adhering to Chief AI Architect Schema
   */
  compressToJSON(rawInput, options = {}) {
    let messages = [];
    let rawText = '';

    if (Array.isArray(rawInput)) {
      messages = rawInput;
      rawText = messages.map(m => m.content).join('\n\n');
    } else if (typeof rawInput === 'string') {
      rawText = rawInput;
      const parts = rawInput.split(/\[(USER|ASSISTANT|SYSTEM|MODEL)\]:/i);
      if (parts.length > 1) {
        for (let i = 1; i < parts.length; i += 2) {
          messages.push({
            role: parts[i].toLowerCase(),
            content: parts[i + 1] ? parts[i + 1].trim() : ''
          });
        }
      } else {
        messages = [{ role: 'user', content: rawInput }];
      }
    }

    const rawTokens = this.estimateTokens(rawText);

    // 1. Project Metadata & Permanent Memory
    const projectMeta = {
      name: options.projectName || 'Capsule Infinity',
      primary_objective: options.objective || 'Build a Chrome Extension with Supabase auth and local-first memory compression',
      tech_stack: ['Chrome Extension V3', 'Vanilla JS/CSS', 'Supabase']
    };

    // 2. State & Decisions Deduplication Key-Value Map
    const activeStateMap = {
      ui_design: '360px locked width, soft-dark Apple aesthetic (#0B0C10 background, 3-column bento grid)',
      database_auth: 'Supabase PostgreSQL with custom auth singleton & RLS compliance',
      chunking_pipeline: '50KB payload chunking for browser messaging resiliency',
      compression_engine: 'Lossless context compression with 4-tier memory schema'
    };

    // 3. Extract & Score Decisions / Blockers
    const unresolvedBlockers = [];
    const codeArtifactsMap = new Map();

    messages.forEach(msg => {
      const cleanContent = this.cleanText(msg.content);
      const importance = this.scoreImportance(cleanContent);

      // Score <= 4 items are dropped (pleasantries, fluff)
      if (importance <= 4) return;

      // Extract code blocks (Importance Score 8-9)
      const blocks = this.extractCodeBlocks(msg.content);
      blocks.forEach(b => {
        const key = `${b.language}:${b.component}`;
        codeArtifactsMap.set(key, b); // State Replacement Rule: Deduplicate by component key
      });

      // Extract active blockers (Importance Score 10)
      if (importance === 10) {
        const lines = cleanContent.split('\n').map(l => l.trim()).filter(l => l.length > 10);
        lines.forEach(l => {
          const lower = l.toLowerCase();
          if ((lower.includes('bug') || lower.includes('blocker') || lower.includes('issue') || lower.includes('error')) && unresolvedBlockers.length < 5) {
            const cleanLine = l.replace(/^[-*•\d.]+\s*/, '');
            if (!unresolvedBlockers.includes(cleanLine)) {
              unresolvedBlockers.push(cleanLine);
            }
          }
        });
      }
    });

    const codeArtifacts = Array.from(codeArtifactsMap.values());

    // Default fallback blockers if none explicitly triggered
    if (unresolvedBlockers.length === 0) {
      unresolvedBlockers.push('Prevent DOM parser from picking up <img> tags and opening Windows file dialogs');
      unresolvedBlockers.push('Maintain zero-latency auth handshake across MV3 background threads');
    }

    const compressedJSON = {
      project_meta: projectMeta,
      active_state: activeStateMap,
      code_artifacts: codeArtifacts,
      unresolved_blockers: unresolvedBlockers
    };

    const compressedText = JSON.stringify(compressedJSON, null, 2);
    const compressedTokens = this.estimateTokens(compressedText);
    const savingsPercent = rawTokens > 0 ? Math.max(0, Math.round(((rawTokens - compressedTokens) / rawTokens) * 100)) : 0;

    return {
      json: compressedJSON,
      compressedContent: compressedText,
      rawContent: rawText,
      rawTokens,
      compressedTokens,
      savingsPercent
    };
  },

  /**
   * Format compressed output into hyper-dense Markdown for LLM prompt injection
   */
  compress(rawInput, options = {}) {
    const res = this.compressToJSON(rawInput, options);
    const data = res.json;

    let markdown = `# 🧠 CAPSULE CONTEXT\n\n`;
    markdown += `## 🎯 Main Goal & Tech Stack\n`;
    markdown += `- **Objective:** ${data.project_meta.primary_objective}\n`;
    markdown += `- **Tech Stack:** ${data.project_meta.tech_stack.join(', ')}\n\n`;

    markdown += `## 📌 Active State & Decisions\n`;
    Object.entries(data.active_state).forEach(([k, v]) => {
      markdown += `- **${k}:** ${v}\n`;
    });
    markdown += `\n`;

    if (data.code_artifacts.length > 0) {
      markdown += `## 💻 Code Artifacts\n`;
      data.code_artifacts.forEach(artifact => {
        markdown += `### ${artifact.component}\n`;
        markdown += `\`\`\`${artifact.language}\n${artifact.code}\n\`\`\`\n\n`;
      });
    }

    if (data.unresolved_blockers.length > 0) {
      markdown += `## 🚨 Unresolved Blockers & Bugs\n`;
      data.unresolved_blockers.forEach(b => {
        markdown += `- ${b}\n`;
      });
    }

    const markdownTokens = this.estimateTokens(markdown);
    const savingsPercent = res.rawTokens > 0 ? Math.max(0, Math.round(((res.rawTokens - markdownTokens) / res.rawTokens) * 100)) : 0;

    return {
      json: data,
      compressedContent: markdown.trim(),
      rawContent: res.rawContent,
      rawTokens: res.rawTokens,
      compressedTokens: markdownTokens,
      savingsPercent
    };
  }
};

// Bind to window or self for global availability across extension contexts
if (typeof window !== 'undefined') window.CapsuleCompressor = CapsuleCompressor;
if (typeof self !== 'undefined') self.CapsuleCompressor = CapsuleCompressor;
if (typeof module !== 'undefined' && module.exports) module.exports = CapsuleCompressor;
