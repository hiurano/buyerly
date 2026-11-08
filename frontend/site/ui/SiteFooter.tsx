import { BrandMark } from './BrandMark';
import styles from './SiteFooter.module.css';

export type FooterPage = 'changelog' | 'about' | 'privacy' | 'terms';

/** A footer link, marked when it is the page on screen. */
function Link({ href, page, current, children }: { href: string; page?: FooterPage; current?: FooterPage; children: string }) {
  return <a href={href} aria-current={page && page === current ? 'page' : undefined}>{children}</a>;
}

/** The footer of every public page: the product and company links, the operator's identity, and the legal links. */
export function SiteFooter({ current }: { current?: FooterPage }) {
  return (
    <footer className={styles.siteFooter}>
      <div className={styles.siteFooterGrid}>
        <div className={styles.siteFooterLogo}>
          <a className={styles.siteFooterMark} href="/" aria-label="Buyerly home"><BrandMark className={styles.siteFooterMarkImage} /></a>
        </div>
        <nav className={styles.siteFooterCol} aria-labelledby="footer-product">
          <h2 id="footer-product">Product</h2>
          <ul>
            <li><Link href="/#product">Campaigns</Link></li>
            <li><Link href="/#rules">Rules</Link></li>
            <li><Link href="/#inbox">Inbox</Link></li>
            <li><Link href="/#team">Your team</Link></li>
            <li><Link href="/changelog" page="changelog" current={current}>Changelog</Link></li>
          </ul>
        </nav>
        <nav className={styles.siteFooterCol} aria-labelledby="footer-company">
          <h2 id="footer-company">Company</h2>
          <ul><li><Link href="/about" page="about" current={current}>About</Link></li></ul>
        </nav>
        <section id="contact" className={styles.siteFooterCol} aria-labelledby="contact-heading">
          <h2 id="contact-heading">Contact</h2>
          <ul><li><a href="mailto:contact@buyerly.app">contact@buyerly.app</a></li></ul>
        </section>
        <div className={styles.siteFooterOperator}>
          <p>Buyerly is operated by <strong>individual entrepreneur ARTEM PETRUCHENKO</strong></p>
          <p>Identification Number: 305879234</p>
          <address>Georgia, Tbilisi, Vake District, Besarion Zhgenti Street, No. 49, Apartment 20</address>
        </div>
        <nav className={styles.siteFooterLegal} aria-label="Legal">
          <Link href="/privacy" page="privacy" current={current}>Privacy</Link>
          <Link href="/terms" page="terms" current={current}>Terms</Link>
          <span className={styles.siteCopyright}>© 2026 Buyerly</span>
        </nav>
      </div>
    </footer>
  );
}
