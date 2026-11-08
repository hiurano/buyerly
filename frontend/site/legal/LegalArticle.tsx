import type { ReactNode } from 'react';
import { longDate } from '../changelog/dates';
import { Document } from '../ui/Document';
import type { FooterPage } from '../ui/SiteFooter';
import styles from './Legal.module.css';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

interface LegalArticleProps {
  stylesheet: string;
  /** The heading on the page; the browser tab reads pageTitle. */
  title: string;
  pageTitle: string;
  description: string;
  current?: FooterPage;
  /** The day the document took effect, as YYYY-MM-DD. */
  effective?: string;
  intro: string;
  /** Numbered sections with linked contents above them, as the legal documents have. */
  numbered?: boolean;
  sections: LegalSection[];
}

/** A legal document or the About page: a 624px reading column under the site header. */
export function LegalArticle({ stylesheet, title, pageTitle, description, current, effective, intro, numbered, sections }: LegalArticleProps) {
  return (
    <Document title={pageTitle} description={description} stylesheet={stylesheet} current={current}>
      <main id="main" className={styles.legalArticle} tabIndex={-1}>
        <h1>{title}</h1>
        {effective && (
          <p className={styles.legalDate}>Effective date: <time dateTime={effective}>{longDate(effective)}</time></p>
        )}
        <p>{intro}</p>
        {numbered && (
          <nav className={styles.legalContents} aria-label="On this page">
            <ol>
              {sections.map((section) => (
                <li key={section.id}><a href={`#${section.id}`}>{section.title}</a></li>
              ))}
            </ol>
          </nav>
        )}
        {sections.map((section, index) => (
          <section key={section.id} id={section.id}>
            <h2>{numbered ? `${index + 1}. ${section.title}` : section.title}</h2>
            {section.body}
          </section>
        ))}
      </main>
    </Document>
  );
}
