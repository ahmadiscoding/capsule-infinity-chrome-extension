// ============================================
// Capsule Infinity - Utilities
// ============================================

const CapsuleUtils = {
  platformInfo: {
    chatgpt:{name:'ChatGPT',color:'#10a37f',icon:'\u{1F7E2}'},claude:{name:'Claude',color:'#d97706',icon:'\u{1F7E0}'},gemini:{name:'Gemini',color:'#4285f4',icon:'\u{1F535}'},deepseek:{name:'DeepSeek',color:'#4f6df5',icon:'\u{1F7E3}'},gmail:{name:'Gmail',color:'#ea4335',icon:'\u{1F4E7}'},copilot:{name:'Copilot',color:'#00bcf2',icon:'\u{1F537}'},perplexity:{name:'Perplexity',color:'#20b2aa',icon:'\u{1F52E}'},poe:{name:'Poe',color:'#6c5ce7',icon:'\u{1F4AC}'},phind:{name:'Phind',color:'#45a29e',icon:'\u{1F50D}'},you:{name:'You.com',color:'#7c3aed',icon:'\u{1F3AF}'},kagi:{name:'Kagi',color:'#ffb703',icon:'\u26A1'},manual:{name:'Manual',color:'#6366f1',icon:'\u270F\uFE0F'},unknown:{name:'Other',color:'#6b7280',icon:'\u2753'}
  },
  getPlatformInfo(p) { return this.platformInfo[p] || this.platformInfo.unknown; },
  timeAgo(ts) { const s=Math.floor((Date.now()-ts)/1000); if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';if(s<604800)return Math.floor(s/86400)+'d ago';return new Date(ts).toLocaleDateString(); },
  formatDate(ts) { return new Date(ts).toLocaleString(); },
  truncate(t, m=200) { return !t?'':t.length>m?t.substring(0,m)+'...':t; },
  wordCount(t) { return !t?0:t.split(/\s+/).filter(Boolean).length; },
  formatWithSystemContext(content) {
    if (!content) return '';
    const header = `======================================================================\n[CAPSULE INFINITY SYSTEM CONTEXT]\nThe text below is an exported snapshot of a historical AI conversation. \nThe user is pasting this to provide you with the exact context of what \nhas been accomplished so far. Review this history to understand the \nprevious logic, troubleshooting steps, and outcomes before responding \nto the user's latest prompt.\n======================================================================\n\n`;
    if (content.includes('[CAPSULE INFINITY SYSTEM CONTEXT]')) return content;
    return header + content;
  },
  formatForInjection(c) {
    let f=`--- Capsule: ${c.title} ---\nSource: ${this.getPlatformInfo(c.platform).name}`;
    if (c.sourceUrl) f+=` | ${c.sourceUrl}`;
    f+=`\n`;
    if (c.tags?.length) f+=`Tags: ${c.tags.join(', ')}\n`;
    f+=`Version: ${c.metadata?.version||c.version||1}\n---\n\n`;
    return this.formatWithSystemContext(f + c.content);
  },
  formatAttachments(c) { if(!c.attachments?.length)return''; let t='\n\nAttachments:\n'; c.attachments.forEach(a=>{t+=`- ${a.name||'File'} (${a.type||'file'})\n`;}); return t; },
  sanitize(s) { if(!s)return''; const d=document.createElement('div'); d.textContent=s; return d.innerHTML; },
  detectPlatform() { const u=window.location.href; if(u.includes('chatgpt.com'))return'chatgpt';if(u.includes('claude.ai'))return'claude';if(u.includes('gemini.google.com'))return'gemini';if(u.includes('deepseek.com'))return'deepseek';if(u.includes('mail.google.com'))return'gmail';if(u.includes('copilot.microsoft.com'))return'copilot';if(u.includes('perplexity.ai'))return'perplexity';if(u.includes('poe.com'))return'poe';if(u.includes('phind.com'))return'phind';if(u.includes('you.com'))return'you';if(u.includes('kagi.com'))return'kagi';return'unknown'; },
  async copyToClipboard(text) { try{await navigator.clipboard.writeText(text);return true;}catch{const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;left:-9999px';document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);return true;} }
};
if(typeof window!=='undefined')window.CapsuleUtils=CapsuleUtils;