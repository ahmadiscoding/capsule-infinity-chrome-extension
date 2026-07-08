# Contribution Guidelines

Thank you for your interest in contributing to Capsule Infinity! Follow these guidelines to submit pull requests and report bugs.

## How to Contribute

### 1. Report Bugs & Request Features
* Check the current Issues list to see if your bug has already been reported.
* Open a new issue using the templates inside `.github/ISSUE_TEMPLATE/` and fill out the details.

### 2. Code Contributions
1. Fork the repository and create a new topic branch:
   ```bash
   git checkout -b feature/my-cool-feature
   ```
2. Implement your changes. Make sure you don't change core extension folder configurations or paths.
3. Validate format style matches vanilla JS templates:
   ```bash
   npm run test
   ```
4. Commit your edits with clean, descriptive logs:
   ```bash
   git commit -m "feat: add support for new AI platform DOM"
   ```
5. Push to your fork and submit a Pull Request to our main branch.