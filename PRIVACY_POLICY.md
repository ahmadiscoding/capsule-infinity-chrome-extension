# Privacy Policy for Capsule Infinity

**Effective Date:** October 7, 2026  
**Last Updated:** October 7, 2026

Capsule Infinity ("we", "us", or "our") provides a browser extension that allows users to capture, summarize, and organize conversational artificial intelligence (AI) sessions into structured, portable context units ("Capsules").

This Privacy Policy explains what data we collect, how it is used, how it is stored and protected, and your rights and choices regarding your data.

---

## 1. Who We Are

Capsule Infinity is developed and maintained by **Muhammad Ahmad**.

* **Contact Email:** capsuleinfinity.support@gmail.com
* **GitHub Repository:** [https://github.com/ahmadiscoding/capsule-infinity-chrome-extension](https://github.com/ahmadiscoding/capsule-infinity-chrome-extension)

If you have questions about this policy or your data, please contact us at the email address above.

---

## 2. User Data Collection

We collect and handle only the data necessary to provide and maintain the extension's features. We collect the following categories of information:

### A. Information Collected Upon Explicit User Action
* **Conversation Content**: When you explicitly choose to capture an AI conversation (by clicking the capture button or using the context menu), the conversation transcript from that session is collected to generate a structured Capsule.
* **Capsule Metadata**: Each saved capsule includes a title, the source AI platform name (such as ChatGPT, Claude, Gemini, or DeepSeek), the date/time created, and the source page URL (`sourceUrl`) of the captured conversation.
* **User Feedback & Ratings**: If you voluntarily submit feedback through the in-extension feedback modal, we collect your submitted rating (1–5 stars), optional written explanation, follow-up preference, and account identifier (if signed in).

### B. In-Memory Conversation Reading on Supported AI Sites
* On supported AI chat websites (such as ChatGPT, Claude, and Gemini), the extension reads conversation responses in the active webpage's volatile memory as the page loads so that the extension is ready to capture when you request it.
* **This in-memory data is held strictly in temporary browser memory.** It is never written to disk, never saved to persistent storage, and never transmitted over the network unless you explicitly trigger a capture action. If you navigate away, reload the page, or close the tab without capturing, the in-memory data is discarded.

### C. Account and Cloud Synchronization Data (When Signed In)
If you optionally sign in using Google Sign-In to sync your capsules across devices:
* **Account Identifiers**: Your Google display name, email address, and profile ID provided via Google Identity Services (OAuth / PKCE flow).
* **Cloud-Synced Library**: Your saved capsules and organizational folder metadata are stored in our cloud database to provide cross-device synchronization.
* **Monthly Usage Quota Counters**: A counter tracking the number of AI compression requests associated with your account per calendar month to enforce fair-use limits.

### D. Local Storage and Preferences (Stored on Your Device)
The following information is stored strictly on your local device (`chrome.storage.local`):
* Locally saved capsules and custom folder structures.
* User preferences (such as dark/light theme, floating button visibility, and sync preferences).
* Consent status record indicating whether you have reviewed and accepted the in-product data notice.
* Authentication tokens (Google OAuth access tokens and Supabase session tokens) held locally to keep you signed in.

---

## 3. How We Use and Handle Your Data

We use collected information solely for the following purposes:

1. **Creating Context Capsules**: To extract and format user intent, key decisions, constraints, and technical details from AI conversations you choose to capture.
2. **Cloud Synchronization**: To synchronize your saved capsules and folder structures across your devices when you are signed into an account.
3. **Quota & Rate Management**: To count monthly compression requests and apply fair-use limits.
4. **Product Support & Improvement**: To review user-submitted ratings and feedback to resolve technical issues.

### Commercial & Marketing Restrictions
* We do **not** sell, rent, monetize, or trade your personal information or chat content to third parties, data brokers, or advertisers.
* We do **not** use your personal information or conversation content to serve personalized, targeted, or interest-based advertisements.
* We do **not** use or transfer your data to assess creditworthiness or for lending purposes.
* We do **not** use your data for purposes unrelated to the core functionality of Capsule Infinity.

### Google API Limited Use Disclosure
The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

---

## 4. Storage, Security and Retention

### Storage
* **Local Storage**: By default, capsules, folder configurations, user settings, and session tokens are saved directly in your browser's local extension storage (`chrome.storage.local`).
* **Cloud Database**: For users who sign in to enable cloud sync, capsules, user usage records, and feedback entries are stored in a managed PostgreSQL cloud database hosted by Supabase.

### Security
* **Encryption in Transit**: All network communications between the extension, backend servers, and AI providers use secure Transport Layer Security (HTTPS/TLS).
* **Row Level Security (RLS)**: Cloud database tables for capsules and user usage enforce Row Level Security policies at the database layer, ensuring that authenticated users can access only their own records.

### Retention
* **Local Data**: Data stored in `chrome.storage.local` persists on your device until you delete individual items, clear your local data in settings, or uninstall the extension.
* **Cloud Data**: If cloud sync is enabled, your account identifiers, synced capsules, and usage counters are retained in the cloud database for as long as your account remains active.
* **AI Processing**: Conversation transcripts sent to our backend are relayed to third-party AI providers (Google Gemini and Groq) to generate the structured capsule summary, subject to their respective terms and retention practices.

---

## 5. Sharing and Disclosure

Capsule Infinity shares data only with the third-party infrastructure and service providers required to deliver the extension's features:

* **Supabase (Backend Infrastructure)**: Supabase Inc. provides cloud database storage, authentication management, and serverless Edge Functions. When signed in, your account identifiers and saved capsules are stored in Supabase. When performing AI compression, the extension transmits the conversation transcript to a Supabase Edge Function to coordinate AI processing. ([Supabase Privacy Policy](https://supabase.com/privacy))
* **AI Service Providers (Google Gemini & Groq)**: To generate structured capsule summaries, our backend relays conversation transcripts to generative AI providers:
  - **Google Gemini** (via Google AI Studio / Google Cloud API; see [Google Privacy Policy](https://policies.google.com/privacy) and [Google Gemini API Additional Terms](https://ai.google.dev/gemini-api/terms))
  - **Groq** (via GroqCloud API; see [Groq Privacy Policy](https://groq.com/privacy-policy/) and [Groq Terms of Service](https://groq.com/terms-of-service/))  
  Your conversation text is processed by these providers under their own applicable terms and privacy policies. Because capsule compression relies on these AI providers, capturing a conversation transmits the transcript to our backend server and these AI providers **regardless of whether you are signed into an account or using the extension anonymously**.
* **Google Identity Services**: Facilitates secure OAuth authentication when you choose to sign in, transmitting authentication tokens to verify your identity. ([Google Privacy Policy](https://policies.google.com/privacy))
* **Email Client / Gmail**: If you choose to share a team invite via email, the extension opens a standard Gmail compose window (`mail.google.com`) in your browser with draft text pre-filled. The extension does not access, read, or send emails on your behalf; sending is controlled entirely by you.
* **Teams Feature**: In this version of the extension, the Teams collaboration feature is disabled. No team data, member emails, or invite codes are sent to external key-value databases, Supabase, or any external servers.
* **Legal Requirements**: We may disclose information if required to do so by law, subpoena, or valid legal process.

---

## 6. Your Choices and Deletion

You have full control over your data stored within Capsule Infinity:

* **Deleting Individual Capsules**: You can delete any saved capsule at any time through the popup or side panel interface. Deleting a capsule removes it from your local storage and, if signed in, deletes the corresponding record from the cloud database.
* **Clear All Data (Local)**: You can wipe all locally stored capsules and reset folders at any time by selecting "Clear All Data" in the extension's side panel Settings.
* **Signing Out**: You can sign out at any time from the Account menu. Signing out clears active session tokens and cached profile details from your local device.
* **Sign Out and Clear Local Data (In-App)**: You can select "Sign out and clear local data" in the Account menu (in the popup or side panel). This action clears all local storage, removes local authentication tokens from your device, and resets the extension to a logged-out state. It does not delete your cloud account.
* **Cloud Account & Cloud Data Erasure**: To request permanent deletion of your cloud account record, cloud-synced capsules, and feedback entries from our cloud database, please email `capsuleinfinity.support@gmail.com`. We will verify and process your deletion request within 30 days.
* **Uninstalling the Extension**: You can uninstall Capsule Infinity at any time through your Chrome extensions manager (`chrome://extensions`). Uninstalling immediately deletes all data stored in `chrome.storage.local` on your device.

---

## 7. Children

Capsule Infinity is not directed to children under 13 years of age, and we do not knowingly collect personal information from children under 13. If you believe that a child under 13 has provided us with personal information, please contact us at `capsuleinfinity.support@gmail.com`, and we will promptly take steps to delete that information.

---

## 8. International Users

Our cloud and AI infrastructure providers (Supabase, Google, Groq) maintain servers in the United States and other regions. By using Capsule Infinity and enabling cloud features, you acknowledge that your information may be transferred to and processed in jurisdictions outside your country of residence, where privacy and data protection standards may differ from those in your home country.

---

## 9. Changes to This Privacy Policy

We may update this Privacy Policy periodically to reflect changes in our practices, features, or regulatory requirements. Any updates will be posted to this repository with an updated "Last Updated" date at the top of the policy.

---

## 10. Contact

If you have questions, feedback, or data privacy requests concerning this Privacy Policy, please contact us:

* **Developer:** Muhammad Ahmad
* **Email:** capsuleinfinity.support@gmail.com
* **GitHub Repository:** [https://github.com/ahmadiscoding/capsule-infinity-chrome-extension](https://github.com/ahmadiscoding/capsule-infinity-chrome-extension)
