# ORBIT visual polish audit

Scope: presentation layer only (JSX markup, CSS). No logic, handlers, ids, API or data changes. Screenshots at 390 px and 1280 px, no horizontal overflow before or after.

## Inventory (15 UI files, 9 screens/components)

| Screen / component | Finding | Action |
|---|---|---|
| Login gate (`App.tsx` ~687) | Calm, single field and button | Left alone |
| App shell / header / sync banner (`App.tsx` ~760, 381) | Transient status banner repeats the reason list shown below; it carries state text | Left alone (dynamic status, guarded text) |
| ExecutiveOverview hero (`ExecutiveOverview.tsx`) | Three buttons, intentional hierarchy (primary vs ghost); floating chips duplicated footer and score row | Chips hidden on all widths (`observatory.css`) |
| Score row | Four tiles; `small` captions repeat on mobile and add height | Captions hidden under 760 px, tiles shorter |
| "ما يحتاج تدخّلك" link-issue list (`ExecutiveOverview.tsx` ~367) | Wall of 10 near-identical lines, about 280 px tall | Collapsed to a `<details>` with icon, count badge and chevron; all text kept; two-column grid when opened; copy button unchanged; dark variant and reduced-motion handled |
| Incident cards / empty state | Clear icon + short copy | Left alone |
| Program grid | Repeated status per card is real per-program data | Left alone |
| Quick-add form | Required by `visual-smoke.mjs` (role form name) | Left alone |
| WorkspaceOverview (Radar/Fleet/Intelligence/Operations) | "ملخص قابل للتنفيذ" kicker repeated in every tab, no information | Hidden via CSS; stat tiles and tiles already infographic |
| DynamicFleetView, UniversalRadarView, IntelligenceAndOpsView, ProgramDetailView, PWAInstallButton, Primitives | Large dense tool screens behind authentication; not rendered with demo data here | Examined by code only; not changed (risk exceeds benefit without live render) |

## Not verified
Only the dashboard (mobile/desktop, light) was rendered. Dark theme, Radar/Fleet/Intelligence/Governance, program detail and the Workspace kicker change were not rendered.

---

# Round 2 (elevation + motion)

Scope: presentation only. New layers `src/polish.css` (visuals) and `src/motion.css` (motion), imported last in `src/main.tsx`; two additive markup touches (below). No logic, handlers, ids, routes, data, API, workflow, dependency or test changes. Local-mode demo data, Playwright with `/opt/pw-browsers/chromium`, 1280 and 390 px, before/after viewed.

## Screens reached and viewed (before + after)
Login, dashboard, quick-add form, program detail (Summary tab), Radar, Fleet, Intelligence, Operations (reached with Alt+2..5), each with its "advanced tools" disclosure opened. Radar with real incident cards was also viewed after the smoke script created events. Not reachable: dark theme (`isDark` is a constant `false` in `App.tsx`, so `.orbit-dark` never renders); program-detail tabs other than Summary were not individually rendered; loading/error states of GitHub sync only seen as the transient banner.

## What changed, per screen
- **Shell / banner**: default sky-blue status banner now a calm indigo-tinted strip; drops in once.
- **Dashboard**: supporting copy inside white panels was pale hero-colour on white (unreadable), now muted ink; panel padding and elevation unified; empty state gets concentric rings around the icon; programs heading gets a count pill; per-program connection chip (real state) reduced from bordered pill to dot + label; status line separated with a dashed rule; footer gets a divider. Left alone: hero, buttons, score strip structure, card content, filter tabs, quick-add fields (smoke test depends on them).
- **Workspace tabs (Radar/Fleet/Intelligence/Operations)**: old cool-blue palette moved to the indigo observatory tokens (hero, stat tiles with circular icon chips and display-font numbers, tiles, case cards, blank state, footnote). Additive markup: a thin real-ratio rail (connected sources / registered programs on Fleet; proven / all criteria on Operations) with its numbers, `aria-hidden`, scaleX to the real ratio. Long Latin incident titles now wrap inside cards on mobile (they widened the grid and clipped on the left at 390 px before).
- **Program detail**: header card, pill buttons (primary dark, mint confirm), four-state box softened (no black border, violet heading), tabs as violet pills with a small active underline, hairlines in line colour. Tab bodies and the technical sections were left alone.
- **Advanced tool panels (UniversalRadar, DynamicFleet, Intelligence, ops tools)**: only accent colours harmonised (sky/blue buttons and text to night/violet, card radii). Dense engineering content, code blocks and tables untouched. Internal horizontal scroll inside the 390 px overlay dropped from 9/17 px to 4/12 px on Fleet/Intelligence advanced panels but is not zero (pre-existing wide content, see below).
- Markup touch 1: `ExecutiveOverview.tsx` dial arc gets `style={{'--arc': length}}` (same number as its existing dasharray) so the fill can animate. Touch 2: `WorkspaceOverview.tsx` rail described above.

## Motion inventory (all in `src/motion.css`, tokens `--m-ease: cubic-bezier(.2,.7,.2,1)`, `--m-fast/base/slow: 120/180/260ms`, `--m-step: 40ms`)
| What | Effect | Trigger |
|---|---|---|
| Hero copy lines | fade + rise 8px, 40ms stagger | mount, once |
| Fleet dial | core/labels/nodes fade; progress arc stroke-dashoffset to real coverage | mount, once |
| Score tiles (4) | fade + rise, 40ms stagger | mount |
| Tick bars | scaleY fill, grouped delays | mount |
| Coverage ring | fade + scale .94 | mount |
| Panels, program header/tools, footer, incident cards, add form | fade + rise | mount |
| Program cards | fade + rise, first 8 staggered 40ms, rest share last delay | mount (not on filter typing; keyed DOM reused) |
| Status banner | drop 6px + fade | mount |
| Overlay (backdrop, panel, tab body) | fade / rise 6-8px, cross-fade per workspace or program tab | mount of that content |
| Workspace stat tiles, fleet rows, tiles, case cards | fade + rise, capped stagger | mount |
| Rail fill, active program-tab underline | scaleX | mount |
| Disclosures (`details[open]` content) | opacity only, 180ms | open |
| Buttons / cards | press scale .98/.99; card hover lift (existing translateY) + shadow; arrow icons nudge 2px | hover / active |
Limits kept: transform, opacity, stroke-dashoffset (plus existing hover box-shadow transition); max 260ms (+ at most 360ms delay); single iteration; `animation-fill-mode: backwards` so the static style is the end state; everything inside `@media (prefers-reduced-motion: no-preference)`, so reduced motion applies none of it. Pre-existing loops (dial rotation, issue halo ping, hero glow, sync spinner) were not added by this round and are untouched (already gated by no-preference).
Not done: exit animations (React unmounts instantly; would need JS), skeleton shimmer (no genuine loading block exists), sliding nav indicator (needs measured positions/JS), focus-ring ease (outline-offset is not an allowed property), IntersectionObserver reveal (CSS mount animation used instead, so below-the-fold cards animate while offscreen).

## Measurements
- Horizontal overflow of the page: 0 px on every screen at 1280 and 390. Overlay panel internal overflow at 390: 0 on all main tabs; 4 px (Fleet advanced) and 12 px (Intelligence advanced) remain from existing wide engineering content (previously 9/17).
- Browser check (Playwright): with no preference, one-shot animations (iteration count 1) end with every checked element at opacity 1 / transform none after 1.5 s; with `reducedMotion: 'reduce'` zero `m-*` animations exist and all content is visible. Layout-shift score 0.04 in both modes (data arrival, same with motion disabled), none attributable to the new CSS.

## Verification run
`npm run lint` pass; `npm test` 19/19 pass; `npm run build` pass; `scripts/visual-smoke.mjs` PASS against a local server using a temporary copy that (a) points at the local Chromium and (b) ignores the one runtime message "WebSocket closed without opened" (Vite HMR port 24678 was taken by another session; unmodified script fails only on that environment-caused assertion). The temporary copy was not committed.

## Not verified
Dark theme (unreachable), every program-detail tab other than Summary, real GitHub-linked states, Safari/Firefox rendering, touch-device press feedback, the production service worker path.
