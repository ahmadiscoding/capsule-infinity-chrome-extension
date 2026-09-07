# Privacy Policy for Capsule Infinity

**Last Updated: September 7, 2026**

**Capsule Infinity** ("we", "our", or "the extension") is a browser extension designed to capture AI chat conversations as structured, portable context units ("Capsules") and synchronize them across devices. We are committed to protecting your privacy and handling your data with transparency and security.

This Privacy Policy explains what data we collect, how it is used, how it is protected, and your rights regarding your data.

---

## 1. Core Privacy Principles

* **Explicit User Actions Only**: Capsule Infinity never passively logs, monitors, or scrapes your background browsing activity. Conversation capture occurs **only when you explicitly trigger a capture action** (e.g., clicking the floating capture pill or popup action).
* **Zero Data Monetization**: We do **not** sell, rent, monetize, or trade your personal information, chat transcripts, or usage data to third parties, advertisers, or data brokers.
* **Offline-First Storage**: All saved capsules and settings are stored locally on your device (`chrome.storage.local`) by default. Cloud synchronization is entirely optional.

---

## 2. Information We Collect and Process

### A. Information Stored Locally on Your Device
When you use Capsule Infinity, the following information is stored directly within your browser's local storage:
* **Captured Chat Transcripts & Capsules**: The text and structured summaries generated from your AI conversations (ChatGPT, Claude, Gemini, DeepSeek, etc.).
* **Conversation Fingerprints**: Local hashes of your recent conversation snippets used to provide instant deduplication caching without consuming AI quota.
* **User Preferences**: Extension settings including theme preference, floating button visibility, and sync settings.

### B. Information Processed for Optional Cloud Sync (Supabase)
If you choose to sign in to enable cross-device cloud synchronization:
* **Account Identifiers**: Your email address, profile name, and unique user ID provided via Google OAuth authentication (using the secure PKCE flow).
* **Cloud-Synced Capsules**: Your saved capsules stored securely in an isolated PostgreSQL database powered by Supabase, protected by Row Level Security (RLS) ensuring that only your authenticated account can access your data.
* **Monthly Usage Quota Counters**: Aggregate counters tracking your monthly AI capsule compression usage against plan limits.

### C. Server-Side AI Compression Processing
When you capture a conversation using the AI compression engine:
* The conversation transcript is transmitted securely over an encrypted connection (HTTPS/TLS) to our backend Supabase Edge Function.
* The backend securely relays the text to generative AI inference providers (Google Gemini / Groq) solely to extract structured intent, key decisions, constraints, and technical details.
* Transcripts are processed ephemerally for capsule generation and are never retained by our Edge Function server logs.

---

## 3. Information We Do NOT Collect

* We do **not** collect passwords or financial payment information.
* We do **not** track your general browsing history, search history, or non-AI web page visits.
* We do **not** inject advertisements or use third-party analytics trackers.

---

## 4. How We Use Your Information

We use the information collected solely to:
1. Generate token-efficient, structured context capsules from your AI conversations.
2. Synchronize your saved capsules across your devices when signed in.
3. Manage and display your personal capsule library in the popup and side panel interfaces.
4. Enforce fair-use monthly compression limits and prevent automated spam.

---

## 5. Third-Party Services and Data Sharing

Capsule Infinity interacts only with trusted, secure infrastructure providers necessary for core extension functionality:

* **Supabase (Database & Authentication)**: Provides encrypted cloud database storage, user authentication, and serverless Edge Functions. ([Supabase Privacy Policy](https://supabase.com/privacy))
* **Google Identity Services (OAuth / PKCE)**: Facilitates secure sign-in without exposing user credentials to the extension. ([Google Privacy Policy](https://policies.google.com/privacy))
* **Google Cloud / AI Studio & Groq (Inference Providers)**: Processes transcripts ephemerally to generate structured capsule summaries. Personal API keys are never exposed to the client.

We do not disclose your data to any other third parties unless required by applicable law.

---

## 6. Data Security and Retention

* **Encryption in Transit**: All communications between the extension, Supabase backend, and AI APIs use modern TLS encryption (HTTPS).
* **Row Level Security (RLS)**: Cloud database tables enforce strict user-level isolation policies. No user can read, modify, or delete another user's capsules.
* **User Data Control & Deletion**: You retain 100% ownership of your data. You can delete individual capsules or wipe your entire local library at any time directly through the extension UI.

### 6.1 Data Retention

* **Local Data**: Capsules, fingerprints, and preferences stored in `chrome.storage.local` persist on your device indefinitely until you delete them yourself (individually, in bulk, or by uninstalling the extension, which erases all local extension data automatically).
* **Cloud Data**: If you enable cloud sync, your account identifiers and synced capsules are retained in our Supabase database for as long as your account remains active. We do not use retained data for any purpose beyond providing the extension's core sync and compression features.
* **Server Logs**: Conversation transcripts sent to our Edge Function for AI compression are processed in memory and are not written to persistent logs or storage; they are discarded immediately after the structured capsule is generated and returned to you.

### 6.2 Data Deletion

You can delete your data at any time through the following processes:

* **Local data only**: Use the "Delete" option on any individual capsule, or "Clear All Local Data" in the extension's settings, to permanently erase content from your device. Uninstalling the extension also erases all local data immediately.
* **Full account and cloud data deletion**: Click "Delete Account" in the extension's Account menu (available in both the popup and side panel). This immediately and permanently deletes your Supabase Auth account, all cloud-synced capsules, usage records, and any associated data. This action cannot be undone.
* **Alternative**: If you are unable to access the extension, you may email `capsuleinfinity.support@gmail.com` with your account email and we will process full account and data deletion within 30 days.

### 6.3 Children's Privacy

Capsule Infinity is not directed at, and is not intended for use by, children under the age of 13. We do not knowingly collect personal information from children under 13. If we become aware that we have inadvertently collected such information, we will delete it promptly.

### 6.4 Cookies and Tracking Technologies

Capsule Infinity does **not** use cookies, web beacons, fingerprinting scripts, or any third-party analytics or advertising trackers. The "Conversation Fingerprints" described in Section 2A are local content hashes used only for on-device deduplication and are never used to track you across sites or sessions.

### 6.5 International Users

Our cloud infrastructure (Supabase) may process and store data in data centers located outside of your country of residence. By using cloud sync, you consent to this transfer and processing. We take reasonable steps to ensure your data receives an adequate level of protection wherever it is processed.

---

## 7. Google Chrome Web Store Policy Compliance

Capsule Infinity strictly adheres to the **Chrome Web Store User Data Policy**, including the **Limited Use** requirements:
* We only request permissions necessary to deliver the stated features of the extension.
* We do not use or transfer user data for serving personalized, retargeted, or interest-based advertisements.
* We do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## 8. Changes to This Privacy Policy

We may update this Privacy Policy from time to time to reflect improvements or updates to our features. Any updates will be published to this repository with a revised "Last Updated" date.

---

## 9. Contact Us

If you have any questions, concerns, or privacy-related requests regarding Capsule Infinity or this Privacy Policy, please contact us at:

* **Email**: `capsuleinfinity.support@gmail.com`
* **GitHub Repository**: [https://github.com/ahmadiscoding/capsule-infinity-chrome-extension](https://github.com/ahmadiscoding/capsule-infinity-chrome-extension)
