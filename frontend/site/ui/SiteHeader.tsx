import { BrandMark } from './BrandMark';
import { cx } from './cx';
import site from './Site.module.css';
import styles from './SiteHeader.module.css';

/** The fixed header of every public page; on phones its links move into a popover menu, which needs no script. */
export function SiteHeader() {
  return (
    <header className={styles.siteHeader}>
      <nav className={cx(site.siteContainer, styles.siteHeaderInner)} aria-label="Main navigation">
        <a className={styles.siteBrand} href="/" aria-label="Buyerly home"><BrandMark /><span>Buyerly</span></a>
        <div className={styles.siteNav}>
          <a className={styles.siteNavLink} href="/#product">Product</a>
          <a className={styles.siteNavLink} href="/changelog">Changelog</a>
          <a className={styles.siteNavLink} href="#contact">Contact</a>
          <span className={styles.siteNavDivider} aria-hidden="true" />
          <a className={styles.siteNavLink} href="/login">Log in</a>
          <a className={site.siteButtonInvert} href="/signup">Sign up</a>
          <button className={styles.siteMenuButton} type="button" popoverTarget="site-menu" aria-label="Menu">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M2 4.75A.75.75 0 0 1 2.75 4h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 6.5a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z" />
            </svg>
          </button>
        </div>
        <div id="site-menu" className={styles.siteMenu} popover="">
          <a href="/#product">Product</a>
          <a href="/changelog">Changelog</a>
          <a href="#contact">Contact</a>
          <a href="/login">Log in</a>
        </div>
      </nav>
    </header>
  );
}
