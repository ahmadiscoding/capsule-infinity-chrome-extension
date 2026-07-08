# Frequently Asked Questions

### Q1: Is Capsule Infinity free?
Yes! Capsule Infinity is 100% free and open-source.

### Q2: Where is my data stored?
Your data is stored locally in your browser cache (`chrome.storage.local`) and, if configured, inside your private Supabase database. Your data is never sent to third-party servers.

### Q3: Why does Google Sign-in fail with "Authorization page could not be loaded"?
This is usually caused by a spelling mistake in the Supabase URL or a missing redirect URI whitelist. Open the extension Settings cog and make sure your URL has the exact format `https://xxxx.supabase.co`. Also confirm that the extension Redirect URI is whitelisted under **Authentication > URL Configuration** in your Supabase dashboard.

### Q4: Does it work with Brave Shields?
Yes! However, you may need to allow popups or adjust shield cookie settings if Brave blocks the initial Google login window redirect.