# Developer Guide

Follow these steps to set up Capsule Infinity for local development and test code edits.

## Prerequisites
* Install a Chromium-based browser (Google Chrome, Brave Browser, Microsoft Edge).
* Install Node.js (version 22+ recommended) for running developer commands.

## Setup Instructions

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/capsule-infinity.git
   cd capsule-infinity
   ```
2. Install developer dependencies (optional, for linting and formatting checks):
   ```bash
   npm install
   ```
3. Load the extension unpackaged inside `chrome://extensions/` by selecting the root repository folder.

## Running Tests & Checks
To run the automated format and code style checks, run:
```bash
npm run test
```
To validate the JSON format of your manifest files:
```bash
npm run lint:manifest
```