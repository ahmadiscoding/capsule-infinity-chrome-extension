# Release Notes

## Version 2.0.0 (Latest Release)
* **Supabase Integration**: Migrated storage layer from local-only caching to a cloud sync architecture utilizing the official Supabase JS SDK.
* **PKCE Authentication Flow**: Updated the background auth service to use the native Supabase Google login provider with PKCE code verification.
* **Auto-Correction Engine**: Built auto-detect triggers to patch misspelled project URL subdomains and handle trailing slash double-paths automatically.
* **Permanent Creator Footer**: Injected custom copyright watermarks in both the sidebar panel and popup interface screens.