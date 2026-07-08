# Capsule Infinity

![Hero Banner](assets/banners/hero_banner.jpg)

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

![Feature Cards](assets/banners/feature_banner.svg)

* **Asynchronous Chunking Pipeline**: Splits large payloads into 50KB segments to safely navigate browser messaging thresholds.
* **Lazy-Load Scraping Engine**: Safely queries DOM structures, gracefully handling dynamic list changes.
* **Supabase Cloud Sync**: Instantiates Supabase connection over authenticated PKCE Google OAuth sessions.
* **Local Fallback Cache**: Zero service interruption by writing to `chrome.storage.local` if network drops.
* **Branded Watermark Footers**: Muted copyright footer branding placed inside popup and sidebar views.

---

## ⚡ How It Works

![Workflow Diagram](assets/diagrams/workflow.svg)

1. **Capture**: Injected content scripts scrape the conversation DOM tree.
2. **Prepend & Chunk**: Adds custom systemic prompts and splits payload into 50KB chunks.
3. **Assemble**: Background service worker registers chunks and compiles them.
4. **Cache & Replicate**: Pushes serialized capsule records to the cloud database (with local fallback).

---

## 📸 Interface Guide

### Quick Actions Popup

![Popup Layout Breakdown](assets/diagrams/popup_explanation.svg)

* **Stats Cards**: Instantly displays saved count metrics.
* **Quick Actions**: Triggers injected overlays on the active tab page.
* **Recent List**: Displays the last 6 saved capsules ready to copy.

### 📸 Extension Screenshots Gallery

Here are screenshots of Capsule Infinity in action showing its beautiful light and dark modes, context capture overlays, and advanced options:

<div align="center">
  <table border="0">
    <tr>
      <td><img src="assets/screenshots/Screenshot%202026-07-08%20172724.png" width="380" alt="Capsule Infinity Screenshot 1"></td>
      <td><img src="assets/screenshots/Screenshot%202026-07-08%20172813.png" width="380" alt="Capsule Infinity Screenshot 2"></td>
    </tr>
    <tr>
      <td><img src="assets/screenshots/Screenshot%202026-07-08%20172909.png" width="380" alt="Capsule Infinity Screenshot 3"></td>
      <td><img src="assets/screenshots/Screenshot%202026-07-08%20172930.png" width="380" alt="Capsule Infinity Screenshot 4"></td>
    </tr>
    <tr>
      <td><img src="assets/screenshots/Screenshot%202026-07-08%20172943.png" width="380" alt="Capsule Infinity Screenshot 5"></td>
      <td><img src="assets/screenshots/Screenshot%202026-07-08%20172954.png" width="380" alt="Capsule Infinity Screenshot 6"></td>
    </tr>
  </table>
</div>

---

## 📥 Installation

Choose your preferred installation method:

### Method 1: Chrome / Brave (Developer Mode)

![Installation Infographic](assets/infographics/installation_infographic.svg)

1. **Download source ZIP** from this repository (or clone it: `git clone https://github.com/your-username/capsule-infinity.git`).
2. Go to **`chrome://extensions/`** or **`brave://extensions/`** in your browser.
3. Toggle the **Developer mode** switch in the top-right corner to **ON**.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the unzipped folder containing `manifest.json`.

---

## 📂 Project Architecture

![Component Map](assets/diagrams/component_diagram.svg)

* `manifest.json`: Configuration declarations.
* `background.js`: Main MV3 background service worker, coordinates OAuth, and handles sync pools.
* `/content-scripts/generic.js`: Scrapes DOM blocks and pushes chunked payloads.
* `/lib/storage.js`: Offline-first database API client (Supabase + Local fallback).
* `/lib/supabase-js.js`: Minified Supabase Client JS SDK.
* `/popup/` & `/sidebar/`: Panel view layouts and UI handlers.

---

## 🗺 Roadmap

![Roadmap Timeline](assets/diagrams/roadmap.svg)

* **Milestone 1: Core Performance (Completed)**: Scraper engine, chunked save queue, timeout guards.
* **Milestone 2: Cloud Sync (Completed)**: Supabase sync integration, Google Account PKCE auth, local cache fallback.
* **Milestone 3: Workspace Collaboration (In Progress)**: Team workspaces list, OTP dynamic dynamic invite codes.
* **Milestone 4: Offline Sync Queue (Future)**: Persistent sync queue, mobile browser compilation.

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
