# Contributing to NetCanvas

Thanks for helping. Issues and pull requests are welcome — bug reports with a `.netcanvas.json`
that reproduces the problem are the most useful kind.

## Setup

```bash
npm install
npm run dev        # Vite dev server with hot reload
npm test           # vitest unit tests
npm run build      # dist/NetCanvas.html (single offline file)
npm run e2e        # Playwright smoke test against the built file
```

Node 20+ (22 recommended, see `.nvmrc`). No backend, no environment variables.

## Where things live

- `src/model/` — the data model (`types.ts`), geometry (ports, link routing, line jumps), diagram checks, auto-layout. Pure functions; add unit tests in `tests/`.
- `src/store/` — zustand store (undo/redo, icon-style resolution) and persistence (IndexedDB, files, library packs).
- `src/render/` — pure SVG renderers shared by the live canvas and the exporters. Anything drawn here appears in PNG/SVG/PDF too.
- `src/canvas/Canvas.tsx` — pointer interaction. Keep new gestures in the `Drag` union and the three pointer handlers.
- `src/panels/`, `src/editor/`, `src/viewer/` — UI.
- `src/library/` — built-in devices as data. See `docs/ICON_GUIDE.md`; review with `npm run sheet iso out.png`.

## Adding a device icon

1. Pick the base id (see the port table in `docs/ICON_GUIDE.md` / `docs/ICON_SPEC_MORE.md`). Both styles must use the same id scheme (`switch` ↔ `d-switch`), names, categories and **port names**, so a diagram can switch styles.
2. Draw it with the helpers in `src/library/draw.ts` in the matching file (`iso*.ts` or `detailed*.ts`).
3. `npm run sheet <id> /tmp/out.png 1300 2` and check it on dark and light canvases at diagram size.
4. `npm test` — a test verifies that every isometric device has a detailed counterpart with identical ports.

## Pull requests

- Keep PRs focused; describe the user-visible change and add a line to `CHANGELOG.md`.
- `npm run typecheck && npm test && npm run build` must pass (CI runs these plus the e2e smoke test).
- Changes to the file format must stay backwards compatible or come with a migration in `src/store/persistence.ts`.

## Code style

TypeScript strict, 2-space indent, single quotes, no default exports for components. Prefer small pure
functions in `model/` over logic inside components.
