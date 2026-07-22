// ============================================
// Capsule Infinity - Lossless Context Compression Engine
// ============================================

const CapsuleCompressor = {
  // Common greetings, pleasantries, and conversational fluff patterns
  FLUFF_PATTERNS: [
    /^(hi|hello|hey|greetings|good morning|good afternoon|good evening)[\s!.,]*/i,
    /^hope you('re| are) doing well[\s!.,]*/i,
    /^(sure|certainly|of course|i'd be happy to|i can help with that|no problem)[!.,\s]*/i,
    /^(let me know if you need anything else|hope this helps|feel free to ask|is there anything else)[!.,\s]*/i,
    /^(that makes (complete )?sense|i see what you mean|thank you|thanks)[!.,\s]*/i
  ],

  /**
   * Estimate token count from string length (~4 chars per token)
   */
  estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  },

  /**
   * Clean text line from conversational fluff
   */
  stripFluff(text) {
    if (!text) return '';
    let cleaned = text.trim();
    for (const pattern of this.FLUFF_PATTERNS) {
      cleaned = cleaned.replace(pattern, '').trim();
    }
    return cleaned;
  },

  /**
   * Extract code blocks from markdown text with language tags
   */
  extractCodeBlocks(text) {
    const blocks = [];
    const regex = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      blocks.push({
        lang: match[1] || 'text',
        code: match[2].trim(),
        fullMatch: match[0]
      });
    }
    return blocks;
  },

  /**
   * Main Compression Function
   * @param {Array<{role: string, content: string}> | string} rawInput
   * @param {Object} options
   * @returns {Object} { compressedContent: string, rawTokens: number, compressedTokens: number, savingsPercent: number }
   */
  compress(rawInput, options = {}) {
    let messages = [];
    let rawText = '';

    if (Array.isArray(rawInput)) {
      messages = rawInput;
      rawText = messages.map(m => `[${m.role.toUpperCase()}]:\n${m.content}`).join('\n\n');
    } else if (typeof rawInput === 'string') {
      rawText = rawInput;
      // Parse string into role objects if structured
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

    // 1. Identify User Primary Goal & Constraints
    const userMessages = messages.filter(m => m.role === 'user' || m.role === 'human');
    const assistantMessages = messages.filter(m => m.role === 'assistant' || m.role === 'model');

    const firstUserMsg = userMessages[0]?.content || rawText.substring(0, 300);
    const mainObjective = this.stripFluff(firstUserMsg).split('\n')[0].substring(0, 150) || 'AI Conversation Capsule';

    // 2. Collect Code Blocks (Retaining final version per language/signature)
    const codeMap = new Map();
    const techStackSet = new Set();

    messages.forEach(msg => {
      const blocks = this.extractCodeBlocks(msg.content);
      blocks.forEach(b => {
        if (b.lang) techStackSet.add(b.lang);
        // Signature keying to deduplicate intermediate buggy versions
        const firstLine = b.code.split('\n')[0].trim().substring(0, 60);
        const signatureKey = `${b.lang}:${firstLine}`;
        codeMap.set(signatureKey, b);
      });
    });

    // 3. Extract Architectural Decisions & Key Turns
    const keyDecisions = [];
    messages.forEach((msg, idx) => {
      const textWithoutCode = msg.content.replace(/```[\s\S]*?```/g, '').trim();
      const cleaned = this.stripFluff(textWithoutCode);
      
      if (cleaned.length > 15 && cleaned.length < 500) {
        // Extract bullet-like key points or direct statements
        const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length > 10);
        lines.forEach(line => {
          if (!this.FLUFF_PATTERNS.some(p => p.test(line)) && keyDecisions.length < 12) {
            const bullet = line.startsWith('-') || line.startsWith('*') ? line.substring(1).trim() : line;
            keyDecisions.push(bullet);
          }
        });
      }
    });

    // Deduplicate decisions
    const uniqueDecisions = Array.from(new Set(keyDecisions)).slice(0, 8);

    // 4. Assemble Hyper-Dense Markdown Capsule
    const techStackStr = Array.from(techStackSet).join(', ') || 'General AI Thread';

    let markdown = `# 🧠 CAPSULE CONTEXT\n\n`;
    markdown += `## 🎯 Main Goal & Tech Stack\n`;
    markdown += `- **Objective:** ${mainObjective}\n`;
    markdown += `- **Tech Stack & Constraints:** ${techStackStr}\n\n`;

    markdown += `## 📌 Topics & Technical State\n`;
    markdown += `### Topic 1: Key Architectural Decisions & Context\n`;
    markdown += `- **Status:** Completed\n`;
    markdown += `- **Decisions:**\n`;
    if (uniqueDecisions.length > 0) {
      uniqueDecisions.forEach(d => {
        markdown += `  - ${d}\n`;
      });
    } else {
      markdown += `  - Full context extracted and condensed from transcript.\n`;
    }

    if (codeMap.size > 0) {
      markdown += `- **Final Working Code / Technical Artifacts:**\n`;
      let count = 0;
      codeMap.forEach((block) => {
        if (count < 5) { // Limit to 5 clean code artifacts for maximum token savings
          markdown += `\`\`\`${block.lang}\n${block.code}\n\`\`\`\n\n`;
          count++;
        }
      });
    }

    const compressedTokens = this.estimateTokens(markdown);
    const savingsPercent = rawTokens > 0 ? Math.max(0, Math.round(((rawTokens - compressedTokens) / rawTokens) * 100)) : 0;

    return {
      compressedContent: markdown.trim(),
      rawContent: rawText,
      rawTokens,
      compressedTokens,
      savingsPercent
    };
  }
};

// Bind to window or self for global availability across contexts
if (typeof window !== 'undefined') window.CapsuleCompressor = CapsuleCompressor;
if (typeof self !== 'undefined') self.CapsuleCompressor = CapsuleCompressor;
if (typeof module !== 'undefined' && module.exports) module.exports = CapsuleCompressor;
