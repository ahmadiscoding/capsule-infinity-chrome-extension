// ============================================================
// Capsule Infinity - Fallback DOM Accumulator (v2.2)
// Extracts virtualized DOM messages incrementally via MutationObserver
// ============================================================

const DOMAccumulator = {
  /**
   * Safe incremental scroll-walker with MutationObserver and adaptive steps
   */
  async accumulate(container, extractCurrentVisibleMessages, getMessageKey, onProgress) {
    let orderedList = [];
    let observer = null;
    let mutationsOccurred = false;

    // Helper to merge newly scrolled messages (from higher up) into the accumulated list in chronological order
    const mergeBatch = (newBatch, accumulated) => {
      if (!accumulated || accumulated.length === 0) return newBatch || [];
      if (!newBatch || newBatch.length === 0) return accumulated;

      // Find overlap where tail of newBatch matches head of accumulated
      const maxOverlap = Math.min(newBatch.length, accumulated.length);
      for (let len = maxOverlap; len > 0; len--) {
        let match = true;
        for (let i = 0; i < len; i++) {
          const bKey = getMessageKey(newBatch[newBatch.length - len + i]);
          const aKey = getMessageKey(accumulated[i]);
          if (bKey !== aKey) {
            match = false;
            break;
          }
        }
        if (match) {
          return [...newBatch.slice(0, newBatch.length - len), ...accumulated];
        }
      }

      // Deduplicating fallback
      const existingKeys = new Set(accumulated.map(m => getMessageKey(m)));
      const uniqueNew = newBatch.filter(m => !existingKeys.has(getMessageKey(m)));
      return [...uniqueNew, ...accumulated];
    };

    const ingestVisible = () => {
      const current = extractCurrentVisibleMessages();
      if (!current || current.length === 0) return 0;
      const prevLen = orderedList.length;
      orderedList = mergeBatch(current, orderedList);
      const newCount = orderedList.length - prevLen;
      if (newCount > 0 && typeof onProgress === 'function') {
        onProgress(orderedList.length);
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

    const getScrollTop = (el) => {
      if (!el || el === document.documentElement || el === document.body || el === window) {
        return window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
      }
      return el.scrollTop || 0;
    };

    const setScrollTop = (el, val) => {
      const top = Math.max(0, val);
      if (!el || el === document.documentElement || el === document.body || el === window) {
        window.scrollTo({ top, behavior: 'instant' });
        if (document.documentElement) document.documentElement.scrollTop = top;
        if (document.body) document.body.scrollTop = top;
      } else {
        el.scrollTop = top;
      }
      el?.dispatchEvent?.(new Event('scroll', { bubbles: true }));
      window.dispatchEvent(new Event('scroll'));
    };

    const originalScrollTop = getScrollTop(container);
    
    // Adaptive parameters
    let stepSize = 500;
    let settleDelay = 100;
    
    let scrollAttempts = 0;
    const maxAttempts = 120;
    let emptyMutationCount = 0;
    let noNewContentCount = 0;
    let stallCount = 0;

    let lastScrollTop = originalScrollTop;
    let lastAccumulatedSize = orderedList.length;

    try {
      while (scrollAttempts < maxAttempts) {
        const prevScrollTop = getScrollTop(container);
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
        setScrollTop(container, prevScrollTop - stepSize);
        const currentScrollTop = getScrollTop(container);

        // Detect if scroll bounds are reached
        if (currentScrollTop === prevScrollTop || currentScrollTop === 0) {
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
        if (currentScrollTop === lastScrollTop && orderedList.length === lastAccumulatedSize) {
          stallCount++;
        } else {
          stallCount = 0;
          lastScrollTop = currentScrollTop;
          lastAccumulatedSize = orderedList.length;
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
      const list = orderedList;
      let gapFound = false;
      for (let i = 0; i < list.length - 1; i++) {
        if (list[i].role === list[i + 1].role) {
          gapFound = true;
          break;
        }
      }

      // If gap found, scroll back to middle of chat to attempt re-capture
      const scrollHeight = container.scrollHeight || document.documentElement?.scrollHeight || 0;
      if (gapFound && scrollHeight > 1000) {
        console.log('[Tier 3] Gap detected. Performing re-capture pass.');
        setScrollTop(container, Math.floor(scrollHeight / 2));
        await new Promise(resolve => setTimeout(resolve, 300));
        ingestVisible();
        
        // Scroll back to top
        setScrollTop(container, 0);
        await new Promise(resolve => setTimeout(resolve, 200));
        ingestVisible();
      }

    } finally {
      if (observer) {
        observer.disconnect();
      }
      setScrollTop(container, originalScrollTop);
    }

    return orderedList;
  }
};

// Bind to context
if (typeof window !== 'undefined') window.DOMAccumulator = DOMAccumulator;
if (typeof self !== 'undefined') self.DOMAccumulator = DOMAccumulator;
if (typeof module !== 'undefined' && module.exports) module.exports = DOMAccumulator;
