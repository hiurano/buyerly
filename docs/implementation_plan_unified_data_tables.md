# Unified data-list architecture

## Goal

Make Ads Manager, Rules, and Statistics use one visual and interaction contract so that row height, spacing, radii, hover/focus states, group headers, and toolbar geometry are changed in one place.

## Design contract

- A 43px secondary toolbar accepts arbitrary tabs and actions.
- A list viewport owns scrolling and the shared 8px / 4px outer spacing.
- Data rows are 44px high, use an 8px radius, shared horizontal padding, and the same selected, focused, hover, and keyboard-focus states.
- Group headers are 36px high, sticky, and share the same chevron, dot, title, count, optional description, and optional create action.
- Column content remains feature-owned. Ads Manager supplies delivery metrics, Rules supplies conditions/actions, and Statistics supplies Spend, Leads, CPL, ROAS, and Change.
- Statistics may use a horizontal column canvas on narrow viewports; shared row geometry must not compress labels into unreadable text.

## Implementation

1. Add `ui/LinearDataList.tsx` with shared toolbar, viewport, stack, row, column header, and group header primitives.
2. Keep `CampaignGroupHeader` and `RuleGroupHeader` as thin compatibility wrappers around the shared group header.
3. Move Campaign, Ad set, Ad, and Rule rows onto the shared row primitive without changing their feature behavior.
4. Move the Ads Manager and Rules list containers and secondary toolbars onto the shared viewport and toolbar primitives.
5. Rebuild the Statistics table surface from the same toolbar, viewport, group header, column header, and row primitives; only its column schema and cell renderer remain local.

## Shared column headers

- Every list view defines a `LinearDataListColumn[]` schema containing id, label, width, alignment, visibility, and sorting capability.
- The header and every row consume the same schema and generated CSS Grid template. Local flex widths are not allowed for tabular cells.
- The header follows Linear Projects: transparent 32px row, 12px/450 labels, normal letter case, no enclosing surface or divider.
- Sortable labels are 24px pill buttons with 6px horizontal padding and a subtle hover state. Non-sortable labels remain plain text.
- Ads Manager supplies separate schemas for Campaigns, Ad sets, and Ads. Rules and Statistics supply their own schemas through the same component.
- Display-property toggles filter the schema itself, so a hidden property removes both its header and every corresponding cell.

## Definition of done

- One source controls common list geometry and interaction styling.
- Ads Manager, Rules, and Statistics render the same 44px row rhythm and 36px group-header rhythm.
- Existing selection, delivery toggles, grouping, filtering, and sidebars remain functional.
- Statistics retains readable columns and horizontal scrolling on narrow screens.
- TypeScript production build succeeds.
