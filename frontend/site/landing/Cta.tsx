import { cx } from '../ui/cx';
import site from '../ui/Site.module.css';
import styles from './Cta.module.css';

/** The closing call to action as linear.app's prefooter. */
export function Cta() {
  return (
    <section className={styles.cta} aria-labelledby="cta-title">
      <h2 id="cta-title" className={styles.ctaTitle}>Built for buyers. Available today.</h2>
      <div className={styles.ctaActions}>
        <a className={cx(site.siteButtonInvert, site.isLarge)} href="/signup">Sign up</a>
        <a className={site.siteButtonSecondary} href="/login">Log in</a>
      </div>
    </section>
  );
}
