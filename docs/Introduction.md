# Introduction to Capsule Infinity

Capsule Infinity is a next-generation Chrome and Brave browser extension designed to resolve one of the most persistent bottlenecks in modern AI development: **context decay and workflow discontinuity**.

As developers and researchers pair-program or brainstorm across multiple AI model sessions (ChatGPT, Claude, Gemini, DeepSeek), conversation context becomes fragmented. You are forced to start from scratch when switching models, losing valuable history and instructions.

Capsule Infinity captures full, complex conversations, prepends systemic metadata and instructions, and packs them into portable, reusable context units called **Capsules**. These Capsules are synced instantly to your private Supabase Cloud database, allowing you to reload and resume your workflows across any device or browser session.

## The Core Problem
1. **Context Fragmentation**: Model sessions are siloed. There is no native way to migrate a debugging thread from Claude to ChatGPT.
2. **Scraping Limits**: Standard page savers crash or truncate when attempting to capture large chat trees.
3. **Data Loss**: Local browser cache is unstable and doesn't sync across machines.

## The Solution: Capsule Infinity
* **Safe DOM Scraping Engine**: Parses message nodes cleanly, traversing lazy-loaded historical DOM boundaries without crashing.
* **Asynchronous Chunking Pipeline**: Splits massive payload strings into 50KB segments to safely navigate browser messaging limits.
* **Private Cloud Synchronization**: Leverages the official Supabase JS SDK client with secure Row Level Security (RLS) to synchronize your data.
* **Offline-First Resilience**: Gracefully falls back to local storage caching if connectivity drops, automatically queuing data sync for later.