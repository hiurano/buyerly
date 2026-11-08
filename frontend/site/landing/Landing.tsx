import type { Entry } from '../changelog/entries';
import { Document } from '../ui/Document';
import { AdsManagerFeature } from './AdsManagerFeature';
import { ChangelogCards } from './ChangelogCards';
import { Cta } from './Cta';
import { Hero } from './Hero';
import { InboxFeature } from './InboxFeature';
import { Manifesto } from './Manifesto';
import { RulesFeature } from './RulesFeature';
import { TeamFeature } from './TeamFeature';
import styles from './Landing.module.css';

/** `/`, laid out like linear.app's homepage (#434). */
export function Landing({ stylesheet, entries }: { stylesheet: string; entries: Entry[] }) {
  return (
    <Document
      title="Meta Ads operations — Buyerly"
      description="Monitor Meta Ads performance, automate routine actions and keep your team informed with Buyerly."
      stylesheet={stylesheet}
    >
      <main id="main" className={styles.landing} tabIndex={-1}>
        <Hero />
        <Manifesto />
        <AdsManagerFeature />
        <RulesFeature />
        <InboxFeature />
        <TeamFeature />
        <ChangelogCards entries={entries} />
        <Cta />
      </main>
    </Document>
  );
}
