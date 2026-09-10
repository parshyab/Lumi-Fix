# LUMI Lens — Design Check

LUMI Lens is a TypeScript + React Figma plugin that checks the current selection or current page against live LUMI variables, text styles, and component metadata. It uses deterministic ranking only and does not make network or LLM calls.

## Run locally

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run build` produces the two files referenced by the manifest:

- `dist/code.js` — Figma main-thread code
- `dist/ui.html` — React UI entrypoint, with `dist/ui.js` and `dist/ui.css`

## Load in Figma

1. Run `npm run build`.
2. In Figma Desktop, open **Plugins → Development → Import plugin from manifest…**.
3. Select this repository’s `manifest.json`.
4. Open the plugin from **Plugins → Development → LUMI Lens — Design Check**.

The plugin scans only the active page. If there is no selection it falls back to the current page and shows that state in the UI. It never enables libraries automatically.

## Configuration to update when LUMI is available

The initial semantic rules and canonical names live in [src/config/lumi.ts](src/config/lumi.ts). Update these values from the live LUMI file as the system evolves:

- `approvedComponents` — add published LUMI component keys and names.
- `canonicalTextStyleNames` — add or remove approved text style names.
- `preferredTextStyleLineHeights` — keep the preferred `Label/Supporting Emphasized` line-height variant here.
- `tokenRules` and `primitivePatterns` — add semantic aliases and primitive naming patterns.

The plugin discovers variable keys and values at runtime. The LUMI library name and development-time library key are kept in configuration for discovery context; individual variable IDs and text-style IDs are never hardcoded.

## Known Figma API limitations

- The Plugin API can discover available team-library variable collections, but it cannot enable a library for the user. LUMI must be enabled in Figma Libraries before remote variables can be imported.
- Remote variables are intentionally imported only during Apply. Hover preview is available for already-imported local variables; remote-only suggestions show that preview is unavailable until applied.
- Component replacement is manual-review only. The plugin does not detach, reparent, swap, or restructure user layers.
- The API does not provide a universal library-owner field for every imported variable/style. LUMI ownership is verified by live library keys when available and otherwise surfaced conservatively for review.
- Mixed typography is scanned and applied per text range; missing fonts disable the typography fix rather than attempting to alter the document.
- Contrast is conservative: gradients, images, videos, mixed fills, or ambiguous ancestry produce “Contrast could not be determined automatically” instead of a false pass.
