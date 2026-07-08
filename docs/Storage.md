# Storage Layer Flow

Capsule Infinity implements a robust, offline-first data manager inside `lib/storage.js`.

![Storage Flow](../assets/diagrams/storage.svg)

## Data Operations

### 1. `saveCapsule()`
* Converts client-generated text keys (e.g. `cap_xxx`) to standard UUID strings (`self.crypto.randomUUID()`) to comply with PostgreSQL schema indexes.
* If a Supabase client is initialized and the user is logged in, it updates the record in the `capsules` table via the JS SDK.
* Simultaneously updates the local backup in `chrome.storage.local` to enable offline viewing.

### 2. `getAllCapsules()`
* Tries to fetch the latest list of capsules from the `capsules` table in Supabase.
* If the user is offline, keys are missing, or the call fails, it automatically falls back to loading data from `chrome.storage.local` with zero service interruption.