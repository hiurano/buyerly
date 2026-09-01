# Statistics Decision Console — Prototype Plan

## Goal

Replace the disposable Statistics mockup with a deliberately simple first prototype of the desired media-buyer decision console. The prototype uses representative static data and is not constrained by the current analytics API.

## Product Sequence

The page must guide the user through one decision path:

`Context -> Live delivery -> Economics -> Result volume -> Where -> Why`

## Definition of Done

- The header establishes account scope, decision window, comparison baseline, attribution source, freshness, and provisional-data context.
- A compact live-today strip shows current spend, planned pace, delivering campaigns, and the provisional state of today's conversions.
- The overview contains exactly three first-screen cards: Spend & pace, Primary efficiency, and Primary results.
- The primary efficiency card compares the current value with a business target, not only with a previous period.
- A compact campaign table is the main workspace and shows campaign status, spend/budget, results, primary KPI versus target, and change.
- Row states distinguish on-target, watch, action-needed, and insufficient-data conditions using text as well as color.
- Selecting a campaign reveals a small diagnostic panel with secondary metrics; diagnostic metrics do not compete with the first-screen KPIs.
- The permanent large chart, draggable metric tray, and metric gallery are removed.
- The prototype remains visually consistent with Buyerly's existing Linear-inspired tokens and layout.
- No local test suites are run. A TypeScript/Vite build may be used as the implementation check.

## Implementation Steps

1. Define representative static summary, campaign, and diagnostic data in the Statistics feature.
2. Build the context header and live-today strip.
3. Build the three decision-oriented KPI cards.
4. Build the compact campaign table with restrained decision-state styling.
5. Add single-row selection and a lightweight diagnostic detail panel.
6. Verify the production build and inspect the scoped diff.

## Deferred

- Real API integration, persistence, and refresh behavior.
- Target configuration and attribution settings.
- Real campaign mutations such as pause, resume, and budget editing.
- Responsive/mobile refinement and final UX polish.
- Trend chart, advanced filtering, saved views, and customizable columns.
