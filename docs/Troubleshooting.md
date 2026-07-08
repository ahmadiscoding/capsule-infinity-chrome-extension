# Troubleshooting Guide

Use this guide to diagnose and resolve issues with your Capsule Infinity installation.

## 1. Authentication Fails (Redirect Loop or Blank Window)
* **Check Redirect URL Whitelist**: Ensure that `https://<your-extension-id>.chromiumapp.org/` is added to your Supabase dashboard allowed Redirect URLs.
* **Brave Browser Shield Blocks**: Brave Browser shields might block cookie storage during redirects. Click the Brave shield icon in your address bar and set cookies to "Allow all cookies" or toggle shields off temporarily for the authentication popup window.

## 2. Capsules Do Not Appear in the List
* **Database Schema Check**: Make sure you have run the schema script (`supabase_schema.sql`) inside your Supabase dashboard SQL Editor.
* **Inspect background logs**: Go to `chrome://extensions/` and click the **service worker** link under Capsule Infinity. Check the console logs for any printed error messages.