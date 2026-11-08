import { shortDate } from '../changelog/dates';
import type { Entry } from '../changelog/entries';
import { Inline } from '../changelog/Inline';
import { cx } from '../ui/cx';
import site from '../ui/Site.module.css';
import styles from './ChangelogCards.module.css';

const CARDS = 4;

/** The landing's Changelog as linear.app's: the four newest releases on one timeline, the newest with a red dot. */
export function ChangelogCards({ entries }: { entries: Entry[] }) {
  return (
    <section id="changelog" className={cx(site.siteContainer, styles.changelog)} aria-labelledby="changelog-title">
      <h2 id="changelog-title" className={styles.changelogTitle}>Changelog</h2>
      <div className={styles.changelogGrid}>
        {entries.slice(0, CARDS).map((entry, index) => (
          <a key={entry.slug} className={cx(styles.changelogItem, index === 0 && styles.isLatest)} href={entry.url}>
            <span className={styles.changelogDot} aria-hidden="true" />
            <h3><Inline text={entry.title} /></h3>
            <p><Inline text={entry.summary} /></p>
            <time dateTime={entry.date}>{shortDate(entry.date)}</time>
          </a>
        ))}
      </div>
      <a className={styles.changelogAll} href="/changelog"><span>View all</span><span className={styles.changelogAllArrow} aria-hidden="true">→</span></a>
    </section>
  );
}
