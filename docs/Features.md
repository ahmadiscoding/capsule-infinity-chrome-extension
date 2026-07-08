# Features Matrix

Capsule Infinity is packed with enterprise-grade features tailored for power users of generative AI.

![Features Banners](../assets/banners/feature_banner.svg)

## 1. Asynchronous Chunking Pipeline
* **Conquers payload constraints**: Browsers drop extension connections when string transfers exceed 1MB. Capsule Infinity splits message strings into 50KB segments, transmitting them sequentially through a stateful message queue.
* **Auto-Recovery**: If a packet fails, the background worker automatically requests a retransmission of the single segment.

## 2. Safe DOM Scraping Engine
* **Robust element matching**: AI dashboards dynamically update class names and lazy-load history. The scraping scripts use soft-traversal try/catch checks.
* **Timeout Guards**: Safe promises abort the scrape sequence if the page hangs for more than 8 seconds, releasing the user interface immediately.

## 3. Supabase Cloud Integration
* **Authenticated sessions**: Passes token hashes directly via `supabase.auth.setSession`, locking database transactions down to your verified Gmail user profile.
* **Row-Level Security (RLS)**: Enforces table policies to ensure your saved capsules cannot be read by anyone else.

## 4. Watermarked Creator Footers
* **Seamless layout integration**: Includes permanent designer branding footer tags at the bottom of the sidebar library and popup windows.