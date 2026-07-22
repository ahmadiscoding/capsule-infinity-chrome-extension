# Contributing to Capsule Infinity

We welcome contributions from the open-source community! 

## Branching Strategy
* **`main`**: Represents the stable, production-ready release branch. It is only updated by merging from the `development` branch when a release is stable.
* **`development`**: The active integration branch for ongoing development, experimental updates, and bug fixes. All new pull requests and direct changes should target the `development` branch.

## Code Contributions
1. Create your feature or bugfix branch off of `development`:
   ```bash
   git checkout -b feature/my-new-feature development
   ```
2. Keep edits focused. Do not alter local script configurations inside `/lib` or modify the underlying messaging pipelines without discussing it in an issue first.
3. Write clean, commented vanilla JavaScript code.
4. Ensure your manifest remains valid:
   ```bash
   npm run lint:manifest
   ```
5. Submit a pull request targeting the `development` branch, explaining your changes and referencing any active issue IDs.
6. When a stable version is verified on `development`, it is merged into `main` and tagged with the version release number (e.g., `git tag v2.1.0`).