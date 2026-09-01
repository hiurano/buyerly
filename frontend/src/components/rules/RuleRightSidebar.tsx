import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import {
  LinearShieldIcon,
  LinearRocketIcon,
  LinearFlaskIcon,
  LinearBacklogDashedIcon,
  LinearStatusCircleIcon,
} from '@/icons/LinearIcons';
import { removeFilterClause, upsertFilterClause } from '@/components/filters/filterModel';

const SIDEBAR_FONT =
  '"Inter Variable", "SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const SIDEBAR_MIN_WIDTH = 360;
const SIDEBAR_MAX_WIDTH = 600;
const SIDEBAR_DEFAULT_WIDTH = 360;
const SIDEBAR_WIDTH_STORAGE_KEY = 'buyerly:rules-sidebar-width';

const clampSidebarWidth = (width: number) =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));

const getInitialSidebarWidth = () => {
  if (typeof window === 'undefined') return SIDEBAR_DEFAULT_WIDTH;

  const storedWidth = Number.parseFloat(
    window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY) ?? ''
  );

  return Number.isFinite(storedWidth)
    ? clampSidebarWidth(storedWidth)
    : SIDEBAR_DEFAULT_WIDTH;
};

interface SidebarFilterRowProps {
  name: string;
  count: number;
  leading: React.ReactNode;
  isActive: boolean;
  isHovered: boolean;
  onToggle: () => void;
  onClear: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/** Linear sidebar row: stable count column with a hover action inside the content column. */
const SidebarFilterRow: React.FC<SidebarFilterRowProps> = ({
  name,
  count,
  leading,
  isActive,
  isHovered,
  onToggle,
  onClear,
  onMouseEnter,
  onMouseLeave,
}) => (
  <div
    role="button"
    tabIndex={0}
    aria-pressed={isActive}
    onClick={onToggle}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
    style={{
      display: 'flex',
      alignItems: 'center',
      height: 42,
      padding: '0 10px',
      borderRadius: 8,
      cursor: 'pointer',
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: isHovered
        ? 'lch(13.058% 1.3 272)'
        : isActive
        ? 'lch(11.033% 1.3 272)'
        : 'transparent',
      transition: 'background-color 150ms ease',
    }}
  >
    <div
      data-column-id="content"
      style={{
        display: 'flex',
        minWidth: 0,
        flex: 1,
        alignItems: 'center',
      }}
    >
      {leading}
      <span
        title={name}
        style={{
          minWidth: 0,
          flex: 1,
          overflow: 'hidden',
          color: 'lch(100% 0 272)',
          fontFamily: SIDEBAR_FONT,
          fontSize: 13,
          fontWeight: 450,
          lineHeight: '16px',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>

      {isHovered && (
        <button
          type="button"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
            if (isActive) onClear();
            else onToggle();
          }}
          style={{
            display: 'flex',
            height: 16,
            flexShrink: 0,
            alignItems: 'center',
            padding: '0 8px 0 20px',
            border: 0,
            outline: 0,
            background: 'transparent',
            color: 'lch(100% 0 272)',
            cursor: 'pointer',
            fontFamily: SIDEBAR_FONT,
            fontSize: 13,
            fontWeight: 450,
            lineHeight: '16px',
            whiteSpace: 'nowrap',
            transition: 'color 150ms ease',
          }}
        >
          {isActive ? 'Clear' : 'View'}
        </button>
      )}
    </div>

    <span
      data-column-id="row-count"
      style={{
        flexShrink: 0,
        color: 'lch(63.304% 1.425 272)',
        fontFamily: SIDEBAR_FONT,
        fontSize: 13,
        fontWeight: 450,
        lineHeight: '16px',
      }}
    >
      {count}
    </span>
  </div>
);

export const RuleRightSidebar: React.FC = () => {
  const {
    isRulesRightSidebarOpen,
    activeRulesRightSidebarTab,
    setActiveRulesRightSidebarTab,
    ruleGroups,
    rules,
    rulesFilterClauses,
    setRulesFilterClauses,
    selectedRuleId,
    setSelectedRuleId,
  } = useAppStore();

  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [hoveredTab, setHoveredTab] = useState<'groups' | 'rules' | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const [isResizing, setIsResizing] = useState(false);
  const [isResizeHandleHovered, setIsResizeHandleHovered] = useState(false);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(sidebarWidth);
  const currentSidebarWidthRef = useRef(sidebarWidth);

  useEffect(() => {
    currentSidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const finishResize = () => {
      window.localStorage.setItem(
        SIDEBAR_WIDTH_STORAGE_KEY,
        String(currentSidebarWidthRef.current)
      );
      setIsResizing(false);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = clampSidebarWidth(
        resizeStartWidthRef.current + resizeStartXRef.current - event.clientX
      );
      currentSidebarWidthRef.current = nextWidth;
      setSidebarWidth(nextWidth);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('blur', finishResize);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('blur', finishResize);
    };
  }, [isResizing]);

  const handleResizePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    resizeStartXRef.current = event.clientX;
    resizeStartWidthRef.current = sidebarWidth;
    currentSidebarWidthRef.current = sidebarWidth;
    setIsResizing(true);
  };

  const getGroupIcon = (iconType: string) => {
    switch (iconType) {
      case 'shield':
        return <LinearShieldIcon size={14} className="text-emerald-400" />;
      case 'rocket':
        return <LinearRocketIcon size={14} className="text-purple-400" />;
      case 'flask':
        return <LinearFlaskIcon size={14} className="text-amber-400" />;
      case 'backlog':
      default:
        return <LinearBacklogDashedIcon size={14} className="text-zinc-400" />;
    }
  };

  const groupClause = rulesFilterClauses.find((clause) => clause.fieldId === 'group');
  const activeGroupId =
    groupClause?.operator === 'is' && groupClause.values.length === 1
      ? String(groupClause.values[0])
      : null;

  const setGroupQuickFilter = (groupId: string | null) => {
    if (!groupId || activeGroupId === groupId) {
      setRulesFilterClauses(removeFilterClause(rulesFilterClauses, 'group'));
      return;
    }
    setRulesFilterClauses(
      upsertFilterClause(rulesFilterClauses, {
        fieldId: 'group',
        operator: 'is',
        values: [groupId],
      })
    );
  };

  if (!isRulesRightSidebarOpen) return null;

  return (
    <div
      style={{
        flex: '0 0 auto',
        width: sidebarWidth,
        height: '100%',
        position: 'relative',
        zIndex: 90,
        display: 'block',
      }}
    >
      <div
        aria-hidden="true"
        data-sidebar-resize-handle="true"
        onPointerDown={handleResizePointerDown}
        onMouseEnter={() => setIsResizeHandleHovered(true)}
        onMouseLeave={() => setIsResizeHandleHovered(false)}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: -3,
          width: 7,
          zIndex: 91,
          cursor: 'col-resize',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 3,
            width: 1,
            backgroundColor: 'lch(100% 0 272 / 0.72)',
            opacity: isResizing || isResizeHandleHovered ? 1 : 0,
            transition: 'opacity 250ms',
          }}
        />
      </div>

      <aside
        style={{
          display: 'flex',
          flexDirection: 'column',
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          width: sidebarWidth,
          height: '100%',
          overflow: 'hidden auto',
          padding: '0px 0px 8px 4px',
        }}
      >
        <div
          data-scroll-container="true"
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: sidebarWidth - 4,
            height: '100%',
            overflow: 'auto',
            scrollbarGutter: 'stable',
          }}
        >
          <div
            style={{
              width: sidebarWidth - 14,
              minHeight: 'calc(100% - 8px)',
              padding: '12px',
              margin: '0px 0px 8px',
              borderRadius: '10px',
              backgroundColor: 'lch(9.232 0.85 272)', // #141416
              border: '1px solid lch(13.553 1.93 272)', // #1e1e21
              boxShadow: '0px 0.5px 1px 1px rgba(0, 0, 0, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              userSelect: 'none',
            }}
          >
            {/* Pill Tab Header (Exact Linear 32px height & 28px pill) */}
            <div
              role="tablist"
              aria-orientation="horizontal"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                width: '100%',
                height: '32px',
                marginBottom: '8px',
                borderRadius: '5px',
                backgroundColor: 'lch(9.232% 0.85 272)',
              }}
            >
              {/* Groups Tab */}
              <button
                type="button"
                role="tab"
                aria-selected={activeRulesRightSidebarTab === 'groups'}
                onClick={() => setActiveRulesRightSidebarTab('groups')}
                onMouseEnter={() => setHoveredTab('groups')}
                onMouseLeave={() => setHoveredTab(null)}
                style={{
                  display: 'inline-flex',
                  flex: '1 0 auto',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '28px',
                  margin: '2px',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  backgroundColor:
                    activeRulesRightSidebarTab === 'groups'
                      ? 'lch(20.418% 1.429 272)'
                      : hoveredTab === 'groups'
                      ? 'lch(17.718% 1.043 272)'
                      : 'lch(13.861% 1.043 272)',
                  color:
                    activeRulesRightSidebarTab === 'groups'
                      ? 'lch(100% 0 272)'
                      : hoveredTab === 'groups'
                      ? 'lch(90.826% 1.425 272)'
                      : 'lch(63.304% 1.425 272)',
                  fontFamily: SIDEBAR_FONT,
                  fontSize: '12px',
                  fontWeight: 500,
                  border: '1px solid transparent',
                  cursor: 'pointer',
                  outline: 'none',
                  whiteSpace: 'nowrap',
                  transition:
                    'border 150ms, background-color 150ms, color 150ms, opacity 150ms',
                }}
              >
                Groups
              </button>

              {/* Rules Tab */}
              <button
                type="button"
                role="tab"
                aria-selected={activeRulesRightSidebarTab === 'rules'}
                onClick={() => setActiveRulesRightSidebarTab('rules')}
                onMouseEnter={() => setHoveredTab('rules')}
                onMouseLeave={() => setHoveredTab(null)}
                style={{
                  display: 'inline-flex',
                  flex: '1 0 auto',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '28px',
                  margin: '2px',
                  padding: '4px 12px',
                  borderRadius: '9999px',
                  backgroundColor:
                    activeRulesRightSidebarTab === 'rules'
                      ? 'lch(20.418% 1.429 272)'
                      : hoveredTab === 'rules'
                      ? 'lch(17.718% 1.043 272)'
                      : 'lch(13.861% 1.043 272)',
                  color:
                    activeRulesRightSidebarTab === 'rules'
                      ? 'lch(100% 0 272)'
                      : hoveredTab === 'rules'
                      ? 'lch(90.826% 1.425 272)'
                      : 'lch(63.304% 1.425 272)',
                  fontFamily: SIDEBAR_FONT,
                  fontSize: '12px',
                  fontWeight: 500,
                  border: '1px solid transparent',
                  cursor: 'pointer',
                  outline: 'none',
                  whiteSpace: 'nowrap',
                  transition:
                    'border 150ms, background-color 150ms, color 150ms, opacity 150ms',
                }}
              >
                Rules
              </button>
            </div>

            {/* Content List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {activeRulesRightSidebarTab === 'groups' ? (
                <>
                  {/* All Rules Master Row */}
                  <SidebarFilterRow
                    name="All rules"
                    count={rules.length}
                    leading={
                      <div style={{ display: 'flex', alignItems: 'center', marginRight: 8 }}>
                        <LinearBacklogDashedIcon size={14} className="text-zinc-400" />
                      </div>
                    }
                    isActive={activeGroupId === null}
                    isHovered={hoveredItemId === 'all-rules-group'}
                    onToggle={() => setGroupQuickFilter(null)}
                    onClear={() => setGroupQuickFilter(null)}
                    onMouseEnter={() => setHoveredItemId('all-rules-group')}
                    onMouseLeave={() => setHoveredItemId(null)}
                  />

                  {/* Individual Rule Groups */}
                  {ruleGroups.map((group) => {
                    const count = rules.filter((r) => group.ruleIds.includes(r.id)).length;
                    const isActive = activeGroupId === group.id;
                    const isHovered = hoveredItemId === group.id;

                    return (
                      <SidebarFilterRow
                        key={group.id}
                        name={group.name}
                        count={count}
                        leading={
                          <div style={{ display: 'flex', alignItems: 'center', marginRight: 8 }}>
                            {getGroupIcon(group.icon)}
                          </div>
                        }
                        isActive={isActive}
                        isHovered={isHovered}
                        onToggle={() => setGroupQuickFilter(group.id)}
                        onClear={() => setGroupQuickFilter(null)}
                        onMouseEnter={() => setHoveredItemId(group.id)}
                        onMouseLeave={() => setHoveredItemId(null)}
                      />
                    );
                  })}
                </>
              ) : (
                <>
                  {/* Rules Tab: Individual Rules */}
                  {rules.map((rule) => {
                    const isActive = selectedRuleId === rule.id;
                    const isHovered = hoveredItemId === rule.id;

                    return (
                      <SidebarFilterRow
                        key={rule.id}
                        name={rule.name}
                        count={1}
                        leading={
                          <div style={{ display: 'flex', alignItems: 'center', marginRight: 8 }}>
                            <LinearStatusCircleIcon
                              status={
                                rule.status === 'paused'
                                  ? 'paused'
                                  : rule.status === 'triggered'
                                  ? 'scaling'
                                  : 'active'
                              }
                              size={12}
                            />
                          </div>
                        }
                        isActive={isActive}
                        isHovered={isHovered}
                        onToggle={() =>
                          setSelectedRuleId(isActive ? null : rule.id)
                        }
                        onClear={() => setSelectedRuleId(null)}
                        onMouseEnter={() => setHoveredItemId(rule.id)}
                        onMouseLeave={() => setHoveredItemId(null)}
                      />
                    );
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
};
