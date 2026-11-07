import type { ReactNode } from 'react';
import type { Entry } from './entries';
import { Inline } from './Inline';
import styles from './Changelog.module.css';

const anchor = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8.47 3.53a3.25 3.25 0 0 1 4.6 4.6l-1.5 1.5a.75.75 0 1 1-1.07-1.06l1.5-1.5a1.75 1.75 0 0 0-2.47-2.48l-1.5 1.5a.75.75 0 0 1-1.06-1.06l1.5-1.5Zm-1.94 9.94a3.25 3.25 0 0 1-4.6-4.6l1.5-1.5a.75.75 0 0 1 1.07 1.06l-1.5 1.5a1.75 1.75 0 0 0 2.47 2.48l1.5-1.5a.75.75 0 1 1 1.06 1.06l-1.5 1.5Zm3-7a.75.75 0 0 1 0 1.06l-3 3a.75.75 0 0 1-1.06-1.06l3-3a.75.75 0 0 1 1.06 0Z" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M5.47 11.47a.75.75 0 1 0 1.06 1.06l4-4a.75.75 0 0 0 .01-1.05l-3.9-4a.75.75 0 1 0-1.08 1.04L8.94 8l-3.47 3.47Z" />
    </svg>
  );
}

/**
 * A release's text: the lead and its sub-headings (each with a link to itself),
 * then the Improvements and Fixes lists collapsed in one group at the end, as
 * linear.app/changelog shows them.
 */
export function ReleaseBody({ entry }: { entry: Entry }) {
  const parts: ReactNode[] = [];
  const lists: ReactNode[] = [];
  entry.body.forEach((block, index) => {
    if (block.kind === 'p') {
      parts.push(<p key={index}><Inline text={block.text} /></p>);
    } else if (block.kind === 'h') {
      const id = `${entry.slug}-${anchor(block.text)}`;
      parts.push(
        <h3 key={index} id={id}>
          <Inline text={block.text} />
          <a className={styles.changelogAnchor} href={`${entry.url}#${id}`} aria-label={`Link to ${block.text}`}><LinkIcon /></a>
        </h3>,
      );
    } else {
      lists.push(
        <details key={index} className={styles.changelogMore}>
          <summary>{block.name}<span className={styles.changelogChevron}><Chevron /></span></summary>
          <ul>{block.items.map((item, row) => <li key={row}><Inline text={item} /></li>)}</ul>
        </details>,
      );
    }
  });
  if (lists.length) parts.push(<div key="more" className={styles.changelogMoreGroup}>{lists}</div>);
  return parts;
}
