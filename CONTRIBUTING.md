# Contributing to Daemon Summoner

## Communication

- **GitHub Issues**: [Report bugs or requests](https://github.com/akashic-script/dasu-fvtt/issues)
- **Discord**: [Daemon Summoner (TBA)](https://discord.gg/) - `#fvtt-support`

## Prerequisites

- [Git](https://git-scm.com/)
- [Node.js LTS](https://nodejs.org)
- [VS Code](https://code.visualstudio.com/) (recommended)

## Setup

1. Clone the repo:

   ```bash
   git clone https://github.com/akashic-script/dasu-fvtt.git
   ```

2. Move and rename into your FoundryVTT `Data/systems` directory:

   ```bash
   mv dasu-fvtt /path/to/FoundryVTT/Data/systems/dasu
   cd /path/to/FoundryVTT/Data/systems/dasu
   npm install
   ```

## Branches

| Branch          | Purpose                                                                   |
| --------------- | ------------------------------------------------------------------------- |
| `main`          | Stable releases only. Never commit directly.                              |
| `dev`           | Integration branch. All features merge here.                              |
| `release/x.y.z` | Release prep. Branched from `dev`, merged into both `main` and `dev`.     |
| `feat/`         | New features. Branched from `dev`.                                        |
| `hotfix/`       | Emergency fixes. Branched from `main`, merged into both `main` and `dev`. |

## Feature Development

1. Branch from `dev`:

   ```bash
   git checkout dev
   git checkout -b feat/name-of-feature
   ```

2. Keep up to date:

   ```bash
   git fetch origin
   git merge origin/dev
   ```

3. Commit with the guided prompt:

   ```bash
   npm run commit
   ```

   Pre-commit hooks will lint, format, and validate your message.

4. Merge back into `dev`:

   ```bash
   git checkout dev
   git merge --no-ff feat/name-of-feature -m "feat: your feature description"
   git push origin dev
   git branch -d feat/name-of-feature
   ```

## Versioning

We use a Foundry version scheme, **not** strict SemVer. The version is
`MAJOR.MINOR.PATCH`, read as:

| Segment | Meaning                             | Bumped when                                                            |
| ------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `MAJOR` | Foundry VTT major version we target | We move to a new Foundry generation (e.g. 14 to 15). **Set manually.** |
| `MINOR` | New features                        | A release adds features. Use `npm run release:minor`.                  |
| `PATCH` | Fixes, hotfixes, and small changes  | A release only fixes things. Use `npm run release:patch`.              |

We currently target **Foundry v14**, so releases are `14.x.y` (first release:
`14.0.0`). When Foundry v15 ships and we verify against it, we jump to `15.0.0`.

Bump `MAJOR` by hand alongside the `compatibility` fields in `system.json`, never
via `release:major`. Breaking changes to our own data model go in the changelog
and release notes; they do not bump `MAJOR`.

## Release

1. Branch from `dev`:

   ```bash
   git checkout dev
   git checkout -b release/x.y.z
   ```

2. Run the release script:

   ```bash
   npm run release:minor   # new features
   npm run release:patch   # fixes / hotfixes only
   ```

   This bumps the version, generates the changelog, and creates a GitHub release.
   Do not use `release:major`; see [Versioning](#versioning).

3. Merge into `main` and tag:

   ```bash
   git checkout main
   git merge --no-ff release/x.y.z
   git tag -a vx.y.z -m "Release x.y.z"
   git push origin main --follow-tags
   ```

4. Merge back into `dev`:

   ```bash
   git checkout dev
   git merge --no-ff release/x.y.z
   git push origin dev
   git branch -d release/x.y.z
   ```

## Hotfixes

1. Branch from `main`:

   ```bash
   git checkout main
   git checkout -b hotfix/issue-name
   ```

2. Fix, commit, and push:

   ```bash
   npm run commit
   git push origin hotfix/issue-name
   ```

3. Merge into `main` and tag:

   ```bash
   git checkout main
   git merge --no-ff hotfix/issue-name
   git tag -a vx.y.z -m "Hotfix x.y.z"
   git push origin main --follow-tags
   ```

4. Merge back into `dev`:

   ```bash
   git checkout dev
   git merge --no-ff hotfix/issue-name
   git push origin dev
   git branch -d hotfix/issue-name
   ```

## Tooling

| Tool                         | Purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| ESLint + Prettier            | Lint and format on commit via lint-staged            |
| Husky                        | Runs pre-commit hooks                                |
| Commitlint + Commitizen      | Enforces and guides conventional commits             |
| Release It                   | Automates versioning, changelog, and GitHub releases |
| `@foundryvtt/foundryvtt-cli` | Pack/unpack compendium databases                     |

## Commit Message Format

```txt
type(scope): short description
```

Examples:

```txt
feat(actor): add summoning mechanic
fix(css): resolve sheet layout issue
docs(readme): update setup instructions
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `chore`, `perf`

Use scopes to clarify what area of the system is affected.
