# Technology Stack

Capsule Infinity is designed to be lightweight, secure, and fast.

## Technologies Used

### Core
* **HTML5 & Vanilla Javascript (ES6)**: Leveraged for the extension pages and DOM interactions to minimize bundle size.
* **Vanilla CSS**: Used for all interface styling, utilizing dark theme design palettes, grid layouts, and glow elements.

### Database & Auth
* **Supabase Client JS SDK (UMD Build)**: Provides auth session mapping, real-time database CRUD operations, and secure Postgres client queries.
* **Google OAuth 2.0 Identity Providers**: Secured through `chrome.identity` API flows, using PKCE validation loops.

### Browser Integration
* **Chrome Manifest V3 API**: Standard MV3 structure utilizing background service workers, host injections, and chrome storage systems.