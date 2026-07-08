# Folder Structure

Here is a breakdown of the Capsule Infinity files and folder layout.

![Folder Structure](../source/assets/diagrams/folder_structure.svg)

## Reorganized Layout
* `/source/`: Core extension package to load in Developer Mode.
  * `manifest.json`: Configuration manifest file containing permissions, background scripts, content injections, and extension IDs.
  * `background.js`: Main MV3 background service worker. Handles message parsing, authentication transitions, and cloud sync loops.
  * `/content-scripts/`:
    * `generic.js`: DOM parsing script injected into Gemini, Claude, and ChatGPT pages.
  * `/lib/`:
    * `storage.js`: CRUD interfaces for Chrome storage and Supabase database clients.
    * `supabase-js.js`: Local minified build of the official Supabase Client JS SDK.
    * `utils.js`: Text string counts, formatting tools, and systemic prompt configurations.
    * `api.js`: Client API helper.
  * `/popup/`:
    * `popup.html` & `popup.js`: Layout for the browser toolbar popup window.
  * `/sidebar/`:
    * `sidebar.html` & `sidebar.js`: Layout for the side panel panel library.
  * `/assets/`: Extension icons, screenshots, and visual documentation elements.
* `/database/`:
  * `supabase_schema.sql`: Postgres SQL queries to prepare database tables and configurations.
* Root Directory:
  * `README.md`: General user onboarding and setup instructions.
  * `LICENSE`: MIT License guidelines.
  * `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`: GitHub community policies.