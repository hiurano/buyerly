import * as stylex from '@stylexjs/stylex';

/*
 * Buyerly's design tokens, as StyleX variables (#512). The keys keep their CSS
 * names, so index.css and the public website go on reading
 * var(--bg-canvas) and the rest. The buyerlyTokens() plugin in vite.config.ts
 * turns this file into the app's and the public website's token CSS: the
 * defaults on :root, `lightColors` on html[data-theme='light'].
 */

/** Colours, dark by default; `lightColors` below holds the light set. */
export const colors = stylex.defineVars({
  /* Exact Linear Dark Theme Colors */
  '--bg-window': 'lch(2.595% 0.4 272 / 1)', /* #09090a - Window Backdrop & Sidebar */
  '--bg-sidebar': 'lch(2.595% 0.4 272 / 1)', /* #09090a */
  '--bg-canvas': 'lch(5.52% 0.4 272 / 1)', /* #111212 - Floating Inset Canvas */
  '--color-border-primary': 'lch(9.84% 1.48 272 / 1)', /* #1a1b1d - Canvas Border & Dividers */
  '--color-border-secondary': 'lch(14.16% 1.48 272 / 1)',
  '--color-border-tertiary': 'lch(16.32% 1.48 272 / 1)',

  /* Resizer Highlights */
  /* Linear's resize spot and the sidebar edge's track, re-measured in dark on 2026-10-24. */
  '--resizer-line-color': 'lch(100% 0 0 / 0.15)',
  '--sidebar-resizer-track': 'lch(24.195% 1.48 272 / 1)',

  /* Typography Colors */
  '--text-primary': 'lch(100% 0 272 / 1)',
  '--text-secondary': 'lch(90.155% 1.2 272 / 1)',
  '--text-tertiary': 'lch(64.714% 1.425 272 / 1)',
  '--text-muted': 'lch(41.778% 1.425 272 / 1)',

  /* Shadows */
  '--canvas-shadow': '0px 0.5px 1px 1px lch(0% 0 0 / 0.3)',

  /* The canvas edge and the line under a view's title bar. */
  /* Linear's main and its title bar's line in dark, measured 17.10. */
  '--canvas-border': '0.5px solid lch(13.08% 1.48 272 / 1)',

  /* Linear's tooltip in dark (17.10): fill 12.72, 0.5px border 25.68, the canvas's
     shadow, label 91.178, shortcut keys outlined 20.28. */
  '--tooltip-bg': 'lch(12.72% 0.85 272 / 1)',
  '--tooltip-border': 'lch(25.68% 1.93 272 / 1)',
  '--tooltip-fg': 'lch(91.178% 1.425 272 / 1)',
  '--tooltip-kbd-border': 'lch(20.28% 1.93 272 / 1)',
  '--tooltip-shadow': 'lch(0% 0 0 / 0.3) 0 0.5px 1px 1px',
  '--dropdown-shadow': '0px 3px 8px 0px rgba(0, 0, 0, 0.125), 0px 2px 5px 0px rgba(0, 0, 0, 0.125), 0px 1px 1px 0px rgba(0, 0, 0, 0.125)',

  /* Linear's modal (New issue), measured in dark on 2026-10-24. */
  '--dialog-elevation-shadow': '0 4px 40px lch(0% 0 0 / 0.1), 0 3px 20px lch(0% 0 0 / 0.125), 0 3px 12px lch(0% 0 0 / 0.125), 0 2px 8px lch(0% 0 0 / 0.125), 0 1px 1px lch(0% 0 0 / 0.125)',
  '--app-scrollbar-bg': 'lch(37.275% 1.2 272 / 1)',
  '--app-scrollbar-bg-hover': 'lch(37.375% 1.2 272 / 1)',
  '--app-scrollbar-bg-active': 'lch(36.975% 1.2 272 / 1)',

  /* Semantic UI Tokens (Dark Default) */
  '--item-hover-bg': 'lch(8.445% 1.3 272 / 1)',
  /* A list group's collapse chevron, as Linear's (29.10): faint at rest, bright under the pointer. */
  '--group-chevron': 'lch(20.032% 7 272 / 1)',
  '--group-chevron-hover': 'lch(90.826% 1.425 272 / 1)',
  '--data-row-hover-bg': 'var(--item-hover-bg)',
  '--item-active-bg': 'lch(13.845% 1.3 272 / 1)',

  /* The sidebar's own text and fills (Linear's sit a step off the content's). */
  /* Linear's dark sidebar, measured live (17.10): idle 60.621, workspace name 90.155,
     Search under the cursor 10.149; hover 8.445 and current 13.845 as the items'. */
  '--sidebar-item-fg': 'lch(60.621% 1.2 272 / 1)',
  '--sidebar-item-fg-strong': 'var(--text-primary)',
  '--sidebar-item-hover-bg': 'var(--item-hover-bg)',
  '--sidebar-workspace-fg': 'lch(90.155% 1.2 272 / 1)',
  '--sidebar-icon-button-hover-bg': 'lch(10.149% 0.689 272 / 1)',

  /* Linear's disclosure triangle after a team's name in the sidebar. */
  '--sidebar-disclosure-fg': 'lch(35.024% 1.2 272 / 1)',

  /* The "›" between a team and its page in a header. */
  '--breadcrumb-separator-fg': 'lch(61.803% 1.2 272 / 1)',

  '--row-selected-bg': 'lch(13.2% 6 282 / 1)',
  '--inbox-unread-dot': 'lch(47.918% 59.303 288.421 / 1)', /* Linear unread notification dot */

  /* Linear Inbox Focus group headers and Priority / Other tabs, measured in dark Linear. */
  '--inbox-group-header-bg': 'lch(9.232% 0.85 272 / 1)',
  '--inbox-tab-bg': 'lch(10.149% 0.593 272 / 1)',
  '--inbox-tab-active-bg': 'lch(16.706% 0.979 272 / 1)',
  '--inbox-tab-fg': 'lch(61.803% 1.2 272 / 1)', /* inactive tab label and tab count */
  '--inbox-group-header-fg': 'lch(63.304% 1.425 272 / 1)',
  '--inbox-group-header-icon': 'lch(39.452% 1.425 272 / 1)',
  '--inbox-error-bg': 'lch(66% 80 48 / 1)',
  '--inbox-filter-bg': 'lch(9.345% 0.85 272 / 1)', /* Linear Inbox filter box */
  '--inbox-filter-chip-bg': 'lch(10.149% 0.689 272 / 1)',
  '--row-selected-hover-bg': 'lch(15.8% 6 282 / 1)',
  '--checkbox-checked-bg': 'lch(47.918% 59.303 288.421 / 1)', /* Linear accent */
  '--checkbox-checked-fg': 'lch(100% 5 288.421 / 1)',
  '--checkbox-border-hover': 'lch(52.418% 61.103 288.421 / 1)', /* Linear: the box under the pointer */
  '--dock-border': 'var(--color-border-secondary)',
  '--dock-clear-btn-bg': 'lch(13.861% 1.139 272 / 1)',
  '--command-menu-shadow': 'lch(0% 0 0 / 0.1) 0px 4px 40px 0px, lch(0% 0 0 / 0.125) 0px 3px 20px 0px, lch(0% 0 0 / 0.125) 0px 3px 12px 0px, lch(0% 0 0 / 0.125) 0px 2px 8px 0px, lch(0% 0 0 / 0.125) 0px 1px 1px 0px',

  /* Linear's Ctrl/Cmd+K, measured live in both themes (#311). */
  '--command-menu-bg': 'lch(12.72% 0.85 272 / 1)',
  '--command-menu-border': 'lch(21.36% 1.93 272 / 1)',
  '--command-menu-text': 'lch(91.178% 1.425 272 / 1)',
  '--command-menu-row-selected-bg': 'lch(20.82% 1.3 272 / 1)',
  '--command-menu-chip-bg': 'var(--command-menu-row-selected-bg)',
  '--command-menu-kbd-border': 'lch(17.04% 1.93 272 / 1)',
  '--toast-bg': 'var(--card-bg)',
  '--toast-shadow': '0 0 0 1px lch(100% 0 272 / 0.1), 0 6px 18px lch(0% 0 0 / 0.3), 0 3px 9px lch(0% 0 0 / 0.3), 0 1px 1px lch(0% 0 0 / 0.2)',
  '--toast-success-icon': '#4cb782',
  '--toast-error-icon': '#f87171',
  '--toast-warning-icon': '#f0bf00', /* Linear's yellowBase, same in both themes */
  '--session-current-text': '#4cb782', /* Linear's green "Current session" */

  /* Destructive confirmation: Linear's red, not the decision colours. */
  '--action-danger': 'lch(58% 73 29 / 1)',
  '--action-danger-hover': 'lch(53% 73 29 / 1)',
  '--action-danger-text': 'lch(100% 5 286.91 / 1)',
  '--tab-active-bg': 'lch(16.706% 0.979 272 / 1)',
  '--tab-inactive-bg': 'transparent',
  '--sidebar-card-border': 'var(--card-border)',
  '--sidebar-tab-active-bg': 'var(--tab-active-bg)',
  '--sidebar-tab-hover-bg': 'var(--item-hover-bg)',
  '--sidebar-tab-inactive-bg': 'var(--card-bg)',
  '--sidebar-tab-active-text': 'var(--text-primary)',
  '--sidebar-tab-hover-text': 'var(--text-secondary)',
  '--sidebar-tab-inactive-text': 'var(--text-tertiary)',
  '--sidebar-tab-active-shadow': '0 0 0 1px lch(100% 0 272 / 0.16)',
  '--sidebar-tab-inactive-shadow': '0 0 0 1px lch(100% 0 272 / 0.1)',
  '--sidebar-tab-hover-shadow': '0 0 0 1px lch(100% 0 272 / 0.16)',
  '--card-bg': 'lch(9.232% 0.85 272 / 1)',
  '--card-border': 'lch(13.553% 1.93 272 / 1)',
  '--dock-bg': 'lch(9.232% 0.85 272 / 1)',
  '--dock-btn-bg': 'lch(13.861% 1.139 272 / 1)',
  '--checkbox-border-rest': 'lch(48.72% 1.48 272 / 1)',

  /* BuyerlyToggle, as Linear's (off measured 2026-10-01, on and the knob 2026-10-18). */
  /* Members → Status: Linear's Admin badge, measured 2026-10-10. */
  '--role-badge-bg': 'lch(48% 59.31 288.43 / 0.2)',

  /* Linear's Settings → Members in dark (17.10). */
  '--settings-list-group-bg': 'lch(7.32% 0.85 272 / 1)',
  '--settings-list-group-count': 'lch(36.975% 1.2 272 / 1)',
  '--settings-list-row-hover-bg': 'lch(9.345% 0.85 272 / 1)',
  '--settings-list-muted': 'lch(61.803% 1.2 272 / 1)',
  '--settings-list-search-bg': 'lch(10.149% 0.689 272 / 1)',
  '--settings-list-search-border': 'lch(27.12% 1.48 272 / 1)',
  '--settings-list-search-border-hover': 'lch(24.32% 6.48 272 / 1)',
  '--role-badge-fg': 'lch(80% 80 288.43 / 1)',
  '--toggle-unchecked-bg': 'lch(47.551% 0.913 272 / 1)',
  '--toggle-unchecked-hover-bg': 'lch(56.807% 1.019 272 / 1)',
  '--toggle-checked-bg': 'lch(47.918% 59.303 288.421 / 1)',
  '--toggle-checked-hover-bg': 'lch(52.418% 61.103 288.421 / 1)',
  '--toggle-knob': 'lch(100% 5 288.421 / 1)',
  '--focus-ring-color': '#6d78d5',
  '--action-primary': '#5e6ad2',
  '--action-primary-hover': '#6875e5',

  /* The main button, as Linear's (2026-10-18): its accent, the same as a switch that is on,
     lighter under the cursor in dark and darker in light, with near-white text. */
  '--button-primary-bg': 'var(--toggle-checked-bg)',
  '--button-primary-hover-bg': 'var(--toggle-checked-hover-bg)',
  '--button-primary-text': 'lch(100% 5 288.421 / 1)',

  /* Snooze Custom… calendar: weekend columns, measured in Linear. */
  '--calendar-weekend-bg': 'lch(13.553% 1.93 272 / 1)',
  '--calendar-selected-bg': 'var(--action-primary)',
  '--calendar-selected-fg': '#ffffff',
  '--calendar-cancel-bg': 'var(--color-border-secondary)',
  '--calendar-cancel-fg': 'var(--text-secondary)',
  '--calendar-cancel-shadow': 'none',
  '--calendar-apply-bg': 'var(--action-primary)',
  '--calendar-apply-fg': '#ffffff',
  '--calendar-apply-shadow': 'none',

  /* Add Filter command menu */
  '--filter-menu-border': 'var(--color-border-secondary)',
  '--filter-menu-divider': 'var(--color-border-secondary)',
  '--filter-menu-text': 'var(--text-secondary)',
  '--filter-menu-text-active': 'var(--text-primary)',
  '--filter-menu-muted': 'var(--text-tertiary)',

  /* Linear: a highlighted menu row is ~8 lightness above the menu (12.7 → 20.8). */
  '--filter-menu-highlight': 'lch(17.3% 1.3 272 / 1)',
  '--menu-item-highlight': 'var(--filter-menu-highlight)',
  '--filter-checkbox-border': 'lch(54.1% 0 272 / 1)',
  '--filter-checkbox-selected': '#5e6ad2',

  /* Linear's "Agent" tag under From is outlined lighter than the menu's own border. */
  '--filter-badge-border': 'lch(23.5% 1.9 272 / 1)',
  '--filter-trigger-bg': 'transparent',
  '--filter-trigger-active-bg': 'var(--tab-active-bg)',

  /* Round icon buttons by Filter / Display options / details (see .buyerly-header-button),
     as Linear's in dark (17.10): icon 61.803; bare in a header, hover 14.006, open 18.634;
     on a tab row 10.149 with a 0.137 ring and a shadow, hover 14.777 (ring 0.229), open 18.634. */
  '--header-button-fg': 'lch(61.803% 1.2 272 / 1)',
  '--header-button-hover-bg': 'lch(14.006% 0.593 272 / 1)',
  '--header-button-active-bg': 'lch(18.634% 1.075 272 / 1)',
  /* A list cell's property button (Linear's DetailsProperty), as Rules' empty cell in Ads Manager (29.10). */
  '--property-fg': 'var(--header-button-fg)',
  '--property-hover-bg': 'lch(14.006% 0.593 272 / 1)',
  '--toolbar-button-bg': 'lch(10.149% 0.689 272 / 1)',
  '--toolbar-button-hover-bg': 'lch(14.777% 1.075 272 / 1)',
  '--toolbar-button-active-bg': 'lch(18.634% 1.075 272 / 1)',
  '--toolbar-button-ring': '0 0 0 0.5px lch(100% 0 0 / 0.137), 0 0.5px 1px 1px lch(0% 0 0 / 0.3)',
  '--toolbar-button-ring-hover': '0 0 0 0.5px lch(100% 0 0 / 0.229), 0 0.5px 1px 1px lch(0% 0 0 / 0.3)',
  '--toolbar-button-ring-active': '0 0 0 0.5px lch(100% 0 0 / 0.229)',
  /* Their keyboard focus ring: Linear's accent, 1px (28.10, #556). */
  '--header-button-focus-ring': 'lch(47.918% 59.303 288.421 / 1)',
  '--filter-menu-shadow': 'var(--dropdown-shadow)',
  '--filter-menu-strong-shadow': '0px 9px 48px lch(0% 0 0 / 0.28), 0px 6px 24px lch(0% 0 0 / 0.24), 0px 1px 1px lch(0% 0 0 / 0.3)',

  /* Rules list: semantic surfaces shared by list, groups and property badges. */
  '--rules-group-bg': 'lch(9.232% 0.85 272 / 1)',

  /* Hairline of a list's sub-group header, as Linear's (measured 2026-10-22, 0.5px). */
  '--list-subgroup-line': 'lch(22.193% 1.93 272 / 1)',

  /* Display options' "Set default for everyone", Linear's accent text (measured 2026-10-22). */
  '--display-footer-accent': 'lch(60.303% 70 288.421 / 1)',
  '--rules-group-hover-bg': 'lch(13.845% 1.3 272 / 1)',
  '--rules-row-hover-bg': 'lch(8.445% 1.3 272 / 1)',
  '--rules-row-focus-bg': 'lch(11.033% 1.3 272 / 1)',
  '--rules-property-bg': 'rgba(255, 255, 255, 0.06)',
  '--rules-property-border': 'rgba(255, 255, 255, 0.08)',
  '--rules-property-text': 'lch(85% 1.2 272 / 1)',
  '--rules-scope-bg': 'rgba(255, 255, 255, 0.04)',
  '--rules-scope-text': 'lch(68% 1.2 272 / 1)',
  '--rules-action-stop-bg': 'rgba(239, 68, 68, 0.14)',
  '--rules-action-stop-border': 'rgba(239, 68, 68, 0.25)',
  '--rules-action-stop-text': '#f87171',
  '--rules-action-positive-bg': 'rgba(16, 185, 129, 0.14)',
  '--rules-action-positive-border': 'rgba(16, 185, 129, 0.25)',
  '--rules-action-positive-text': '#34d399',
  '--rules-action-default-bg': 'rgba(59, 130, 246, 0.14)',
  '--rules-action-default-border': 'rgba(59, 130, 246, 0.25)',
  '--rules-action-default-text': '#60a5fa',

  /* Preferences Specific Tokens (Dark default) */
  '--preferences-card-bg': 'lch(9.232% 0.85 272 / 1)',
  '--preferences-control-bg': 'lch(13.861% 1.139 272 / 1)',
  '--preferences-control-hover': '#2b2c2e',
  '--preferences-active-bg': 'lch(13.845% 1.3 272 / 1)',
  '--preferences-row-hover-bg': 'lch(13.058% 1.3 272 / 1)', /* Linear's settings row under the pointer */

  /* Settings → Notifications → Push notifications, measured in dark Linear */
  '--preferences-channel-icon-bg': 'lch(11.033% 1.3 272 / 1)',
  '--preferences-channel-icon-fg': 'lch(63.304% 1.425 272 / 1)',
  '--preferences-row-link-fg': 'lch(39.452% 1.425 272 / 1)',
  '--preferences-channel-on': 'lch(60% 64.37 141.95 / 1)',
  '--preferences-channel-off': 'lch(39.452% 1.425 272 / 1)',
  '--preferences-search-bg': 'lch(7.32% 0.85 272 / 1)',
  '--preferences-search-border': 'lch(18.48% 1.48 272 / 1)',

  /* Linear's settings in dark (17.10): card ring 0.083, a control's ring 0.143
     (0.238 and fill 18.49 under the cursor). */
  '--preferences-card-ring': '0 0 0 0.5px lch(100% 0 0 / 0.083)',

  /* Linear's settings in dark (17.10): the hairline between rows, a field's border. */
  '--preferences-divider': 'lch(100% 0 0 / 0.083)',
  '--preferences-input-border': 'lch(30.833% 1.93 272 / 1)',
  '--preferences-avatar-ring': 'transparent',
  '--preferences-control-ring': '0 0 0 0.5px lch(100% 0 0 / 0.143)',
  '--preferences-control-ring-hover': '0 0 0 0.5px lch(100% 0 0 / 0.238)',
  '--preferences-control-hover-bg': 'lch(18.49% 1.525 272 / 1)',
  '--preferences-menu-bg': 'lch(11.5% 1.1 272 / 1)',
  '--preferences-menu-border': 'lch(20.032% 1.93 272 / 1)',
  '--preferences-menu-hover': 'lch(18% 1.2 272 / 1)',
  '--preferences-accent': '#5e69d1',
  '--preferences-aa-system-bg': '#111212',
  '--preferences-aa-system-fg': '#e2e3e5',

  /* Linear bgModalOverlay: black at 40% in dark themes, 25% in light. */
  '--modal-overlay-bg': 'rgb(0 0 0 / 0.4)',

  /* A view's details pane and its quick filters, measured in dark Linear on 2026-10-09 (#367). */
  '--details-pane-backdrop': 'var(--bg-canvas)',
  '--details-pane-resizer-track': 'var(--split-resizer-track)',
  '--details-pane-resizer-indicator': 'var(--split-resizer-indicator)',

  /* Linear's split view edge (Inbox list), measured in dark on 2026-10-24. */
  '--split-resizer-track': 'lch(27.12% 1.48 272 / 1)',
  '--split-resizer-indicator': 'lch(100% 0 0 / 0.15)',

  /* Linear's Help button and menu at the sidebar's foot, measured in dark on 2026-10-24. */
  '--help-button-fg': 'lch(60.621% 1.2 272 / 1)',
  '--help-button-hover-bg': 'lch(10.149% 0.689 272 / 1)',
  '--help-button-hover-fg': 'lch(100% 0 272 / 1)',
  '--help-menu-bg': 'lch(12.72% 0.85 272 / 1)',
  '--help-menu-border': 'lch(25.68% 1.93 272 / 1)',
  '--help-menu-fg': 'lch(91.178% 1.425 272 / 1)',
  '--help-menu-fg-highlighted': 'lch(100% 0 272 / 1)',
  '--help-menu-highlight': 'lch(20.82% 1.3 272 / 1)',
  '--help-menu-secondary': 'lch(64.714% 1.425 272 / 1)',
  '--help-menu-timeline': 'lch(21.36% 1.93 272 / 1)',
  /* Its search row, empty note and focus ring (#558), measured in dark on 2026-10-28. */
  '--help-menu-divider': 'lch(20.28% 1.93 272 / 1)',
  '--help-menu-empty': 'lch(41.778% 1.425 272 / 1)',
  '--help-focus-ring': 'lch(47.918% 59.303 288.421 / 1)',
  '--row-menu-chevron': 'lch(41.778% 1.425 272 / 1)',
  '--favorite-star': 'lch(80% 90 85 / 1)',
  '--favorite-number-border': 'lch(20.28% 1.93 272 / 1)',
  '--bell-checkbox-border': 'lch(55.92% 1.93 272 / 1)',
  '--row-menu-separator': 'lch(20.28% 1.93 272 / 1)',

  /* Linear's keyboard shortcuts panel, measured in dark on 2026-10-24. */
  '--shortcuts-panel-bg': 'lch(9.232% 0.85 272 / 1)',
  '--shortcuts-panel-border': 'lch(13.553% 1.93 272 / 1)',
  '--shortcuts-title': 'lch(100% 0 272 / 1)',
  '--shortcuts-label': 'lch(63.304% 1.425 272 / 1)',
  '--shortcuts-key-border': 'lch(16.793% 1.93 272 / 1)',
  '--shortcuts-input-border': 'lch(30.833% 1.93 272 / 1)',
  '--details-pane-card-bg': 'var(--card-bg)',
  '--details-pane-card-border': 'var(--card-border)',
  '--details-pane-card-shadow': '0px 0.5px 1px 1px lch(0% 0 0 / 0.3)',
  '--details-tabs-bg': 'var(--card-bg)',
  '--details-tab-bg': 'lch(13.861% 1.043 272 / 1)',
  '--details-tab-hover-bg': 'lch(17.718% 1.043 272 / 1)',
  '--details-tab-active-bg': 'lch(20.418% 1.429 272 / 1)',
  '--details-tab-fg': 'lch(63.304% 1.425 272 / 1)',
  '--details-tab-hover-fg': 'lch(90.826% 1.425 272 / 1)',
  '--details-tab-active-fg': 'lch(100% 0 272 / 1)',
  '--details-tab-shadow': 'none',
  '--details-select-bg': 'lch(13.861% 1.139 272 / 1)',
  '--details-select-fg': 'lch(90.826% 1.425 272 / 1)',
  '--details-row-bg': 'var(--card-bg)',
  '--details-row-hover-bg': 'lch(13.058% 1.3 272 / 1)',
  '--details-row-active-bg': 'lch(11.033% 1.3 272 / 1)',
  '--details-row-fg': 'lch(90.826% 1.425 272 / 1)',
  '--details-row-count-fg': 'lch(63.304% 1.425 272 / 1)',
  '--details-row-link-fg': 'var(--text-primary)',
  '--details-pane-scrim': 'rgb(0 0 0 / 0.4)',
  '--board-card-ring': 'lch(100% 0 0 / 0.083)',
  '--board-lane-bg': 'lch(7.32% 0.85 272 / 1)', /* #161617 */
  '--site-bg': '#08090a',
  '--site-fg': '#f7f8f8',
  '--site-fg-secondary': '#d0d6e0',
  '--site-fg-tertiary': '#8a8f98',
  '--site-fg-quaternary': '#62666d',
  '--site-line': 'rgb(255 255 255 / 0.08)',
  '--site-divider': '#23252a',
  '--site-hover-bg': 'rgb(255 255 255 / 0.08)',
  '--site-invert-bg': '#e5e5e6',
  '--site-invert-fg': '#08090a',
  '--site-header-bg': 'linear-gradient(rgb(11 11 11 / 0.8), rgb(18 18 18 / 0.76))',
  '--site-header-fade': 'linear-gradient(#08090a, rgb(0 0 0 / 0))',
  '--site-hero-floor': '#d0d6e0',
  '--site-fig-hi': '#d0d6e0',
  '--site-fig-mid': '#3e3e44',
  '--site-fig-low': '#2e2e32',
  '--site-panel-bg': '#0f1011',
  '--site-logo': '#fff', /* monochrome mark (#432): white in dark, Linear's #222326 in light */
  '--logo-avatar-bg': 'lch(90.451% 1.2 272 / 1)', /* Linear's logo disc (#557): #e3e4e6 in dark, #2f2f31 in light */
  '--site-background': 'var(--site-bg)',
  '--site-border-color': 'var(--site-line)',
});

/** Gaps, paddings and offsets. */
export const space = stylex.defineVars({
  '--facet-sidebar-gap': '8px',
  '--facet-empty-padding': '24px',
  '--toast-offset-right': '24px',
  '--toast-offset-bottom': '52px',
  '--toast-gap': '8px',
  '--toast-padding': '12px',
  '--site-gutter': 'clamp(24px, 5.4vw, 78px)',
  '--site-space-xs': '8px',
  '--site-space-sm': '16px',
  '--site-space-md': '24px',
  '--site-space-lg': '40px',
  '--site-space-xl': '64px',
  '--site-section-space': 'clamp(56px, 8vw, 112px)',
  '--site-hero-space': 'clamp(88px, 12vw, 176px)',
  '--site-footer-gap': 'clamp(32px, 6vw, 88px)',
  '--site-focus-offset': '4px',
});

/** Corner radii. */
export const radii = stylex.defineVars({
  '--canvas-border-radius': '12px',
  '--control-border-radius': '8px',
});

/** Font families, weights, sizes and leading. */
export const type = stylex.defineVars({
  '--font-monospace': '"Berkeley Mono", "SFMono Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace',
  '--font-regular': '"Inter Variable", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Linear Thai", sans-serif',
  '--facet-font-size': '13px',

  /* Typography Weights & Settings */
  '--font-weight-normal': '450',
  '--font-weight-medium': '500',
  '--font-weight-semibold': '600',
  '--font-weight-bold': '700',
  '--site-brand-size': '22px',
  '--site-body-size': '16px',
  '--site-small-size': '13px',
  '--site-heading-size': 'clamp(40px, 5vw, 64px)',
  '--site-heading-leading': '1.06',
  '--site-heading-tracking': '-0.035em',
  '--site-section-size': '24px',
  '--site-lead-size': 'clamp(18px, 2vw, 22px)',
  '--site-body-leading': '1.7',
});

/** Fixed sizes of the frame, toasts and the public website, and stacking layers. */
export const layout = stylex.defineVars({
  '--sidebar-width': '244px',
  '--header-height': '44px',
  '--facet-row-height': '42px',

  /* Scrollbars */
  '--scrollbar-width': '10px',
  '--scrollbar-min-size': '32px',

  /* Above the app sidebar (96) and its resize handle (97). */
  '--layer-command-menu': '100',

  /* Toasts sit over everything except a modal dialog (500). */
  '--layer-toast': '110',

  /* Toasts: Linear's notification region, measured in the product on 2026-09-25. */
  '--toast-width': '384px',
  '--site-width': '1280px',
  '--site-reading-width': '624px',
  '--site-header-height': '73px',
  '--site-logo-size': '32px',
  '--site-footer-brand-width': '440px',
  '--site-focus-width': '2px',
  '--site-border-width': '1px',
});

/** Durations and easings. */
export const motion = stylex.defineVars({
  '--speed-highlightFadeIn': '0s',
  '--speed-highlightFadeOut': '0.15s',
  '--speed-quickTransition': '0.1s',
  '--speed-regularTransition': '0.25s',
  '--ease-out-quad': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  '--ease-out-cubic': 'cubic-bezier(0.215, 0.61, 0.355, 1)',
  '--motion-dock-enter-duration': '450ms',
  '--motion-toast-enter-duration': '180ms',
  '--site-ease': 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
});

/** Linear's light theme; the boot script in index.html sets data-theme from Settings or the system. */
export const lightColors = stylex.createTheme(colors, {
  /* Linear Light Theme Colors */
  '--bg-window': 'lch(94.44% 0.5 282 / 1)', /* #eeeef0 - Window Backdrop & Sidebar */
  '--bg-sidebar': 'lch(94.44% 0.5 282 / 1)', /* #eeeef0 */
  '--bg-canvas': 'lch(97.94% 0.5 282 / 1)', /* #f9f8fb - Floating Inset Canvas */
  '--color-border-primary': 'lch(95.24% 0 282 / 1)', /* #f1f0f0 - Canvas Border & Divider */
  '--color-border-secondary': 'lch(88.49% 0 282 / 1)', /* #dedfdf */
  '--color-border-tertiary': 'lch(84.44% 0 282 / 1)', /* #d3d3d3 */

  /* Resizer Highlights */
  '--resizer-line-color': 'lch(0% 0 0 / 0.95)',
  '--sidebar-resizer-track': 'lch(80.94% 0 282 / 1)',

  /* Typography Colors */
  '--text-primary': 'lch(9.794% 0 282 / 1)', /* #1a1b1a */
  '--text-secondary': 'lch(19.588% 1.25 282 / 1)', /* #2f2f31 */
  '--text-tertiary': 'lch(39.176% 1.25 282 / 1)', /* #5d5d5e */
  '--text-muted': 'lch(64.64% 1.25 282 / 1)', /* #9d9d9e */

  /* Shadows */
  '--canvas-shadow': '0px 3px 6px -2px rgba(0, 0, 0, 0.02), 0px 1px 1px 0px rgba(0, 0, 0, 0.04)',

  /* Linear's main and its title bar's line, measured 17.10. */
  '--canvas-border': '0.5px solid lch(89.84% 0 282 / 1)',
  '--dropdown-shadow': '0px 6px 18px 0px rgba(0, 0, 0, 0.02), 0px 3px 9px 0px rgba(0, 0, 0, 0.04), 0px 1px 1px 0px rgba(0, 0, 0, 0.04)',

  /* Linear's tooltip is lighter than its menus (checked live 17.10). */
  '--tooltip-shadow': '0px 3px 6px -2px rgba(0, 0, 0, 0.02), 0px 1px 1px 0px rgba(0, 0, 0, 0.04)',
  '--tooltip-bg': 'var(--card-bg)',
  '--tooltip-border': 'var(--color-border-secondary)',
  '--tooltip-fg': 'var(--text-secondary)',
  '--tooltip-kbd-border': 'var(--color-border-secondary)',

  /* Scrollbars */
  '--app-scrollbar-bg': 'lch(64.94% 1.25 282 / 1)',
  '--app-scrollbar-bg-hover': 'lch(65.44% 1.25 282 / 1)',
  '--app-scrollbar-bg-active': 'lch(64.64% 1.25 282 / 1)',

  /* Semantic UI Tokens (Light) */
  '--item-hover-bg': 'lch(89.54% 0.5 282 / 1)', /* #e1e1e2 */
  '--group-chevron': 'lch(80.94% 12 282 / 1)',
  '--group-chevron-hover': 'lch(18.888% 1.25 282 / 1)',
  '--data-row-hover-bg': 'lch(94.44% 0.5 282 / 1)', /* Linear data-row hover */
  '--item-active-bg': 'lch(89.54% 0.5 282 / 1)', /* #e1e1e2 */

  /* Linear's sidebar, measured live (17.10): idle 37.776, hovered or current 9.444,
     hover 91.64 under the current item's 89.54, workspace name 18.888. */
  '--sidebar-item-fg': 'lch(37.776% 1.25 282 / 1)',
  '--sidebar-item-fg-strong': 'lch(9.444% 0 282 / 1)',
  '--sidebar-item-hover-bg': 'lch(91.64% 0.5 282 / 1)',
  '--sidebar-workspace-fg': 'lch(18.888% 1.25 282 / 1)',
  '--sidebar-icon-button-hover-bg': 'lch(0% 0 0 / 0.06)',
  '--sidebar-disclosure-fg': 'lch(62.33% 1.25 282 / 1)',
  '--breadcrumb-separator-fg': 'lch(39.176% 1.25 282 / 1)',
  '--row-selected-bg': 'lch(92.254% 5.903 282.518 / 1)', /* Linear selected row */
  '--inbox-unread-dot': 'lch(47.918% 59.303 288.421 / 1)',

  /* Linear Inbox Focus group headers and Priority / Other tabs, measured in light Linear. */
  '--inbox-group-header-bg': 'lch(94.44% 0.5 282 / 1)',
  '--inbox-tab-bg': 'lch(99.997% 0.5 282 / 1)',
  '--inbox-tab-active-bg': 'lch(93.483% 0.5 282 / 1)',
  '--inbox-tab-fg': 'lch(39.176% 1.25 282 / 1)', /* inactive tab label and tab count */
  '--inbox-group-header-fg': 'lch(37.776% 1.25 282 / 1)',
  '--inbox-group-header-icon': 'lch(62.33% 1.25 282 / 1)',
  '--inbox-error-bg': 'lch(58% 79 48 / 1)',
  '--inbox-filter-bg': 'lch(97.5% 0.5 282 / 1)',
  '--inbox-filter-chip-bg': 'lch(99.5% 0 282 / 1)',
  '--row-selected-hover-bg': 'lch(88.754% 5.903 282.518 / 1)', /* Linear selected row under the pointer */
  '--checkbox-checked-bg': 'lch(53% 52.26 286.91 / 1)', /* Linear accent */
  '--checkbox-checked-fg': 'lch(100% 5 286.91 / 1)',
  '--checkbox-border-hover': 'lch(47% 50.26 286.91 / 1)', /* Linear: the box under the pointer */
  '--dock-border': 'transparent',
  '--dock-clear-btn-bg': 'lch(96.914% 0 282 / 1)',
  '--command-menu-shadow': '0px 9px 48px 0px lch(0% 0 0 / 0.08), 0px 6px 24px 0px lch(0% 0 0 / 0.1), 0px 1px 1px 0px lch(0% 0 0 / 0.04)',
  '--command-menu-bg': 'lch(100% 0 282 / 1)',
  '--command-menu-border': 'lch(90.55% 0 282 / 1)',
  '--command-menu-text': 'lch(10% 0 282 / 1)',
  '--command-menu-row-selected-bg': 'lch(95% 0 282 / 1)',
  '--command-menu-chip-bg': 'var(--command-menu-row-selected-bg)',
  '--command-menu-kbd-border': 'lch(97.3% 0 282 / 1)',
  '--toast-shadow': '0 0 0 1px lch(0% 0 0 / 0.103), 0 6px 18px lch(0% 0 0 / 0.02), 0 3px 9px lch(0% 0 0 / 0.04), 0 1px 1px lch(0% 0 0 / 0.04)',
  '--toast-success-icon': '#2da562',
  '--toast-error-icon': '#b42318',
  '--toast-warning-icon': '#f0bf00',
  '--session-current-text': 'lch(50% 80 141.95 / 1)', /* Linear, 17.10 */
  '--tab-active-bg': 'lch(93.483% 0.5 282 / 1)', /* #eeeef0 */
  '--tab-inactive-bg': 'transparent',
  '--sidebar-card-border': 'lch(97.3% 0 282 / 1)',
  '--sidebar-tab-active-bg': 'lch(95.543% 0 282 / 1)',
  '--sidebar-tab-hover-bg': 'lch(96.914% 0 282 / 1)',
  '--sidebar-tab-inactive-bg': 'lch(100% 0 282 / 1)',
  '--sidebar-tab-active-text': 'lch(10% 0 282 / 1)',
  '--sidebar-tab-hover-text': 'lch(20% 1 282 / 1)',
  '--sidebar-tab-inactive-text': 'lch(40% 1 282 / 1)',
  '--sidebar-tab-active-shadow': '0 0 0 1px lch(0% 0 0 / 0.147), 0 0 0 0 transparent',
  '--sidebar-tab-inactive-shadow': '0 0 0 1px lch(0% 0 0 / 0.103), 0 3px 6px -2px lch(0% 0 0 / 0.02), 0 1px 1px lch(0% 0 0 / 0.04)',
  '--sidebar-tab-hover-shadow': '0 0 0 1px lch(0% 0 0 / 0.147), 0 3px 6px -2px lch(0% 0 0 / 0.02), 0 1px 1px lch(0% 0 0 / 0.04)',
  '--card-bg': 'lch(100% 0 282 / 1)', /* #ffffff */
  '--card-border': 'lch(95.24% 0 282 / 1)', /* #f1f0f0 */
  '--dock-bg': 'lch(100% 0 282 / 1)', /* #ffffff */
  '--dock-btn-bg': 'lch(93.483% 0.5 282 / 1)', /* #eeeef0 */
  '--checkbox-border-rest': 'lch(52.04% 0 282 / 1)', /* Linear unchecked control */

  /* Members → Status badge: the dark theme's hue, darker text for a light page. */
  /* Linear's Admin badge in light (17.10). */
  '--role-badge-bg': 'lch(48% 59.31 288.43 / 0.08)',
  '--role-badge-fg': 'lch(50% 80 288.43 / 1)',

  /* Linear's Settings → Members in light (17.10). */
  '--settings-list-group-bg': 'lch(92.44% 0.5 282 / 1)',
  '--settings-list-group-count': 'lch(64.64% 1.25 282 / 1)',
  '--settings-list-row-hover-bg': 'lch(94.44% 0.5 282 / 1)',
  '--settings-list-muted': 'var(--text-tertiary)',
  '--settings-list-search-bg': 'lch(99.997% 0.5 282 / 1)',
  '--settings-list-search-border': 'lch(84.44% 0 282 / 1)',
  '--settings-list-search-border-hover': 'lch(76.44% 0 282 / 1)',
  '--toggle-unchecked-bg': 'lch(82.484% 0.054 282 / 1)',
  '--toggle-unchecked-hover-bg': 'lch(76.978% 0.076 282 / 1)',
  '--toggle-checked-bg': 'lch(53% 52.26 286.91 / 1)',
  '--toggle-checked-hover-bg': 'lch(47% 50.26 286.91 / 1)',
  '--toggle-knob': 'lch(100% 5 286.91 / 1)',
  '--focus-ring-color': '#6d78d5',
  '--action-primary': '#5e6ad2',
  '--action-primary-hover': '#6875e5',

  /* The main button, as Linear's (2026-10-18): its accent, the same as a switch that is on,
     lighter under the cursor in dark and darker in light, with near-white text. */
  '--button-primary-bg': 'var(--toggle-checked-bg)',
  '--button-primary-hover-bg': 'var(--toggle-checked-hover-bg)',
  '--button-primary-text': 'lch(100% 5 286.91 / 1)',

  /* Snooze Custom… calendar, measured in light Linear 2026-10-07 (#244). */
  '--calendar-weekend-bg': 'lch(97.3% 0 282 / 1)',
  '--calendar-selected-bg': 'lch(53% 52.26 286.91 / 1)',
  '--calendar-selected-fg': 'lch(100% 5 286.91 / 1)',
  '--calendar-cancel-bg': 'lch(100% 0 282 / 1)',
  '--calendar-cancel-fg': 'lch(20% 1 282 / 1)',
  '--calendar-cancel-shadow': '0 0 0 1px lch(0% 0 0 / 0.103), 0 3px 6px -2px lch(0% 0 0 / 0.02), 0 1px 1px lch(0% 0 0 / 0.04)',
  '--calendar-apply-bg': 'lch(53% 52.26 286.91 / 1)',
  '--calendar-apply-fg': 'lch(100% 5 286.91 / 1)',
  '--calendar-apply-shadow': '0 3px 6px -2px lch(0% 0 0 / 0.02), 0 1px 1px lch(0% 0 0 / 0.04)',

  /* Linear Add Filter light-theme measurements. */
  '--filter-menu-border': 'lch(90.55% 0 282 / 1)',
  '--filter-menu-divider': 'lch(97.3% 0 282 / 1)',
  '--filter-menu-text': 'lch(20% 1 282 / 1)',
  '--filter-menu-text-active': 'lch(10% 0 282 / 1)',
  '--filter-menu-muted': 'lch(40% 1 282 / 1)',
  '--filter-menu-highlight': 'lch(95% 0 282 / 1)',
  '--menu-item-highlight': 'var(--item-hover-bg)',
  '--filter-checkbox-border': 'lch(54.1% 0 282 / 1)',
  '--filter-checkbox-selected': '#5e6ad2',
  '--filter-badge-border': 'lch(86.5% 0 282 / 1)',
  '--filter-trigger-bg': 'lch(99.997% 0.5 282 / 1)',
  '--filter-trigger-active-bg': 'lch(94.854% 0.157 282 / 1)',

  /* Measured on live Linear 17.10: Inbox header buttons sit bare, a list's toolbar ones on white. */
  '--header-button-fg': 'var(--text-tertiary)',
  '--header-button-hover-bg': 'lch(94.854% 0.5 282 / 1)',
  '--header-button-active-bg': 'lch(94.854% 0.157 282 / 1)',
  '--property-fg': 'var(--header-button-fg)',
  '--property-hover-bg': 'lch(92.44% 0.5 282 / 1)',
  '--toolbar-button-bg': 'lch(99.997% 0.5 282 / 1)',
  '--toolbar-button-hover-bg': 'lch(95.883% 0.157 282 / 1)',
  '--toolbar-button-active-bg': 'lch(94.854% 0.157 282 / 1)',

  /* Their ::after ring, as on an inactive tab; open loses the drop shadow. */
  '--toolbar-button-ring': '0 0 0 0.5px lch(0% 0 0 / 0.09), 0 3px 6px -2px lch(0% 0 0 / 0.02), 0 1px 1px 0 lch(0% 0 0 / 0.04)',
  '--toolbar-button-ring-hover': '0 0 0 0.5px lch(0% 0 0 / 0.15), 0 3px 6px -2px lch(0% 0 0 / 0.02), 0 1px 1px 0 lch(0% 0 0 / 0.04)',
  '--toolbar-button-ring-active': '0 0 0 0.5px lch(0% 0 0 / 0.15)',
  '--header-button-focus-ring': 'lch(53% 52.26 286.91 / 1)',
  '--filter-menu-shadow': '0px 6px 18px lch(0% 0 0 / 0.02), 0px 3px 9px lch(0% 0 0 / 0.04), 0px 1px 1px lch(0% 0 0 / 0.04)',
  '--filter-menu-strong-shadow': '0px 9px 48px lch(0% 0 0 / 0.08), 0px 6px 24px lch(0% 0 0 / 0.1), 0px 1px 1px lch(0% 0 0 / 0.04)',

  /* Rules list: light equivalents of Linear's My issues hierarchy. */
  '--rules-group-bg': 'var(--bg-sidebar)',

  /* Hairline of a list's sub-group header, as Linear's (measured 2026-10-22, 0.5px). */
  '--list-subgroup-line': 'lch(86.34% 0 282 / 1)', /* #d8d8d8 */

  /* Display options' "Set default for everyone", Linear's accent text (measured 2026-10-22). */
  '--display-footer-accent': 'lch(45% 70 286.91 / 1)',
  '--rules-group-hover-bg': 'var(--item-hover-bg)',
  '--rules-row-hover-bg': 'lch(99.997% 0.5 282 / 1)',
  '--rules-row-focus-bg': 'var(--item-hover-bg)',
  '--rules-property-bg': 'lch(95.24% 0 282 / 1)',
  '--rules-property-border': 'lch(88.49% 0 282 / 1)',
  '--rules-property-text': 'var(--text-secondary)',
  '--rules-scope-bg': 'lch(97.94% 0.5 282 / 1)',
  '--rules-scope-text': 'var(--text-tertiary)',
  '--rules-action-stop-bg': 'rgba(220, 38, 38, 0.09)',
  '--rules-action-stop-border': 'rgba(220, 38, 38, 0.22)',
  '--rules-action-stop-text': '#b42318',
  '--rules-action-positive-bg': 'rgba(5, 150, 105, 0.10)',
  '--rules-action-positive-border': 'rgba(5, 150, 105, 0.22)',
  '--rules-action-positive-text': '#087f5b',
  '--rules-action-default-bg': 'rgba(37, 99, 235, 0.09)',
  '--rules-action-default-border': 'rgba(37, 99, 235, 0.22)',
  '--rules-action-default-text': '#1d4ed8',

  /* Preferences Specific Tokens (Light) */
  '--preferences-card-bg': 'lch(100% 0 282 / 1)', /* #fefeff */
  '--preferences-control-bg': 'lch(100% 0 282 / 1)', /* #fefeff */
  '--preferences-control-hover': '#f2f2f3',
  '--preferences-active-bg': 'lch(89.54% 0.5 282 / 1)', /* #e1e1e2 */
  '--preferences-row-hover-bg': 'var(--item-hover-bg)', /* light Linear not measured yet */

  /* light Linear not measured yet */
  /* Linear's Notifications in light (17.10): channel tile 94.5, dots 66 and green 68,
     "10 types ›" 66. */
  '--preferences-channel-icon-bg': 'lch(94.5% 0 282 / 1)',
  '--preferences-channel-icon-fg': 'var(--text-tertiary)',
  '--preferences-row-link-fg': 'lch(66% 1 282 / 1)',
  '--preferences-channel-on': 'lch(68% 64.37 141.95 / 1)',
  '--preferences-channel-off': 'lch(66% 1 282 / 1)',
  '--preferences-search-bg': 'lch(99.997% 0.5 282 / 1)',
  '--preferences-search-border': 'lch(89.84% 0 282 / 1)',

  /* Linear's settings (17.10): card and control rings 0.088, a control 95.886
     with ring 0.147 under the cursor. */
  '--preferences-card-ring': '0 0 0 0.5px lch(0% 0 0 / 0.088)',

  /* Linear's settings (17.10): the hairline between rows, a field's border. */
  '--preferences-divider': 'lch(0% 0 0 / 0.088)',
  '--preferences-input-border': 'lch(86.5% 0 282 / 1)',
  '--preferences-avatar-ring': 'lch(86.5% 0 282 / 1)',
  '--preferences-control-ring': '0 0 0 0.5px lch(0% 0 0 / 0.088)',
  '--preferences-control-ring-hover': '0 0 0 0.5px lch(0% 0 0 / 0.147)',
  '--preferences-control-hover-bg': 'lch(95.886% 0 282 / 1)',
  '--preferences-menu-bg': 'lch(100% 0 282 / 1)', /* #fefeff */
  '--preferences-menu-border': 'lch(86.5% 0 282 / 1)', /* #d8d8d8 */
  '--preferences-menu-hover': 'lch(95% 0 282 / 1)', /* #f1f0f0 */
  '--preferences-accent': '#6d78d5',
  '--preferences-aa-system-bg': '#f8f8f9',
  '--preferences-aa-system-fg': '#2f2f31',
  '--modal-overlay-bg': 'rgb(0 0 0 / 0.25)',
  '--split-resizer-track': 'lch(84.44% 0 282 / 1)',
  '--split-resizer-indicator': 'lch(0% 0 0 / 0.95)',
  '--dialog-elevation-shadow': '0 9px 48px lch(0% 0 0 / 0.08), 0 6px 24px lch(0% 0 0 / 0.1), 0 1px 1px lch(0% 0 0 / 0.04)',
  '--help-button-fg': 'lch(37.776% 1.25 282 / 1)',
  '--help-button-hover-bg': 'lch(0% 0 0 / 0.06)',
  '--help-button-hover-fg': 'lch(9.444% 0 282 / 1)',
  '--help-menu-bg': 'lch(100% 0 282 / 1)',
  '--help-menu-border': 'lch(91.9% 0 282 / 1)',
  '--help-menu-fg': 'lch(20% 1 282 / 1)',
  '--help-menu-fg-highlighted': 'lch(10% 0 282 / 1)',
  '--help-menu-highlight': 'lch(95% 0 282 / 1)',
  '--help-menu-secondary': 'lch(40% 1 282 / 1)',
  '--help-menu-timeline': 'lch(90.55% 0 282 / 1)',
  '--help-menu-divider': 'lch(91.9% 0 282 / 1)',
  '--help-menu-empty': 'lch(66% 1 282 / 1)',
  '--help-focus-ring': 'lch(53% 52.26 286.91 / 1)',
  '--row-menu-chevron': 'lch(66% 1 282 / 1)',
  '--favorite-star': 'lch(80% 90 85 / 1)',
  '--favorite-number-border': 'lch(91.9% 0 282 / 1)',
  '--bell-checkbox-border': 'lch(54.1% 0 282 / 1)',
  '--row-menu-separator': 'lch(91.9% 0 282 / 1)',
  '--shortcuts-panel-bg': 'lch(100% 0 282 / 1)',
  '--shortcuts-panel-border': 'lch(97.3% 0 282 / 1)',
  '--shortcuts-title': 'lch(10% 0 282 / 1)',
  '--shortcuts-label': 'lch(40% 1 282 / 1)',
  '--shortcuts-key-border': 'lch(91.9% 0 282 / 1)',
  '--shortcuts-input-border': 'lch(86.5% 0 282 / 1)',
  '--details-pane-card-shadow': '0 0 0 1px lch(0% 0 0 / 0.04), 0 1px 2px lch(0% 0 0 / 0.04)',
  '--details-tab-bg': 'var(--sidebar-tab-inactive-bg)',
  '--details-tab-hover-bg': 'var(--sidebar-tab-hover-bg)',
  '--details-tab-active-bg': 'var(--sidebar-tab-active-bg)',
  '--details-tab-fg': 'var(--sidebar-tab-inactive-text)',
  '--details-tab-hover-fg': 'var(--sidebar-tab-hover-text)',
  '--details-tab-active-fg': 'var(--sidebar-tab-active-text)',
  '--details-tab-shadow': 'var(--sidebar-tab-inactive-shadow)',
  '--details-select-bg': 'var(--sidebar-tab-active-bg)',
  '--details-select-fg': 'var(--text-secondary)',
  '--details-row-hover-bg': 'var(--item-hover-bg)',
  '--details-row-active-bg': 'var(--item-active-bg)',
  '--details-row-fg': 'var(--text-secondary)',
  '--details-row-count-fg': 'var(--text-tertiary)',
  '--details-pane-scrim': 'rgb(0 0 0 / 0.25)',
  '--board-card-ring': 'lch(0% 0 0 / 0.088)',
  '--board-lane-bg': 'lch(94.44% 0.5 282 / 1)', /* #efeff0 */
  '--site-bg': '#fcfcfd',
  '--site-fg': '#08090a',
  '--site-fg-secondary': '#282a30',
  '--site-fg-tertiary': '#62666d',
  '--site-fg-quaternary': '#8a8f98',
  '--site-line': 'rgb(0 0 0 / 0.08)',
  '--site-divider': '#e0e1e4',
  '--site-hover-bg': 'rgb(0 0 0 / 0.05)',
  '--site-invert-bg': '#08090a',
  '--site-invert-fg': '#f7f8f8',
  '--site-header-bg': 'linear-gradient(rgb(252 252 253 / 0.8), rgb(247 247 248 / 0.76))',
  '--site-header-fade': 'linear-gradient(#fcfcfd, rgb(255 255 255 / 0))',
  '--site-hero-floor': '#c9ccd3',
  '--site-fig-hi': '#3c3f46',
  '--site-fig-mid': '#c4c6cc',
  '--site-fig-low': '#dcdde1',
  '--site-panel-bg': '#ffffff',
  '--site-logo': '#222326',
  '--logo-avatar-bg': 'lch(19.588% 1.25 282 / 1)',
});
