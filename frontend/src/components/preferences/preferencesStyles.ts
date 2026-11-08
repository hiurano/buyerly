import * as stylex from '@stylexjs/stylex';
import { colors, fonts, motion, sizes } from '@/styles/tokens.stylex';

const sessionSpin = stylex.keyframes({
  to: {
    transform: 'rotate(360deg)',
  },
});

export const preferencesStyles = stylex.create({
  shell: {
    display: 'flex',
    width: '100vw',
    height: '100vh',
    minWidth: {
      default: 680,
      '@media (max-width: 880px)': 0,
    },
    overflow: 'hidden',
    backgroundColor: colors['--bg-window'],
    color: colors['--text-primary'],
    fontFamily: fonts['--font-regular'],
    WebkitFontSmoothing: 'antialiased',
  },

  /* Linear desktop sidebar: 244px. */
  sidebar: {
    width: 244,
    minWidth: 244,
    maxWidth: 244,
    height: '100vh',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 244,
    backgroundColor: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    userSelect: 'none',
  },

  /* Settings at Linear's small width: the navigation is the same drawer as the app sidebar. */
  sidebarSmall: {
    position: 'fixed',
    top: 0,
    bottom: 0,
    left: 0,
    height: '100%',
    width: 'min(calc(100vw - 40px), 330px)',
    minWidth: 0,
    maxWidth: 'none',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    zIndex: 99,
    backgroundColor: colors['--bg-window'],
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    boxShadow: `0 0 0 1px ${colors['--color-border-primary']}, ${colors['--canvas-shadow']}`,
    transform: 'translateX(calc(-100% - 16px))',
    transition: `transform ${motion['--sidebar-spring-duration']} ${motion['--sidebar-spring']}`,
    willChange: 'transform',
  },

  sidebarSmallOpen: {
    transform: 'translateX(0)',
  },

  /* Back to app: x: 16, y: 16, h: 28 */
  backContainer: {
    display: 'flex',
    alignItems: 'center',
    height: 44.5,
    marginTop: 8,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 4,
    width: 220,
    marginLeft: 12,
  },

  backButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    height: 28,
    paddingTop: 0,
    paddingRight: 12,
    paddingBottom: 0,
    paddingLeft: 6,
    borderRadius: 9999,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    backgroundColor: {
      default: 'transparent',
      ':active': colors['--sidebar-icon-button-hover-bg'],
      '@media (any-hover: hover) and (any-pointer: fine)': {
        default: null,
        ':hover': colors['--sidebar-icon-button-hover-bg'],
      },
    },
    color: {
      default: colors['--sidebar-item-fg'],
      ':active': colors['--sidebar-item-fg-strong'],
      '@media (any-hover: hover) and (any-pointer: fine)': {
        default: null,
        ':hover': colors['--sidebar-item-fg-strong'],
      },
    },
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 500,
    cursor: 'default',
    whiteSpace: 'nowrap',
    transition: 'border 0.15s, background-color 0.15s, color 0.15s, opacity 0.15s',
    transitionDuration: {
      default: null,
      ':active': '0s',
      '@media (any-hover: hover) and (any-pointer: fine)': {
        default: null,
        ':hover': '0s',
      },
    },
  },

  backIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 14,
    height: 14,
    marginRight: 6,
  },

  /* Search input: x: 12, y: 56, w: 220, h: 28 */
  searchContainer: {
    width: 220,
    height: 28,
    marginTop: 4,
    marginRight: 12,
    marginBottom: 0,
    marginLeft: 12,
    position: 'relative',
  },

  searchForm: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: '100%',
    position: 'relative',
  },

  searchInput: {
    display: 'block',
    width: 220,
    height: 28,
    paddingTop: 6,
    paddingRight: 25,
    paddingBottom: 6,
    paddingLeft: 32,
    borderRadius: 8,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: {
      default: colors['--preferences-search-border'],
      ':focus': colors['--focus-ring-color'],
    },
    backgroundColor: colors['--preferences-search-bg'],
    color: colors['--sidebar-item-fg-strong'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 500,
    outline: 'none',
    boxShadow: colors['--canvas-shadow'],
    userSelect: 'text',
    transition: 'border-color 0.15s',
    '::placeholder': {
      color: colors['--sidebar-item-fg'],
      opacity: 1,
    },
  },

  searchIcon: {
    position: 'absolute',
    left: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    color: colors['--sidebar-item-fg'],
    pointerEvents: 'none',
  },

  /* Nav list & Personal: x: 12, y: 113, w: 220 */
  navList: {
    display: 'flex',
    flexDirection: 'column',
    width: 220,
    marginTop: 29,
    marginRight: 12,
    marginBottom: 0,
    marginLeft: 12,
  },

  /* Linear's items sit 1px apart, 6px under their heading, 16px over the next one. */
  navGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    marginBottom: 16,
  },

  navHeading: {
    display: 'flex',
    alignItems: 'center',
    width: 220,
    marginBottom: 5,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 10,
    color: colors['--sidebar-item-fg'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 'normal',
    letterSpacing: 'normal',
  },

  navItem: {
    display: 'flex',
    alignItems: 'center',
    width: 220,
    height: {
      default: 28,
      '@media (hover: none) and (pointer: coarse)': 36,
    },
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 10,
    borderRadius: 8,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    backgroundColor: {
      default: 'transparent',
      ':active': colors['--sidebar-item-hover-bg'],
      '@media (any-hover: hover) and (any-pointer: fine)': {
        default: null,
        ':hover': colors['--sidebar-item-hover-bg'],
      },
    },
    color: {
      default: colors['--sidebar-item-fg'],
      ':active': colors['--sidebar-item-fg-strong'],
      '@media (any-hover: hover) and (any-pointer: fine)': {
        default: null,
        ':hover': colors['--sidebar-item-fg-strong'],
      },
    },
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 500,
    textDecoration: 'none',
    cursor: 'default',
  },

  navItemActive: {
    backgroundColor: colors['--preferences-active-bg'],
    color: colors['--sidebar-item-fg-strong'],
  },

  navIcon: {
    width: 16,
    height: 16,
    flexShrink: 0,
    fill: colors['--sidebar-item-fg'],
  },

  navIconActive: {
    fill: colors['--sidebar-item-fg-strong'],
  },

  navLabel: {
    display: 'flex',
    alignItems: 'center',
    paddingTop: 0,
    paddingRight: 9,
    paddingBottom: 0,
    paddingLeft: 6,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 'normal',
  },

  noResults: {
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 10,
    paddingRight: 10,
    color: colors['--text-muted'],
    fontSize: 12,
  },

  /* =========================================================
     MAIN CANVAS & PREFERENCES CONTENT
     ========================================================= */

  mainCanvas: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    height: {
      default: 'calc(100vh - 44px)',
      '@media (max-width: 880px)': '100vh',
    },
    marginTop: {
      default: 8,
      '@media (max-width: 880px)': 0,
    },
    marginRight: {
      default: 8,
      '@media (max-width: 880px)': 0,
    },
    marginBottom: {
      default: 36,
      '@media (max-width: 880px)': 0,
    },
    marginLeft: 0,
    borderRadius: {
      default: 12,
      '@media (max-width: 880px)': 0,
    },
    borderWidth: {
      default: 0.5,
      '@media (max-width: 880px)': 0,
    },
    borderStyle: {
      default: 'solid',
      '@media (max-width: 880px)': 'none',
    },
    borderColor: {
      default: colors['--search-header-border'],
      '@media (max-width: 880px)': 'currentColor',
    },
    backgroundColor: colors['--bg-canvas'],
    boxShadow: {
      default: colors['--canvas-shadow'],
      '@media (max-width: 880px)': 'none',
    },
    overflow: 'hidden',
    position: 'relative',
  },

  /* Linear's small-screen settings header: sticky, menu button, then "‹ Settings". */
  smallHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    gap: 8,
    minHeight: sizes['--header-height'],
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 15,
    paddingRight: 15,
    backgroundColor: colors['--bg-canvas'],
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: colors['--color-border-primary'],
  },

  smallHeaderLink: {
    display: 'flex',
    alignItems: 'center',
    color: colors['--text-primary'],
    fontSize: 15,
    fontWeight: 500,
  },

  scrollContainer: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    overflowY: 'auto',
    overflowX: 'hidden',
    scrollbarGutter: 'stable',
    scrollbarColor: `${colors['--app-scrollbar-bg']} transparent`,
    scrollbarWidth: 'thin',
    paddingRight: {
      default: null,
      '@media (max-width: 880px)': 0,
    },
  },

  contentColumn: {
    display: 'flex',
    flexDirection: 'column',
    width: {
      default: 640,
      '@media (max-width: 880px)': '100%',
    },
    maxWidth: 640,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 'auto',
    marginRight: 'auto',
    paddingTop: {
      default: 64,
      '@media (max-width: 640px)': 16,
    },
    paddingRight: {
      default: 0,
      '@media (max-width: 640px)': 16,
    },
    paddingBottom: 64,
    paddingLeft: {
      default: 0,
      '@media (max-width: 640px)': 16,
    },
  },

  contentColumnWide: {
    width: {
      default: 'auto',
      '@media (max-width: 880px)': '100%',
    },
    maxWidth: 'none',
    marginTop: 0,
    marginBottom: 0,
    marginLeft: {
      default: 56,
      '@media (max-width: 767px)': 16,
    },
    marginRight: {
      default: 56,
      '@media (max-width: 767px)': 16,
    },
  },

  /* =========================================================
     SETTINGS LIST (Members, Teams, Labels)
     ========================================================= */

  listToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },

  listSearch: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: 300,
    minWidth: 0,
    maxWidth: '100%',
    height: 32,
  },

  listSearchInFilterRow: {
    height: 28,
    marginLeft: -6,
  },

  listSearchIcon: {
    position: 'absolute',
    left: 10,
    width: 16,
    height: 16,
    fill: colors['--settings-list-muted'],
    pointerEvents: 'none',
  },

  listSearchInput: {
    width: '100%',
    height: 32,
    paddingTop: 6,
    paddingRight: 25,
    paddingBottom: 6,
    paddingLeft: 32,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: {
      default: colors['--settings-list-search-border'],
      ':hover': colors['--settings-list-search-border-hover'],
      ':active': colors['--settings-list-search-border-hover'],
      ':focus': colors['--focus-ring-color'],
    },
    borderRadius: 8,
    backgroundColor: colors['--settings-list-search-bg'],
    color: colors['--text-primary'],
    fontSize: 13,
    fontWeight: 500,
    outline: 'none',
    transition: 'border-color 0.15s',
    transitionDuration: {
      default: null,
      ':hover': '0s',
      ':active': '0s',
    },
    '::placeholder': {
      color: colors['--settings-list-muted'],
      opacity: 1,
    },
  },

  listSearchInputInFilterRow: {
    height: 28,
    borderColor: 'transparent',
    borderRadius: 999,
    backgroundColor: 'transparent',
    '::placeholder': {
      color: colors['--settings-list-group-count'],
      opacity: 1,
    },
  },

  listSelect: {
    position: 'relative',
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    height: 32,
    paddingTop: 1,
    paddingRight: 28,
    paddingBottom: 1,
    paddingLeft: 10,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 8,
    backgroundColor: {
      default: colors['--toolbar-button-bg'],
      ':hover': colors['--toolbar-button-hover-bg'],
      ':is([data-state="open"])': colors['--toolbar-button-hover-bg'],
    },
    boxShadow: {
      default: colors['--toolbar-button-ring'],
      ':hover': colors['--toolbar-button-ring-hover'],
      ':is([data-state="open"])': colors['--toolbar-button-ring-hover'],
    },
    color: colors['--text-secondary'],
    fontSize: 13,
    fontWeight: 400,
    whiteSpace: 'nowrap',
    cursor: 'default',
    outline: {
      default: 'none',
      ':focus-visible': `1px solid ${colors['--focus-ring-color']}`,
    },
    outlineOffset: {
      default: null,
      ':focus-visible': -1,
    },
    transition: 'background-color 0.15s, border 0.15s, color 0.15s, box-shadow 0.15s',
    transitionDuration: {
      default: null,
      ':hover': '0s',
      ':is([data-state="open"])': '0s',
    },
  },

  listButton: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 12,
    paddingRight: 12,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 9999,
    backgroundColor: {
      default: colors['--toolbar-button-bg'],
      ':hover': colors['--toolbar-button-hover-bg'],
    },
    boxShadow: {
      default: colors['--toolbar-button-ring'],
      ':hover': colors['--toolbar-button-ring-hover'],
    },
    color: colors['--text-secondary'],
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    cursor: 'default',
    outline: {
      default: 'none',
      ':focus-visible': `1px solid ${colors['--focus-ring-color']}`,
    },
    outlineOffset: {
      default: null,
      ':focus-visible': -1,
    },
    transition: 'background-color 0.15s, border 0.15s, color 0.15s, box-shadow 0.15s',
    transitionDuration: {
      default: null,
      ':hover': '0s',
    },
  },

  listButtonPrimary: {
    backgroundColor: {
      default: colors['--button-primary-bg'],
      ':hover': colors['--button-primary-hover-bg'],
    },
    boxShadow: colors['--canvas-shadow'],
    color: colors['--button-primary-text'],
  },

  listTable: {
    marginTop: 21,
    marginBottom: 0,
    marginLeft: {
      default: -56,
      '@media (max-width: 767px)': -16,
    },
    marginRight: {
      default: -56,
      '@media (max-width: 767px)': -16,
    },
    fontSize: 12,
  },

  listTableLabels: {
    marginTop: {
      default: 0,
      '@media (max-width: 767px)': 21,
    },
  },

  listRow: {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: {
      default: 'minmax(0, 3fr) minmax(0, 2fr) 140px 82px 168px 24px',
      '@media (max-width: 767px)': 'minmax(0, 1fr) 96px 24px',
    },
    alignItems: 'center',
    height: 50,
    marginBottom: 2,
    paddingTop: 0,
    paddingBottom: 0,
    paddingRight: {
      default: 32,
      '@media (max-width: 767px)': 12,
    },
    paddingLeft: {
      default: 60,
      '@media (max-width: 767px)': 16,
    },
    color: colors['--settings-list-muted'],
    fontWeight: 450,
  },

  listRowTeams: {
    gridTemplateColumns: {
      default: 'minmax(0, 1fr) 120px 92px 82px 86px 24px',
      '@media (max-width: 767px)': 'minmax(0, 1fr) 72px 24px',
    },
  },

  listRowLabels: {
    gridTemplateColumns: {
      default: 'minmax(0, 2fr) minmax(0, 3fr) 75px 102px 86px 24px',
      '@media (max-width: 767px)': 'minmax(0, 1fr) 56px 24px',
    },
  },

  listRowCompact: {
    height: 44,
  },

  listRowHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    height: 32,
    marginBottom: 0,
    backgroundColor: colors['--bg-canvas'],
  },

  listGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 32,
    marginTop: 0,
    marginLeft: 8,
    marginRight: 8,
    marginBottom: 2,
    paddingLeft: {
      default: 54,
      '@media (max-width: 767px)': 8,
    },
    borderRadius: 8,
    backgroundColor: colors['--settings-list-group-bg'],
    color: colors['--settings-list-muted'],
    fontWeight: 500,
  },

  listGroupCount: {
    color: colors['--settings-list-group-count'],
  },

  listPerson: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },

  listPersonName: {
    display: 'block',
    overflow: 'hidden',
    color: colors['--text-secondary'],
    fontSize: 13,
    fontWeight: 500,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  listPersonHandle: {
    display: 'block',
    overflow: 'hidden',
    fontWeight: 500,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  listCell: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  listColWide: {
    display: {
      default: null,
      '@media (max-width: 767px)': 'none',
    },
  },

  listSort: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    height: 24,
    marginLeft: -6,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 6,
    paddingRight: 6,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 9999,
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--header-button-hover-bg'],
      ':active': colors['--header-button-hover-bg'],
    },
    color: {
      default: 'inherit',
      ':hover': colors['--text-primary'],
      ':active': colors['--text-primary'],
    },
    font: 'inherit',
    whiteSpace: 'nowrap',
    cursor: 'default',
    outline: {
      default: 'none',
      ':focus-visible': `1px solid ${colors['--focus-ring-color']}`,
    },
    outlineOffset: {
      default: null,
      ':focus-visible': -1,
    },
    transition: 'background-color 0.15s, color 0.15s',
    transitionDuration: {
      default: null,
      ':hover': '0s',
      ':active': '0s',
    },
  },

  listCount: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 24,
    marginLeft: -6,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 6,
    paddingRight: 6,
    borderRadius: 9999,
    color: 'inherit',
    fontWeight: 500,
    outline: 'none',
  },

  listCountLink: {
    backgroundColor: {
      default: null,
      ':hover': colors['--header-button-hover-bg'],
      ':active': colors['--header-button-hover-bg'],
    },
    color: {
      default: 'inherit',
      ':hover': colors['--text-primary'],
      ':active': colors['--text-primary'],
    },
    outline: {
      default: 'none',
      ':focus-visible': `1px solid ${colors['--focus-ring-color']}`,
    },
  },

  listTeam: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 2,
    fontSize: 13,
    fontWeight: 500,
  },

  listTeamName: {
    overflow: 'hidden',
    color: colors['--text-primary'],
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    outline: 'none',
  },

  listTeamKey: {
    flexShrink: 0,
    marginLeft: -2,
    color: colors['--text-muted'],
  },

  listTitleRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    height: 44.5,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: {
      default: -56,
      '@media (max-width: 767px)': -16,
    },
    marginRight: {
      default: -56,
      '@media (max-width: 767px)': -16,
    },
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: {
      default: 56,
      '@media (max-width: 767px)': 16,
    },
    paddingRight: {
      default: 56,
      '@media (max-width: 767px)': 16,
    },
    borderBottomWidth: 0.5,
    borderBottomStyle: 'solid',
    borderBottomColor: colors['--search-header-border'],
  },

  listFilterRow: {
    display: 'flex',
    alignItems: 'center',
    height: 43.5,
  },

  listLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },

  listInline: {
    height: 28.5,
    minWidth: 0,
    maxWidth: '100%',
    paddingTop: 6,
    paddingRight: 10,
    paddingBottom: 6,
    paddingLeft: 6,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: {
      default: 'transparent',
      ':enabled:hover': colors['--preferences-search-border'],
      ':enabled:focus-visible': colors['--preferences-search-border'],
    },
    borderRadius: 7,
    backgroundColor: {
      default: 'transparent',
      ':enabled:hover': colors['--preferences-search-bg'],
      ':enabled:focus-visible': colors['--preferences-search-bg'],
    },
    color: colors['--text-secondary'],
    fontSize: 13,
    textAlign: 'left',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    outline: 'none',
  },

  listInlineInput: {
    borderColor: {
      default: colors['--preferences-search-border'],
      ':focus': colors['--focus-ring-color'],
    },
    backgroundColor: colors['--preferences-search-bg'],
  },

  listInlineStrong: {
    fontWeight: 500,
  },

  listInlinePlaceholder: {
    color: colors['--settings-list-muted'],
  },

  listDescription: {
    marginLeft: -6,
  },

  /* =========================================================
     PAGE TITLE, SECTIONS, CARDS & ROWS
     ========================================================= */

  titleContainer: {
    display: 'flex',
    alignItems: 'center',
    height: 32,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 16,
    paddingRight: 16,
    marginBottom: 32,
  },

  titleContainerWide: {
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    marginBottom: 13,
  },

  titleContainerInTitleRow: {
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    marginBottom: 0,
  },

  titleContainerWithNote: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    height: 'auto',
    gap: 4,
  },

  pageTitle: {
    color: colors['--text-primary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 24,
    fontWeight: 500,
    lineHeight: '32px',
    letterSpacing: '-0.16px',
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
  },

  pageNote: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    color: colors['--text-tertiary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 450,
    lineHeight: '22px',
  },

  section: {
    display: 'flex',
    flexDirection: 'column',
    width: {
      default: 640,
      '@media (max-width: 880px)': '100%',
    },
    marginBottom: 48,
  },

  sectionSub: {
    marginBottom: 24,
  },

  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    height: 23,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 16,
    paddingRight: 16,
    marginBottom: 16,
  },

  sectionHeaderSub: {
    height: 15.5,
    marginBottom: 12,
  },

  sectionHeaderGroup: {
    marginBottom: 16,
  },

  sectionTitle: {
    color: colors['--text-primary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 15,
    fontWeight: 500,
    lineHeight: '23px',
    letterSpacing: 'normal',
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
  },

  sectionTitleSub: {
    color: colors['--text-secondary'],
    fontSize: 13,
    lineHeight: 'normal',
  },

  cardContainer: {
    display: 'flex',
    flexDirection: 'column',
    width: {
      default: 640,
      '@media (max-width: 880px)': '100%',
    },
    borderRadius: 10,
    backgroundColor: colors['--preferences-card-bg'],
    overflow: 'visible',
    boxShadow: `${colors['--preferences-card-ring']}, ${colors['--canvas-shadow']}`,
  },

  rowItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 60,
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    borderRadius: 10,
    position: 'relative',
  },

  rowItemColumnOnMobile: {
    flexDirection: {
      default: 'row',
      '@media (max-width: 640px)': 'column',
    },
    alignItems: {
      default: 'center',
      '@media (max-width: 640px)': 'stretch',
    },
    gap: {
      default: 12,
      '@media (max-width: 640px)': 8,
    },
    height: {
      default: null,
      '@media (max-width: 640px)': 'auto',
    },
  },

  subsection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 16,
    paddingRight: 16,
    marginBottom: 12,
  },

  subsectionTitle: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    color: colors['--text-secondary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 'normal',
  },

  subsectionDesc: {
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    color: colors['--text-tertiary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 450,
    lineHeight: '22px',
  },

  inviteLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: colors['--color-border-primary'],
  },

  inviteLinkField: {
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    height: 32,
    paddingTop: 0,
    paddingRight: 4,
    paddingBottom: 0,
    paddingLeft: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    borderRadius: 6,
  },

  inviteLinkText: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
    overflow: 'hidden',
    color: colors['--text-tertiary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    userSelect: 'all',
  },

  inviteLinkReset: {
    display: 'flex',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    borderRadius: 4,
    color: {
      default: colors['--text-tertiary'],
      ':hover:not(:disabled)': colors['--text-primary'],
    },
    backgroundColor: {
      default: 'transparent',
      ':hover:not(:disabled)': colors['--item-hover-bg'],
    },
    cursor: 'pointer',
    outline: {
      default: null,
      ':focus-visible': 'none',
    },
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },

  rowGhostButton: {
    display: 'inline-flex',
    flexShrink: 0,
    alignItems: 'center',
    height: 32,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 12,
    paddingRight: 12,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 9999,
    backgroundColor: {
      default: 'transparent',
      ':hover:not(:disabled)': colors['--item-hover-bg'],
    },
    color: {
      default: colors['--text-secondary'],
      ':hover:not(:disabled)': colors['--text-primary'],
    },
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    cursor: {
      default: 'pointer',
      ':disabled': 'default',
    },
    opacity: {
      default: null,
      ':disabled': 0.6,
    },
    outline: {
      default: null,
      ':focus-visible': 'none',
    },
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },

  rowGhostButtonDanger: {
    color: {
      default: colors['--rules-action-stop-text'],
      ':hover:not(:disabled)': colors['--rules-action-stop-text'],
    },
  },

  workspaceLogo: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    flexShrink: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--preferences-avatar-ring'],
    borderRadius: 9,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    cursor: 'default',
    outline: {
      default: null,
      ':focus-visible': 'none',
    },
    boxShadow: {
      default: null,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
  },

  workspaceLogoOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    color: '#fff',
    opacity: 0,
    transition: `opacity ${motion['--speed-quickTransition']} ${motion['--ease-out-quad']}`,
  },

  urlField: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    height: 32,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: {
      default: colors['--preferences-input-border'],
      ':focus-within': colors['--focus-ring-color'],
    },
    borderRadius: 8,
    backgroundColor: colors['--preferences-card-bg'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
  },

  urlFieldWide: {
    width: {
      default: 256,
      '@media (max-width: 640px)': '100%',
    },
  },

  urlPrefix: {
    flexShrink: 0,
    paddingLeft: 12,
    color: colors['--preferences-row-link-fg'],
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },

  urlInput: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    height: '100%',
    paddingTop: 0,
    paddingRight: 30,
    paddingBottom: 0,
    paddingLeft: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    backgroundColor: 'transparent',
    color: colors['--text-primary'],
    font: 'inherit',
    outline: 'none',
    cursor: 'pointer',
  },

  urlInputEditable: {
    paddingRight: 12,
    cursor: 'text',
  },

  urlAccessory: {
    position: 'absolute',
    right: 10,
    display: 'inline-flex',
    color: colors['--text-tertiary'],
    pointerEvents: 'none',
  },

  rowCopy: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },

  rowCopyColumnOnMobile: {
    flexGrow: {
      default: 1,
      '@media (max-width: 640px)': 0,
    },
    flexShrink: {
      default: 1,
      '@media (max-width: 640px)': 0,
    },
    flexBasis: {
      default: 0,
      '@media (max-width: 640px)': 'auto',
    },
  },

  rowCopyDisabled: {
    opacity: 0.5,
  },

  rowTitle: {
    display: 'block',
    color: colors['--text-primary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 'normal',
  },

  rowDesc: {
    display: 'block',
    marginTop: 3,
    color: colors['--settings-row-desc'],
    fontFamily: fonts['--font-regular'],
    fontSize: 12,
    fontWeight: 450,
    lineHeight: 'normal',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  connectionRowDesc: {
    marginTop: 4,
  },

  rowControl: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },

  rowControlColumnOnMobile: {
    width: {
      default: null,
      '@media (max-width: 640px)': '100%',
    },
    justifyContent: {
      default: 'flex-end',
      '@media (max-width: 640px)': 'flex-start',
    },
  },

  rowControlLink: {
    gap: 12,
  },

  rowValue: {
    color: colors['--text-primary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 450,
    lineHeight: '16px',
    flexShrink: 0,
  },

  rowValueLink: {
    color: colors['--preferences-row-link-fg'],
    fontSize: 12,
  },

  rowEditButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    marginLeft: 6,
    borderRadius: 9999,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    backgroundColor: {
      default: colors['--preferences-control-bg'],
      ':hover': colors['--preferences-control-hover-bg'],
    },
    boxShadow: {
      default: `${colors['--preferences-control-ring']}, ${colors['--canvas-shadow']}`,
      ':hover': `${colors['--preferences-control-ring-hover']}, ${colors['--canvas-shadow']}`,
      ':focus-visible': `0 0 0 2px ${colors['--focus-ring-color']}`,
    },
    color: {
      default: colors['--preferences-channel-icon-fg'],
      ':hover': colors['--text-primary'],
    },
    cursor: 'default',
    outline: {
      default: null,
      ':focus-visible': 'none',
    },
    transition: 'background-color 0.15s, color 0.15s, box-shadow 0.15s',
    transitionDuration: {
      default: null,
      ':hover': '0s',
    },
  },

  /* Shared Input overrides */
  rowInput: {
    width: 192,
    height: 30,
    flexShrink: 0,
    borderWidth: 0.5,
    borderColor: {
      default: colors['--preferences-input-border'],
      ':focus': colors['--focus-ring-color'],
    },
    backgroundColor: colors['--preferences-card-bg'],
    transitionProperty: 'border-color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'ease',
    '::placeholder': {
      color: colors['--preferences-row-link-fg'],
    },
  },

  profileInput: {
    width: 180,
    height: 32,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: 8,
    backgroundColor: colors['--preferences-card-bg'],
    fontSize: 13,
  },

  profileInputMobileFull: {
    width: {
      default: 180,
      '@media (max-width: 640px)': '100%',
    },
  },

  rowInputWide: {
    width: {
      default: 256,
      '@media (max-width: 640px)': '100%',
    },
    height: 32,
    fontSize: 13,
  },

  rowInputNarrow: {
    width: {
      default: 148,
      '@media (max-width: 640px)': 'auto',
    },
    flexGrow: {
      default: null,
      '@media (max-width: 640px)': 1,
    },
    flexShrink: {
      default: null,
      '@media (max-width: 640px)': 1,
    },
    flexBasis: {
      default: null,
      '@media (max-width: 640px)': 'auto',
    },
  },

  sectionNote: {
    marginTop: -8,
    marginRight: 0,
    marginBottom: 12,
    marginLeft: 0,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 16,
    paddingRight: 16,
    maxWidth: 560,
    color: colors['--text-tertiary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 12,
    fontWeight: 450,
    lineHeight: '18px',
  },

  sectionNoteNotifications: {
    marginTop: -14,
    marginRight: 0,
    marginBottom: 16,
    marginLeft: 0,
    maxWidth: 'none',
    fontSize: 13,
    lineHeight: '22px',
  },

  sectionNoteSessions: {
    marginTop: -14,
    marginRight: 0,
    marginBottom: 16,
    marginLeft: 0,
    fontSize: 13,
    lineHeight: '22px',
  },

  rowError: {
    marginTop: 8,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    color: colors['--rules-action-stop-text'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    lineHeight: '18px',
  },

  rowLink: {
    width: '100%',
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--preferences-row-hover-bg'],
    },
    textAlign: 'left',
    cursor: 'default',
  },

  rowChevron: {
    color: colors['--preferences-channel-icon-fg'],
  },

  rowChevronInControl: {
    color: colors['--preferences-row-link-fg'],
  },

  channelIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: 6,
    backgroundColor: colors['--preferences-channel-icon-bg'],
    color: colors['--preferences-channel-icon-fg'],
  },

  channelStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },

  channelDot: {
    width: 6,
    height: 6,
    flexShrink: 0,
    borderRadius: '50%',
    backgroundColor: colors['--preferences-channel-off'],
  },

  channelDotOn: {
    backgroundColor: colors['--preferences-channel-on'],
  },

  inlineLink: {
    display: 'inline',
    paddingTop: 1,
    paddingBottom: 1,
    paddingLeft: 4,
    paddingRight: 4,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    borderRadius: 8,
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--item-hover-bg'],
    },
    color: colors['--text-primary'],
    font: 'inherit',
    cursor: 'default',
  },

  breadcrumb: {
    display: 'inline-flex',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 4,
    height: 24,
    marginTop: {
      default: -40,
      '@media (max-width: 640px)': 0,
    },
    marginRight: 0,
    marginBottom: 16,
    marginLeft: 8,
    paddingTop: 0,
    paddingRight: 8,
    paddingBottom: 0,
    paddingLeft: 4,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    borderRadius: 9999,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--item-hover-bg'],
    },
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 450,
    cursor: 'pointer',
  },

  connectionRow: {
    paddingRight: 10,
  },

  /* Priority inbox custom filters */
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 60,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 16,
    paddingRight: 16,
    position: 'relative',
  },

  filterCount: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    color: colors['--text-primary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 500,
  },

  filterCountEmpty: {
    color: colors['--text-tertiary'],
  },

  filterInclude: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    color: colors['--text-tertiary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 450,
  },

  filterChips: {
    display: 'flex',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },

  filterActions: {
    display: 'flex',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    gap: 8,
  },

  filterAdd: {
    display: 'inline-flex',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    alignItems: 'center',
    gap: 4,
    height: 24,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 8,
    paddingRight: 8,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    borderRadius: 9999,
    color: {
      default: colors['--text-primary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--item-hover-bg'],
    },
    fontFamily: fonts['--font-regular'],
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },

  filterButton: {
    display: 'inline-flex',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    alignItems: 'center',
    gap: 4,
    height: 24,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 6,
    paddingRight: 8,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    borderRadius: 9999,
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--item-hover-bg'],
    },
    fontFamily: fonts['--font-regular'],
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },

  filterIconButton: {
    display: 'inline-flex',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    width: 24,
    height: 24,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    borderRadius: 9999,
    color: {
      default: colors['--text-tertiary'],
      ':hover': colors['--text-primary'],
      ':is([data-state="open"])': colors['--text-primary'],
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--item-hover-bg'],
      ':is([data-state="open"])': colors['--item-hover-bg'],
    },
    cursor: 'pointer',
  },

  filterActionsTrigger: {
    opacity: {
      default: 0,
      ':focus-visible': 1,
      ':is([data-state="open"])': 1,
    },
  },

  /* Profile picture avatar */
  avatar: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    borderRadius: 9999,
    backgroundColor: colors['--action-primary'],
    overflow: 'hidden',
    flexShrink: 0,
  },

  avatarButton: {
    marginTop: 1,
    marginRight: 1,
    marginBottom: 1,
    marginLeft: 1,
    boxShadow: `0 0 0 1px ${colors['--preferences-avatar-ring']}`,
    cursor: 'default',
    alignSelf: {
      default: null,
      '@media (max-width: 640px)': 'flex-start',
    },
    outline: {
      default: null,
      ':focus-visible': `2px solid ${colors['--focus-ring-color']}`,
    },
    outlineOffset: {
      default: null,
      ':focus-visible': 2,
    },
    opacity: {
      default: null,
      ':disabled': 0.6,
    },
  },

  avatarOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    color: '#fff',
    opacity: 0,
    transition: 'opacity 0.15s',
  },

  avatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },

  avatarInitials: {
    color: '#fff',
    fontFamily: fonts['--font-regular'],
    fontSize: 14,
    fontWeight: 400,
    lineHeight: 1,
  },

  /* Theme Control & Combobox */
  themeControl: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
    width: {
      default: null,
      '@media (max-width: 640px)': '100%',
    },
  },

  comboboxTrigger: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    width: {
      default: null,
      '@media (max-width: 640px)': '100%',
    },
    height: 30,
    minWidth: 192,
    paddingTop: 1,
    paddingRight: 28,
    paddingBottom: 1,
    paddingLeft: 4,
    borderRadius: 8,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    backgroundColor: {
      default: colors['--preferences-control-bg'],
      ':hover': colors['--preferences-control-hover-bg'],
      ':is([aria-expanded="true"])': colors['--preferences-control-hover-bg'],
    },
    color: colors['--text-secondary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 400,
    cursor: 'default',
    whiteSpace: 'nowrap',
    boxShadow: {
      default: `${colors['--preferences-control-ring']}, ${colors['--canvas-shadow']}`,
      ':hover': `${colors['--preferences-control-ring-hover']}, ${colors['--canvas-shadow']}`,
      ':is([aria-expanded="true"])': `${colors['--preferences-control-ring-hover']}, ${colors['--canvas-shadow']}`,
    },
    outline: 'none',
    transition: 'background-color 0.15s, border 0.15s, color 0.15s, box-shadow 0.15s',
    transitionDuration: {
      default: null,
      ':hover': '0s',
      ':is([aria-expanded="true"])': '0s',
    },
  },

  comboboxContent: {
    display: 'flex',
    alignItems: 'center',
    pointerEvents: 'none',
  },

  comboboxValue: {
    display: 'flex',
    alignItems: 'center',
    gap: 0,
  },

  aaBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 2,
    paddingBottom: 2,
    paddingLeft: 4,
    paddingRight: 4,
    marginRight: 5,
    borderRadius: 8,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: colors['--preferences-menu-border'],
    backgroundColor: colors['--preferences-aa-system-bg'],
    color: colors['--preferences-aa-system-fg'],
    fontFamily: fonts['--font-regular'],
    fontSize: 11,
    fontWeight: 450,
    flexShrink: 0,
  },

  aaBadgeLight: {
    backgroundColor: '#f8f8f9',
    color: '#2f2f31',
  },

  aaBadgeDark: {
    backgroundColor: '#111212',
    color: '#e2e3e5',
  },

  aaDot: {
    color: colors['--preferences-accent'],
    fontSize: 15,
    lineHeight: '16px',
    marginRight: 2,
  },

  aaDotLight: {
    color: '#6d78d5',
  },

  aaDotDark: {
    color: '#5e69d1',
  },

  comboboxText: {
    display: 'inline-block',
    color: colors['--text-secondary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 400,
    lineHeight: '16px',
    whiteSpace: 'nowrap',
  },

  comboboxChevron: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 9,
    height: 5,
    color: colors['--text-tertiary'],
    pointerEvents: 'none',
  },

  dropdownMenu: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    right: 0,
    zIndex: 100,
    width: 220,
    paddingTop: 4,
    paddingRight: 4,
    paddingBottom: 4,
    paddingLeft: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--preferences-menu-border'],
    backgroundColor: colors['--preferences-menu-bg'],
    boxShadow: colors['--dropdown-shadow'],
    animationName: 'fadeIn',
    animationDuration: '100ms',
    animationTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
  },

  dropdownItem: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    height: 30,
    paddingTop: 0,
    paddingRight: 28,
    paddingBottom: 0,
    paddingLeft: 8,
    borderRadius: 6,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--preferences-menu-hover'],
    },
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 450,
    textAlign: 'left',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    outline: 'none',
    transition: 'background-color 80ms ease, color 80ms ease',
  },

  dropdownItemSelected: {
    backgroundColor: colors['--preferences-menu-hover'],
    color: colors['--text-primary'],
  },

  dropdownItemLabel: {
    display: 'inline-block',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  dropdownCheck: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    color: colors['--preferences-accent'],
    fill: colors['--preferences-accent'],
  },

  /* =========================================================
     SESSIONS & CONNECTED ACCOUNTS
     ========================================================= */

  sessionsCardFollowing: {
    marginTop: 12,
  },

  session: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    minHeight: 65,
    paddingRight: 16,
    borderRadius: 10,
    backgroundColor: {
      default: null,
      ':hover': colors['--item-hover-bg'],
    },
    transition: 'background-color 150ms ease, opacity 150ms ease',
  },

  sessionOld: {
    opacity: 0.5,
  },

  sessionMain: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    alignSelf: 'stretch',
    minWidth: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 16,
    borderWidth: 0,
    borderStyle: 'none',
    borderColor: 'currentColor',
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    outline: {
      default: null,
      ':focus-visible': `2px solid ${colors['--focus-ring-color']}`,
    },
    outlineOffset: {
      default: null,
      ':focus-visible': -2,
    },
    borderRadius: {
      default: null,
      ':focus-visible': 10,
    },
  },

  sessionIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: 6,
    backgroundColor: colors['--preferences-channel-icon-bg'],
    color: colors['--preferences-channel-icon-fg'],
  },

  sessionIconOutlined: {
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: colors['--color-border-secondary'],
    backgroundColor: 'transparent',
    color: colors['--text-secondary'],
  },

  sessionCopy: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2.5,
    minWidth: 0,
  },

  sessionDesc: {
    color: colors['--text-tertiary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 12,
    fontWeight: 450,
    lineHeight: 'normal',
  },

  sessionPart: {
    whiteSpace: 'nowrap',
  },

  sessionCurrent: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    color: colors['--session-current-text'],
  },

  sessionSpinner: {
    width: 12,
    height: 12,
    marginRight: 2,
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderTopColor: 'currentColor',
    borderBottomColor: 'currentColor',
    borderLeftColor: 'currentColor',
    borderRightColor: 'transparent',
    borderRadius: '50%',
    animationName: sessionSpin,
    animationDuration: '700ms',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  },

  sessionsShowAll: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    minHeight: 44,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 16,
    paddingRight: 16,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomStyle: 'none',
    borderLeftStyle: 'none',
    borderRightStyle: 'none',
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: colors['--color-border-primary'],
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 10,
    borderBottomLeftRadius: 10,
    backgroundColor: {
      default: 'transparent',
      ':hover': colors['--item-hover-bg'],
    },
    color: {
      default: colors['--text-secondary'],
      ':hover': colors['--text-primary'],
    },
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  },

  sessionsOthers: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 64.5,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 16,
    paddingRight: 16,
    borderBottomWidth: 0.5,
    borderBottomStyle: 'solid',
    borderBottomColor: colors['--preferences-divider'],
    color: colors['--text-primary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 500,
  },

  sessionButtonOnHover: {
    opacity: {
      default: null,
      '@media (hover: hover)': {
        default: 0,
        ':is([data-busy="true"])': 1,
      },
    },
    transition: 'background-color 150ms ease, opacity 150ms ease',
  },

  connectionMain: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },

  connectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },

  connectionAccount: {
    color: colors['--text-tertiary'],
  },

  connectionAlert: {
    display: 'inline-flex',
    color: '#f5b800',
  },

  connectButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 32,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 12,
    paddingRight: 12,
    flexShrink: 0,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: 9999,
    backgroundColor: {
      default: 'transparent',
      ':hover:not(:disabled)': colors['--item-hover-bg'],
      ':is([data-state="open"])': colors['--item-hover-bg'],
    },
    color: colors['--text-secondary'],
    fontFamily: fonts['--font-regular'],
    fontSize: 13,
    fontWeight: 500,
    cursor: 'default',
    opacity: {
      default: null,
      ':disabled': 0.5,
    },
    transition: 'background-color 150ms ease',
  },
});
