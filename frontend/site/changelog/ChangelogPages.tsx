import { Document } from '../ui/Document';
import { cx } from '../ui/cx';
import { longDate } from './dates';
import type { Entry } from './entries';
import { Inline } from './Inline';
import { ReleaseBody } from './ReleaseBody';
import styles from './Changelog.module.css';

// The changelog as linear.app/changelog (#435): every release on /changelog,
// newest first on a timeline, and each one on its own page.

function BackIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M10.53 11.47a.75.75 0 1 1-1.06 1.06l-4-4a.75.75 0 0 1-.01-1.05l3.9-4a.75.75 0 1 1 1.08 1.04L7.06 8l3.47 3.47Z" />
    </svg>
  );
}

export function ChangelogIndex({ stylesheet, entries }: { stylesheet: string; entries: Entry[] }) {
  return (
    <Document
      title="Changelog — Buyerly"
      description="New features and improvements in Buyerly."
      stylesheet={stylesheet}
      current="changelog"
      bodyClassName={styles.changelogBody}
    >
      <main id="main" className={styles.changelogPage} tabIndex={-1}>
        <h1 className={styles.changelogPageTitle}>Changelog</h1>
        <hr className={styles.changelogDivider} />
        {entries.map((entry, index) => (
          <article key={entry.slug} className={cx(styles.changelogRelease, index === 0 && styles.isLatest)} id={entry.slug}>
            <div className={styles.changelogReleaseDate}><time dateTime={entry.date}>{longDate(entry.date)}</time></div>
            <div className={styles.changelogReleaseBody}>
              <h2 className={styles.changelogReleaseTitle}><a href={entry.url}><Inline text={entry.title} /></a></h2>
              <ReleaseBody entry={entry} />
            </div>
          </article>
        ))}
      </main>
    </Document>
  );
}

export function ChangelogRelease({ stylesheet, entry }: { stylesheet: string; entry: Entry }) {
  return (
    <Document
      title={`${entry.title} — Changelog — Buyerly`}
      description={entry.summary}
      stylesheet={stylesheet}
      current="changelog"
      bodyClassName={styles.changelogBody}
    >
      <main id="main" className={cx(styles.changelogPage, styles.changelogPermalink)} tabIndex={-1}>
        <div className={styles.changelogPermalinkBar}>
          <a className={styles.changelogBack} href="/changelog"><BackIcon /><span>Changelog</span></a>
          <a className={styles.changelogPermalinkDate} href={entry.url}><time dateTime={entry.date}>{longDate(entry.date)}</time></a>
        </div>
        <article className={styles.changelogRelease} id={entry.slug}>
          <div className={styles.changelogReleaseBody}>
            <h1 className={styles.changelogReleaseTitle}><Inline text={entry.title} /></h1>
            <ReleaseBody entry={entry} />
          </div>
        </article>
      </main>
    </Document>
  );
}
