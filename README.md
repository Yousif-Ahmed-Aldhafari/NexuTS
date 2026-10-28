# NexuTS

NexuTS is an AI-powered testing workspace built on Next.js, TypeScript, and Shadcn UI.  
It combines admin dashboards with QA-focused project and test-case management flows.

![NexuTS Dashboard](./media/dashboard.png)

## Features

- Authentication with NextAuth (credentials flow)
- Role-aware behavior (`ADMIN` and `USER`) for restricted actions
- QA Boards module with project and table management
- Test-case style entry workflows (status, assignment, metadata fields)
- Multiple dashboard sections (`default`, `crm`, `finance`, `execution`, `history`)
- i18n support (English and Arabic)
- Theme presets and layout controls (including sidebar and view-mode preferences)

## Tech Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS v4 + Shadcn UI
- Prisma ORM + SQLite (`prisma/dev.db`)
- NextAuth v5 (beta)
- TanStack Table, React Hook Form, Zod, Zustand
- Biome + Husky + lint-staged

## Container styling

Use `rounded-container` for cards, panels, dialogs, popovers, menus, and table wrappers.
Its shared `--container-radius` token is defined in `src/app/globals.css` as `0.75rem`
(12px at the default root font size) and stays consistent across theme presets.
Use directional variants such as `rounded-t-container` for surfaces attached to a screen edge,
and `rounded-[inherit]` for children that need to follow their parent's corners.
Buttons, inputs, icon tiles, badges, circular avatars, and chart marks retain their existing radii.

## Project Structure

```text
src/
  app/                  # Routes (auth, dashboard, API)
  actions/              # Server actions (auth/session flows)
  components/           # Shared and feature UI
  config/               # App-level configuration
  lib/                  # Utilities, auth helpers, i18n, Prisma client
  stores/               # Client state stores
prisma/
  schema.prisma         # Data model
  migrations/           # Database migrations
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create or update `.env` in the project root:

```bash
AUTH_SECRET="replace_with_a_long_random_secret"
DATABASE_URL="file:./dev-isolated.db"
```

Optional:

```bash
NEXT_PUBLIC_AUTOMATION_ENABLED="true"
```

### 3. Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Create production build
- `npm run start` - Run production server
- `npm run lint` - Run Biome linter
- `npm run format` - Format files with Biome
- `npm run check` - Run Biome checks
- `npm run check:fix` - Run and auto-fix Biome issues
- `npm run validate:clean` - Clean generated files, then format, lint, type-check, and build
- `npm run generate:presets` - Generate theme presets

## Database Notes

- SQLite requires an explicit `DATABASE_URL`; development and tests use `prisma/dev-isolated.db`.
- `prisma/dev.db` is a protected original and must not be modified.
- Review migration SQL and the Step 1.5 deployment notes before schema updates. Check status with:

```bash
DATABASE_URL=file:./dev-isolated.db npx --no-install prisma migrate status
```

## Security Note

Authentication lifecycle, verification delivery configuration, isolated regression tests, and deployment limitations are documented in [Phase 1 Step 1.5](docs/development/PHASE-1-STEP-1.5-SECURITY.md). Passwords use bcrypt; development and tests must use the isolated database.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution workflow and guidelines.

## License

This project is licensed under the [MIT License](./LICENSE).
