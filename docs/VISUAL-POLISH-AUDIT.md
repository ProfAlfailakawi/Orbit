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
