// ============================================
// Capsule Infinity - Rolling Paper Animation
// Sub-1-second capture animation
// ============================================

const CapsuleAnimation = {
  /**
   * Rolling paper animation: text rolls up from the page into a capsule pill
   * that flies to the floating button. Total duration: < 800ms
   */
  playCaptureAnimation(sourceRect, onComplete) {
    const duration = 750;
    const startTime = performance.now();

    // 1. Create the "paper" element from the source area
    const paper = document.createElement('div');
    paper.className = 'ci-animation-paper';
    const paperW = Math.min(sourceRect.width, 400);
    const paperH = Math.min(sourceRect.height, 200);
    paper.style.cssText = `
      position: fixed;
      left: ${sourceRect.left + sourceRect.width / 2 - paperW / 2}px;
      top: ${sourceRect.top + sourceRect.height / 2 - paperH / 2}px;
      width: ${paperW}px;
      height: ${paperH}px;
      background: linear-gradient(180deg, #f8f9fa 0%, #e9ecef 100%);
      border-radius: 4px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      z-index: 2147483647;
      transition: all ${duration * 0.4}ms cubic-bezier(0.4, 0, 0.2, 1);
      overflow: hidden;
      pointer-events: none;
    `;

    // Add fake text lines
    let lines = '';
    for (let i = 0; i < 8; i++) {
      const w = 40 + Math.random() * 55;
      const delay = i * 30;
      lines += `<div style="height:6px;background:#dee2e6;border-radius:3px;margin:${3 + Math.random() * 4}px 12px;width:${w}%;opacity:0;animation:ci-line-appear 0.3s ease ${delay}ms forwards;"></div>`;
    }
    paper.innerHTML = lines;
    document.body.appendChild(paper);

    // 2. Create the capsule pill that will appear
    const capsule = document.createElement('div');
    capsule.className = 'ci-animation-capsule';
    capsule.style.cssText = `
      position: fixed;
      left: ${sourceRect.left + sourceRect.width / 2}px;
      top: ${sourceRect.top + sourceRect.height / 2}px;
      width: 0; height: 0;
      background: linear-gradient(135deg, #6366f1, #a855f7);
      border-radius: 50px;
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 0px; font-weight: 700;
      box-shadow: 0 8px 30px rgba(99,102,241,0.5);
      z-index: 2147483647;
      pointer-events: none;
      opacity: 0;
      transition: all ${duration * 0.3}ms cubic-bezier(0.4, 0, 0.2, 1);
    `;
    capsule.textContent = '\u{1F48A}'; // 💊
    document.body.appendChild(capsule);

    // Get the floating button position
    const btn = document.getElementById('ci-floating-btn');
    const targetX = btn ? btn.getBoundingClientRect().right - 30 : window.innerWidth - 60;
    const targetY = btn ? btn.getBoundingClientRect().top + 10 : window.innerHeight - 60;

    // Phase 1: Paper appears and text lines fade in (0-200ms)
    // (handled by CSS animation on lines)

    // Phase 2: Paper rolls up into capsule (200-400ms)
    setTimeout(() => {
      paper.style.transform = 'scaleY(0.05) scaleX(0.8)';
      paper.style.borderRadius = '50px';
      paper.style.opacity = '0.5';
      paper.style.height = '30px';
      paper.style.background = 'linear-gradient(135deg, #6366f1, #a855f7)';

      // Show capsule growing
      capsule.style.opacity = '1';
      capsule.style.width = '60px';
      capsule.style.height = '28px';
      capsule.style.fontSize = '14px';
    }, duration * 0.25);

    // Phase 3: Paper disappears, capsule flies to button (400-750ms)
    setTimeout(() => {
      paper.remove();

      capsule.style.left = targetX + 'px';
      capsule.style.top = targetY + 'px';
      capsule.style.width = '40px';
      capsule.style.height = '40px';
      capsule.style.borderRadius = '50%';
      capsule.style.fontSize = '18px';
      capsule.style.boxShadow = '0 4px 15px rgba(99,102,241,0.6)';

      // Pulse the actual button
      if (btn) {
        btn.style.transform = 'scale(1.3)';
        btn.style.boxShadow = '0 0 30px rgba(99,102,241,0.7)';
      }
    }, duration * 0.5);

    // Phase 4: Cleanup (700-800ms)
    setTimeout(() => {
      capsule.style.transform = 'scale(0)';
      capsule.style.opacity = '0';
    }, duration * 0.85);

    setTimeout(() => {
      capsule.remove();
      if (btn) {
        btn.style.transform = '';
        btn.style.boxShadow = '';
      }
      if (onComplete) onComplete();
    }, duration);
  },

  /**
   * Quick pulse animation for inject
   */
  playInjectPulse(targetRect, onComplete) {
    const pulse = document.createElement('div');
    pulse.style.cssText = `
      position: fixed;
      left: ${targetRect.left - 4}px;
      top: ${targetRect.top - 4}px;
      width: ${targetRect.width + 8}px;
      height: ${targetRect.height + 8}px;
      border: 2px solid #6366f1;
      border-radius: 12px;
      z-index: 2147483647;
      pointer-events: none;
      animation: ci-pulse-ring 0.6s ease-out forwards;
    `;
    document.body.appendChild(pulse);
    setTimeout(() => {
      pulse.remove();
      if (onComplete) onComplete();
    }, 600);
  }
};

// Add required keyframes
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes ci-line-appear {
    from { opacity: 0; transform: translateX(-10px); }
    to { opacity: 1; transform: translateX(0); }
  }
  @keyframes ci-pulse-ring {
    0% { opacity: 1; transform: scale(1); }
    100% { opacity: 0; transform: scale(1.08); }
  }
`;
if (document.head) document.head.appendChild(styleSheet);

if (typeof window !== 'undefined') {
  window.CapsuleAnimation = CapsuleAnimation;
}