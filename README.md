# Capsule Infinity

![Hero Banner](source/assets/banners/hero_banner.jpg)

<div align="center">
  <h3>Enhance Your Browser. Extend Your World.</h3>
  <p>Capture full, complex AI chat conversations as portable, reusable context units (Capsules) and sync them across devices via Supabase Cloud.</p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
  [![Manifest Version: 3](https://img.shields.io/badge/Manifest-V3-purple.svg)](manifest.json)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
</div>

---

## 🌟 Introduction

### What is Capsule Infinity?
Capsule Infinity is a browser extension that captures conversations across multiple generative AI platform pages (ChatGPT, Claude, Gemini, DeepSeek), formats them with custom systemic prompt contexts, and serializes them into portable context structures called **Capsules**. 

### Why was it built?
Brainstorming or debugging code across different model engines (e.g. migrating a debugging thread from Claude to ChatGPT) forces you to start from scratch. You lose history, debugging steps, and custom specifications. Capsule Infinity allows you to bridge this context gap.

### The Problem it Solves
* **Context Fragmentation**: Model sessions are isolated.
* **Scraping Connection Dropouts**: Browsers drop extension message channels when text data exceeds 1MB.
* **Transient Browser Caches**: Local caches are unstable and cannot sync across devices.

---

## 🛠 Features Matrix

![Feature Cards](source/assets/banners/feature_banner.svg)

* **Lossless Context Compression Engine**: Automatically transforms long, fluff-filled AI transcripts into hyper-dense `# 🧠 CAPSULE CONTEXT` markdown, saving 80-90% of tokens while preserving 100% of code, exact variable names, and technical decisions.
* **Auto-Scroll Complete Scraper**: Smoothly scrolls dynamic containers to the top before capturing to guarantee 100% chat history coverage from message 1.
* **Asynchronous Chunking Pipeline**: Splits large payloads into 50KB segments to safely navigate browser messaging thresholds.
* **Lazy-Load Scraping Engine**: Safely queries DOM structures, gracefully handling dynamic list changes.
* **Supabase Cloud Sync**: Instantiates Supabase connection over authenticated PKCE Google OAuth sessions.
* **Local Fallback Cache**: Zero service interruption by writing to `chrome.storage.local` if network drops.
* **Branded Watermark Footers**: Muted copyright footer branding placed inside popup and sidebar views.

---

## ⚡ How It Works

![Workflow Diagram](source/assets/diagrams/workflow.svg)

1. **Capture**: Injected content scripts scrape the conversation DOM tree.
2. **Prepend & Chunk**: Adds custom systemic prompts and splits payload into 50KB chunks.
3. **Assemble**: Background service worker registers chunks and compiles them.
4. **Cache & Replicate**: Pushes serialized capsule records to the cloud database (with local fallback).

---

## 📸 Interface Guide

### Quick Actions Popup

![Popup Layout Breakdown](source/assets/diagrams/popup_explanation.svg)

* **Stats Cards**: Instantly displays saved count metrics.
* **Quick Actions**: Triggers injected overlays on the active tab page.
* **Recent List**: Displays the last 6 saved capsules ready to copy.

### 📸 Extension Screenshots Gallery

Here are screenshots of Capsule Infinity in action showing its beautiful light and dark modes, context capture overlays, and advanced options:

<div align="center">
  <table border="0">
    <tr>
      <td><img src="source/assets/screenshots/Screenshot%202026-07-08%20172724.png" width="380" alt="Capsule Infinity Screenshot 1"></td>
      <td><img src="source/assets/screenshots/Screenshot%202026-07-08%20172813.png" width="380" alt="Capsule Infinity Screenshot 2"></td>
    </tr>
    <tr>
      <td><img src="source/assets/screenshots/Screenshot%202026-07-08%20172909.png" width="380" alt="Capsule Infinity Screenshot 3"></td>
      <td><img src="source/assets/screenshots/Screenshot%202026-07-08%20172930.png" width="380" alt="Capsule Infinity Screenshot 4"></td>
    </tr>
    <tr>
      <td><img src="source/assets/screenshots/Screenshot%202026-07-08%20172943.png" width="380" alt="Capsule Infinity Screenshot 5"></td>
      <td><img src="source/assets/screenshots/Screenshot%202026-07-08%20172954.png" width="380" alt="Capsule Infinity Screenshot 6"></td>
    </tr>
  </table>
</div>

---

## 🚀 Quick Setup Guide

### Step 1: Get the Files
* **Option A (Easiest):** Click the Blue **Code** button at the top right ➔ **Download ZIP**, then **Extract/Unzip** the folder on your computer.
* **Option B (Developers):** Run this command in your terminal:
  ```bash
  git clone https://github.com/ahmadiscoding/capsule-infinity-chrome-extension.git
  ```

### Step 2: Load into Chrome / Brave
1. Open a new tab and go to `chrome://extensions/` (or `brave://extensions/`).
2. Turn **ON** Developer mode using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the **`source`** folder inside your project directory.

### Step 3: Setup Google Sign-In (Optional)
To enable multi-device cloud synchronization via Google:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
2. Navigate to **APIs & Services > Credentials** and create an **OAuth client ID** of type **Chrome App/Extension**.
3. Input your extension ID (found in `chrome://extensions/` after loading) into the configuration.
4. Open the extension's [manifest.json](file:///e:/Capsule%20Extension/capsule-infinity-chrome-extension/source/manifest.json) file and replace the `oauth2.client_id` value placeholder (`"YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"`) with your client ID.

🎉 **You're Done!** Just pin the Capsule Infinity icon to your toolbar for quick access.

## 📂 Project Architecture

![Component Map](source/assets/diagrams/component_diagram.svg)

* `manifest.json`: Configuration declarations.
* `background.js`: Main MV3 background service worker, coordinates OAuth, and handles sync pools.
* `/content-scripts/generic.js`: Scrapes DOM blocks and pushes chunked payloads.
* `/lib/storage.js`: Offline-first database API client (Supabase + Local fallback).
* `/lib/supabase-js.js`: Minified Supabase Client JS SDK.
* `/popup/` & `/sidebar/`: Panel view layouts and UI handlers.

---

## 🗺 Roadmap

![Roadmap Timeline](source/assets/diagrams/roadmap.svg)

* **Milestone 1: Core Performance (Completed)**: Scraper engine, chunked save queue, timeout guards.
* **Milestone 2: Cloud Sync (Completed)**: Supabase sync integration, Google Account PKCE auth, local cache fallback.
* **Milestone 3: Stage 2 LLM Integration (Planned / Upcoming)**: Direct backend LLM model integration. Transition from rule-based compression to strict JSON schemas, handle markdown fences safely via backend parsers, and execute empty field pruning.
* **Milestone 4: Workspace Collaboration (Planned / Upcoming)**: Multi-user organization team workspaces list, automated Supabase team schema migrations, and secure OTP/Invite key credentials exchange framework for cross-organization synchronization.
* **Milestone 5: Mobile Expansion (Planned / Future)**: Dedicated iOS and Android mobile apps alongside mobile browser extensions support to seamlessly carry capsules and prompt context across desktop and mobile devices.
* **Milestone 6: LLM Ecosystem & Chatbot Expansion**: Native support for the "Big 4" generative AI interfaces (ChatGPT, Claude, Gemini, and DeepSeek) with plans to expand scraper inject engines to additional enterprise chatbot platforms and open-source model interfaces (e.g., Hugging Face, OpenWebUI, LibreChat).

---

## ❓ FAQ

#### Why does it show "Authorization page could not be loaded"?
As the extension owner, ensure that your users' Chrome Extension redirect URL (e.g. `https://<extension-id>.chromiumapp.org/`) is whitelisted in your Supabase project dashboard under **Authentication > URL Configuration**.

#### Does it support Brave Browser?
Yes! If Brave blocks the login popup, click the Brave Shield icon and set cookies to "Allow all cookies" or turn off shields for the auth page temporarily.

---

## 🤝 Contributing

We welcome code contributions! See our **[Contributing Guidelines](CONTRIBUTING.md)** and **[Code of Conduct](CODE_OF_CONDUCT.md)** to get started.

---

## 📄 License

This project is licensed under the MIT License - see the **[LICENSE](LICENSE)** file for details.
