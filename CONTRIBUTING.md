# Contributing to NexuTS

Thanks for your interest in contributing to **NexuTS**.
This document explains how to set up your environment, ship safe changes, and submit pull requests.

## Code of Conduct

Please be respectful and constructive in all project discussions.

## Quick Start

1. Fork the repository:
   `https://github.com/yousifaldhafari-hue/NexuTS/fork`
2. Clone your fork:

   ```bash
   git clone https://github.com/YOUR_USERNAME/NexuTS.git
   cd NexuTS
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Configure environment variables by creating `.env` in the project root:

   ```bash
   AUTH_SECRET="replace_with_a_long_random_secret"
   ```

   Optional:

   ```bash
   NEXT_PUBLIC_AUTOMATION_ENABLED="true"
   ```

5. Start development:

   ```bash
   npm run dev
   ```

App runs on `http://localhost:3000`.

## Project Structure

Use these paths as a guide when deciding where to place changes:

```text
src/
  app/             # App Router routes (auth, dashboard, API)
  actions/         # Server actions and auth/session flows
  components/      # Shared and feature UI components
  config/          # App-level configuration
  lib/             # Utilities, i18n, Prisma/auth helpers
  stores/          # Client state stores
prisma/
  schema.prisma    # Data model
  migrations/      # Database migrations
```

## Branch and Commit Workflow

1. Create a branch for your work:

   ```bash
   git checkout -b feat/short-description
   ```

2. Make focused changes and keep commits clear.
3. Use conventional commit prefixes when possible:
   - `feat:`
   - `fix:`
   - `refactor:`
   - `docs:`
   - `chore:`

Example:

```bash
git commit -m "feat: add project filter to QA boards"
```

## Quality Checks

Run these before opening a pull request:

```bash
npm run format
npm run lint
npx tsc --noEmit
npm run build
```

Or run the full clean validation flow:

```bash
npm run validate:clean
```

Note:
- Husky pre-commit hooks and lint-staged run checks automatically on staged files.
- If checks fail, fix issues and commit again.

## Pull Request Checklist

Before submitting a PR, please ensure:

- The branch is up to date with `main`.
- Local checks pass.
- The PR description explains what changed and why.
- UI changes include screenshots or a short screen recording.
- Related issues are linked when applicable.

## Development Guidelines

- Prefer strict TypeScript types over `any`.
- Keep components small and reusable.
- Follow existing patterns in `src/components` and `src/lib`.
- Preserve accessibility (semantic markup, keyboard support, ARIA where needed).
- Avoid adding dependencies when existing utilities can solve the problem.
- For schema changes, include Prisma migration updates.

## Security

If you discover a security issue, do not open a public issue with exploit details.
Please report it privately to the maintainers first.

## Questions and Support

- Open a GitHub issue for bugs or feature requests:
  `https://github.com/yousifaldhafari-hue/NexuTS/issues`

Thanks for helping make NexuTS better.
