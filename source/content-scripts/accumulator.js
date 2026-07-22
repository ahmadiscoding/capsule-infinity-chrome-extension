// ============================================================
// Capsule Infinity - Fallback DOM Accumulator (v2.2)
// Extracts virtualized DOM messages incrementally via MutationObserver
// ============================================================

const DOMAccumulator = {
  /**
   * Safe incremental scroll-walker with MutationObserver and adaptive steps
   */
  async accumulate(container, extractCurrentVisibleMessages, getMessageKey, onProgress) {
    const accumulatedMap = new Map();
    let observer = null;
    let mutationsOccurred = false;

    // Helper to add messages to the map
    const ingestVisible = () => {
      const current = extractCurrentVisibleMessages();
      let newCount = 0;
      current.forEach(msg => {
        const key = getMessageKey(msg);
        if (key && !accumulatedMap.has(key)) {
          accumulatedMap.set(key, msg);
          newCount++;
        }
      });
      if (newCount > 0 && typeof onProgress === 'function') {
        onProgress(accumulatedMap.size);
      }
      return newCount;
    };

    // 1. Initial visible ingest
    ingestVisible();

    // 2. Setup MutationObserver to watch container additions
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        mutationsOccurred = true;
        ingestVisible();
      });
      observer.observe(container, { childList: true, subtree: true });
    }

    const originalScrollTop = container.scrollTop;
    
    // Adaptive parameters
    let stepSize = 500;
    let settleDelay = 100;
    
    let scrollAttempts = 0;
    const maxAttempts = 120;
    let emptyMutationCount = 0;
    let noNewContentCount = 0;
    let stallCount = 0;

    let lastScrollTop = container.scrollTop;
    let lastAccumulatedSize = accumulatedMap.size;

    try {
      while (scrollAttempts < maxAttempts) {
        const prevScrollTop = container.scrollTop;
        mutationsOccurred = false;
        
        ingestVisible();

        // Adaptive step sizing
        if (mutationsOccurred) {
          // Dense content: shrink step size and increase settle delay
          stepSize = Math.max(250, stepSize - 100);
          settleDelay = Math.min(220, settleDelay + 30);
        } else {
          // Sparse content: grow step size and decrease settle delay
          stepSize = Math.min(1000, stepSize + 100);
          settleDelay = Math.max(60, settleDelay - 15);
        }

        // Step scroll position upwards
        container.scrollTop = Math.max(0, container.scrollTop - stepSize);
        container.dispatchEvent(new Event('scroll', { bubbles: true }));

        // Detect if scroll bounds are reached
        if (container.scrollTop === prevScrollTop || container.scrollTop === 0) {
          noNewContentCount++;
        } else {
          noNewContentCount = 0;
        }

        // Check empty consecutive mutations
        if (!mutationsOccurred) {
          emptyMutationCount++;
        } else {
          emptyMutationCount = 0;
        }

        // Abort on boundary AND no new nodes for 5 consecutive steps
        if (noNewContentCount >= 2 && emptyMutationCount >= 5) {
          break;
        }

        // Stall check: position and count unchanged
        if (container.scrollTop === lastScrollTop && accumulatedMap.size === lastAccumulatedSize) {
          stallCount++;
        } else {
          stallCount = 0;
          lastScrollTop = container.scrollTop;
          lastAccumulatedSize = accumulatedMap.size;
        }

        if (stallCount >= 5) {
          console.warn('[Tier 3] Stall detected. Aborting.');
          break; // genuine stall abort
        }

        // Wait to allow host virtualization to mount elements
        await new Promise(resolve => setTimeout(resolve, settleDelay));
        scrollAttempts++;
      }

      // Gap detection: check if roles don't alternate (potential missing messages)
      const list = Array.from(accumulatedMap.values());
      let gapFound = false;
      for (let i = 0; i < list.length - 1; i++) {
        if (list[i].role === list[i + 1].role) {
          gapFound = true;
          break;
        }
      }

      // If gap found, scroll back to middle of chat to attempt re-capture
      if (gapFound && container.scrollHeight > 1000) {
        console.log('[Tier 3] Gap detected. Performing re-capture pass.');
        container.scrollTop = Math.floor(container.scrollHeight / 2);
        container.dispatchEvent(new Event('scroll', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 300));
        ingestVisible();
        
        // Scroll back to top
        container.scrollTop = 0;
        container.dispatchEvent(new Event('scroll', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 200));
        ingestVisible();
      }

    } finally {
      if (observer) {
        observer.disconnect();
      }
      container.scrollTop = originalScrollTop;
    }

    return Array.from(accumulatedMap.values());
  }
};

// Bind to context
if (typeof window !== 'undefined') window.DOMAccumulator = DOMAccumulator;
if (typeof self !== 'undefined') self.DOMAccumulator = DOMAccumulator;
if (typeof module !== 'undefined' && module.exports) module.exports = DOMAccumulator;
