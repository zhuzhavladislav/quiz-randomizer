# Contributing

Thanks for taking the time. Small, focused pull requests are easiest to review.

## Setup

```bash
nvm use            # Node.js 22, see .nvmrc
npm install
npm run dev        # both windows with hot reload
npm run typecheck
```

## Guidelines

- Keep the control window minimal and utilitarian; the board must stay readable from
  across a room.
- Every user-visible string goes to `src/shared/i18n.ts` in both Russian and English.
- The renderer is sandboxed: new main-process capabilities are exposed only through the
  typed bridge in `src/preload/index.ts`.
- Settings and theme fields are validated in `src/main/settings.ts` and
  `src/shared/theme.ts`; old files must keep loading, so add defaults for new fields.
- Run `npm run typecheck` before pushing; CI runs it on every pull request.

## Releases

Maintainers publish by pushing a `v*` tag; GitHub Actions builds the installers and
attaches them to the release.
