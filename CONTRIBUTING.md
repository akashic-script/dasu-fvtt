# Contributing to Daemon Summoner

Thank you for your interest in contributing to the Daemon Summoner FoundryVTT system! This document outlines our development
workflow and contribution guidelines.

## Communication Channels

- **GitHub Issues**: [Report bugs/requests](https://github.com/akashic-script/dasu-fvtt/issues)
- **Discord**: [Daemon Summoner (TBA)](https://discord.gg/) - `#fvtt-support`

## Prerequisites & Setup

- [Git](https://git-scm.com/)
- [Node.js LTS](https://nodejs.org)
- [VS Code](https://code.visualstudio.com/) (recommended)

**Setup:**

1. Clone the repository:
   ```bash
   git clone https://github.com/akashic-script/dasu-fvtt.git
   ```
2. Rename the folder to `dasu`:
   ```bash
   mv dasu-fvtt dasu
   ```
3. Move it to your FoundryVTT `Data/systems` directory:
   ```bash
   mv dasu /path/to/FoundryVTT/Data/systems/
   ```
4. In your terminal:
   ```bash
   cd /path/to/FoundryVTT/Data/systems/dasu
   npm install
   ```

## Branches & Workflow

- **main**: Stable releases (production)
- **dev**: Ongoing development (integration branch)
- **feature/**: Short-lived branches for features/fixes (from `dev`)
- **hotfix/**: Emergency fixes (from `main`)

**Open PRs into `dev` unless it's a hotfix.**

### Visual Flow

```
Main:     ●────●────●────●────●────●────●────●
          │    │    │    │    │    │    │    │
Dev:      ●────●────●────●────●────●────●────●
          │    │    │    │    │    │    │    │
Feature:      ●────●────●────●────●────●────●
Hotfix:           ●────●────●────●────●────●
```

## Development Steps

1. **Create a feature branch** from `dev`:
   ```bash
   git checkout dev
   git checkout -b feature/your-feature-name
   ```
2. **Write code** and commit using:
   ```bash
   npm run commit
   ```
   (Guided, conventional commit; pre-commit hooks will lint, format, and check your message.)
3. **Squash merge** your feature branch into `dev`:
   ```bash
   git checkout dev
   git merge feature/your-feature-name --squash
   git commit -m "feat: your feature description"
   git push origin dev
   ```
4. **Rebase dev onto main** for release:
   ```bash
   git checkout main
   git rebase dev
   git push origin main --force-with-lease
   ```
5. **Release** with:
   ```bash
   npm run release[:patch|minor|major]
   ```
   (Auto version bump, changelog, GitHub release.)
6. **Hotfixes**:
   ```bash
   git checkout main
   git checkout -b hotfix/critical-bug
   # fix the bug
   git add .
   npm run commit
   git push origin hotfix/critical-bug
   # PR to main, then:
   git checkout dev
   git rebase main
   git push origin dev --force-with-lease
   ```

## Tooling & Automation

- **ESLint/Prettier**: Lint & format code on commit and via scripts.
- **Husky/lint-staged**: Pre-commit automation (runs lint/format only on staged files).
- **Commitlint/Commitizen**: Enforces and guides conventional commits.
- **Release It!**: Automates versioning, changelog, and GitHub releases.

### Commit Message Examples

- `feat(actor): add summoning mechanic`
- `fix(css): resolve styling issues`
- `docs(readme): update instructions in README`

**Use scopes for clarity (e.g., `feat(actor): ...`).**
