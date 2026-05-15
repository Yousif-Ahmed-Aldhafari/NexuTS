# Deprecated Assets

These files were moved out of active source paths during cleanup because they are currently unreferenced by imports, routes, or runtime wiring.

## Sidebar components moved from active code
- `src/app/(main)/dashboard/_components/sidebar/account-switcher.tsx` -> `deprecated/sidebar/account-switcher.tsx.disabled`
- `src/app/(main)/dashboard/_components/sidebar/layout-controls.tsx` -> `deprecated/sidebar/layout-controls.tsx.disabled`
- `src/app/(main)/dashboard/_components/sidebar/nav-documents.tsx` -> `deprecated/sidebar/nav-documents.tsx.disabled`
- `src/app/(main)/dashboard/_components/sidebar/nav-secondary.tsx` -> `deprecated/sidebar/nav-secondary.tsx.disabled`
- `src/app/(main)/dashboard/_components/sidebar/nav-settings.tsx` -> `deprecated/sidebar/nav-settings.tsx.disabled`
- `src/app/(main)/dashboard/_components/sidebar/search-dialog.tsx` -> `deprecated/sidebar/search-dialog.tsx.disabled`
- `src/app/(main)/dashboard/_components/sidebar/theme-switcher.tsx` -> `deprecated/sidebar/theme-switcher.tsx.disabled`

Reason: all of them were unused in the current dashboard layout/sidebar composition (only commented references existed).

## Mock and proxy assets moved
- `src/data/users.ts` -> `deprecated/mocks/users.ts.disabled`
- `src/proxy.disabled.ts` -> `deprecated/proxy/proxy.ts.disabled`

Reason: no active references in the current app paths; preserved for potential future reuse.

## QA legacy component moved
- `src/app/(main)/dashboard/qa-boards/_components/qa-client.tsx` -> `deprecated/qa/qa-client.tsx.disabled`

Reason: component is currently unreferenced by imports/routes and contains duplicate hardcoded UI copy; preserved for possible future recovery.

