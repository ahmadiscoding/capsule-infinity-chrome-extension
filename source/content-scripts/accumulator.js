// ============================================================
// Capsule Infinity - Fallback DOM Accumulator
// Extracts virtualized DOM messages incrementally via MutationObserver
// ============================================================

const DOMAccumulator = {
  /**
   * Safe incremental scroll-walker with MutationObserver
   * container: DOM scroll element
   * extractCurrentVisibleMessages: Function returning [{role, content}]
   * getMessageKey: Function returning a unique key for a message object
   */
  async accumulate(container, extractCurrentVisibleMessages, getMessageKey) {
    const accumulatedMap = new Map();
    let observer = null;

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
      return newCount;
    };

    // 1. Initial visible ingest
    ingestVisible();

    // 2. Setup MutationObserver to watch container additions
    if (typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(() => {
        ingestVisible();
      });
      observer.observe(container, { childList: true, subtree: true });
    }

    const originalScrollTop = container.scrollTop;
    let scrollAttempts = 0;
    const maxAttempts = 60; // Standard safety ceiling
    let noNewContentCount = 0;

    try {
      while (scrollAttempts < maxAttempts) {
        const lastScrollTop = container.scrollTop;
        
        // Ingest before scroll
        ingestVisible();

        // Step scroll position upwards incrementally
        container.scrollTop = Math.max(0, container.scrollTop - 800);
        container.dispatchEvent(new Event('scroll', { bubbles: true }));

        // Detect if scroll bounds are reached
        if (container.scrollTop === lastScrollTop || container.scrollTop === 0) {
          noNewContentCount++;
        } else {
          noNewContentCount = 0;
        }

        if (noNewContentCount >= 3) {
          break; // Bottom/Top boundary reached
        }

        // Wait 90ms to allow host virtualization to mount elements
        await new Promise(resolve => setTimeout(resolve, 90));
        scrollAttempts++;
      }
    } finally {
      // Clean up observer
      if (observer) {
        observer.disconnect();
      }
      // Restore scroll position
      container.scrollTop = originalScrollTop;
    }

    // Map preserves insertion order, which is correct chronologically
    return Array.from(accumulatedMap.values());
  }
};

// Bind to context
if (typeof window !== 'undefined') window.DOMAccumulator = DOMAccumulator;
if (typeof self !== 'undefined') self.DOMAccumulator = DOMAccumulator;
if (typeof module !== 'undefined' && module.exports) module.exports = DOMAccumulator;
