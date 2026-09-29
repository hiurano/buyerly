import React from 'react';
import type { Workspace } from '@/lib/types';

/** A workspace's own mark: its logo, or its badge letters on its badge color. */
export const WorkspaceAvatar: React.FC<{ workspace: Workspace; size?: number }> = ({ workspace, size = 18 }) => {
  if (workspace.logo_url) {
    return (
      <img
        src={workspace.logo_url}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="shrink-0 object-cover"
        style={{ width: size, height: size, borderRadius: 4 }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center font-semibold text-white"
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        fontSize: Math.round(size / 2),
        backgroundColor: workspace.badge_color || '#F5A300',
      }}
    >
      {workspace.badge_text || workspace.name.charAt(0).toUpperCase()}
    </span>
  );
};
