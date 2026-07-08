# manifest.json Configuration

Capsule Infinity utilizes a Manifest V3 layout. Below is an explanation of the core configuration parameters.

## Configuration Details
* **`manifest_version`**: Must be set to `3` to adhere to modern Chromium security features.
* **`background`**:
  * `"service_worker": "background.js"`: Spawns the worker thread. Note that the type is **not** set to `"module"` so that standard scripts can be imported synchronously using `importScripts()`.
* **`content_scripts`**: Injects `generic.js` into specified AI platform domains (`chatgpt.com`, `claude.ai`, `gemini.google.com`, `deepseek.com`).
* **`web_accessible_resources`**: Exposes assets like icons and injected overlay panels so pages can load them.