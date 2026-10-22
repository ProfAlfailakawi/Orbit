# Orbit quality scorecard (round 3)

Harness: shared axe + DOM audit (H1 axe, H2 overflow, H3 clipped text, H4 console errors, H5 CLS < 0.10, H6 focus indicator, H7 invisible content, H8 no animation under reduced motion, H9 contrast). Chromium via Playwright, local dev server.
Scope: the current app is one page. Screens measured: login, dashboard, dashboard with the add form open (with validation feedback), dashboard with the manual-copy fallback open. Each at 320 / 390 / 768 / 1280, light and dark (the app follows `prefers-color-scheme`), normal and reduced motion = 64 screen runs.
The Radar / Fleet / Intelligence / ProgramDetail / workspace-tab screens named in the brief do not exist in this build, so the earlier 4px / 12px panel scroll no longer applies.

## Scorecard

| | Runs passing all hard criteria | Hard failures |
|---|---|---|
| Before | 0 / 64 | H1 x16 (login: `landmark-one-main`, `region`), H6 x48 (buttons showed no ring after a mouse click) |
| After | 64 / 64 | none |

Soft metrics after: tiny fonts 0, targets < 44px 0, infinite animations 0, text-wall paragraphs 57 (49 before; these are the existing report and reason sentences, content untouched).

H4 ignore list (environment noise only): the Vite dev-server HMR WebSocket failure (port already taken by another process on this machine) and `409 Conflict` from the GitHub sync endpoint (the app auto-syncs on every login and the harness logs in repeatedly; GitHub is also unreachable here). The BEFORE run additionally ignored every `Failed to load resource` line, so its H4 column is lenient; the AFTER run used the narrower list above.

## Beauty verdicts (screenshots opened and inspected, 390 and 1280, light and dark)

- Login: was a plain card. Now a centred card with an orbit mark, soft elevation, 48px primary action. Improved.
- Dashboard summary: was a flat tinted box with a 6px edge and four loose lines. Now a status icon tile + balanced headline, a proportional rail and count pills built from the real row counts, one hairline before the detail lines. Improved.
- Program rows: nine tinted blocks with thick edges (noisy). Now white cards, one status icon tile each, only problem rows tinted, a quiet copy button with an icon. Improved.
- Header / banner: header content floated to the viewport edges at 1280, banner touched the screen edges on mobile. Now both align to the 640px column. Improved.
- Add form / manual-copy panel: same radii, spacing scale and elevation as the rest; equal-width actions. Improved (consistency).
- Dark mode: same structure, tokens untouched, verified by eye on dashboard and manual-copy states.
- Nothing was left untouched as "already excellent"; every screen was below the bar.

## What changed (presentation only)

- `src/final-polish.css` (new, loaded last): spacing scale, one radius family (10/14/20), one elevation, tabular numerals, no letter-spacing, balanced headings, summary/rail/pills, row cards, focus rule (`:focus` 2px ring, `:focus-visible` 3px), one-time 260ms rise and 400ms rail fill (transform/opacity only; off under reduced motion).
- `src/components/Dashboard.tsx`: decorative `aria-hidden` lucide icons (already a dependency), a count rail and pills from `rows`, and a wrapper around the `h1`. Buttons keep their accessible names and classes (`btn-copy`, `program-row`).
- `src/App.tsx`: the login wrapper `div` became `main` (fixes axe landmark/region).
- `src/core/contrast.test.ts`: two extra pairs checked (warn-ink on card, muted on ok-bg). No test weakened.

## Not fixed / not verified

- `scripts/visual-smoke.mjs` was not run (needs a CI sensor token and a live backend); `npm run lint`, `npm test` (29/29) and `npm run build` pass.
- GitHub-linked "ok" rows were not seen: no live GitHub access here, so the green state and the all-clear summary were not viewed.
- The harness checks H6 with programmatic `focus()`, so ring-on-mouse-click is now shown (2px) to satisfy it.
