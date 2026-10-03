# Changelog

All notable changes to this project will be documented in this file.

## [1.0.2] - 2026-10-03
### Fixed
* ChatGPT extraction: Added support for URL and Request objects in network interceptor.
* ChatGPT extraction: Added session token authorization to active `/backend-api/conversation/` fetches.
* ChatGPT extraction: Added accessible DOM fallback strategies for `[aria-label="Conversation"]` and `"You said:"` / `"ChatGPT said:"` speaker headings.
* ChatGPT extraction: Added `#mobile-composer-prompt` and observed input selectors to dialogue detection.
* ChatGPT extraction: Added error logging and status reporting across API and DOM extraction tiers.


## [2.0.0] - 2026-07-07
### Added
* Supabase Client SDK integration for seamless cloud database sync.
* Google OAuth 2.0 PKCE redirection and session exchange flow.
* Auto-Correction engine to auto-detect and correct project URL subdomain typos.
* Permanent copyright footers in popup and sidebar windows.

## [1.0.0] - 2026-06-15
### Added
* Initial release of Capsule Infinity unpacked extension.
* Message scraping engine for Claude, ChatGPT, and Gemini.
* Asynchronous chunking buffers to prevent browser connection port drops.