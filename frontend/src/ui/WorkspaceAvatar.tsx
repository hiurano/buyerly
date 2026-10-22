import React, { useMemo, useState } from 'react';
import { AVATAR_PX, avatarColor, avatarInitials, initialsFontSize, type AvatarSize } from '@/lib/avatar';

export interface WorkspaceMark {
  id: number;
  name: string;
  logo_url?: string | null;
}

/**
 * A workspace's own mark, as Linear's: its logo, or initials of its name on a color from its id.
 * `px` resizes the box and keeps the size's font, as Linear's sidebar (20px) and settings (32px)
 * do with the regular avatar.
 */
export const WorkspaceAvatar: React.FC<{ workspace: WorkspaceMark; size?: AvatarSize; px?: number }> = ({
  workspace,
  size = 'small',
  px,
}) => {
  const box = px ?? AVATAR_PX[size];
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const initials = useMemo(() => avatarInitials(workspace.name), [workspace.name]);
  // Linear hashes a UUID; a short number alone lands on a few dark reds, so it gets a prefix.
  const background = useMemo(() => avatarColor(`workspace:${workspace.id}`), [workspace.id]);

  if (workspace.logo_url && workspace.logo_url !== failedLogo) {
    return (
      <img
        src={workspace.logo_url}
        width={box}
        height={box}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="shrink-0 object-cover"
        style={{ width: box, height: box, borderRadius: 8 }}
        onError={() => setFailedLogo(workspace.logo_url ?? null)}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 select-none items-center justify-center font-normal leading-none text-white"
      style={{
        width: box,
        height: box,
        borderRadius: 8,
        fontSize: initialsFontSize(size, initials),
        backgroundColor: background,
      }}
    >
      {initials}
    </span>
  );
};
