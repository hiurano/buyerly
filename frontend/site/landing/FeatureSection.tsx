import type { ReactNode } from 'react';
import { cx } from '../ui/cx';
import site from '../ui/Site.module.css';
import styles from './Feature.module.css';

export interface Spec {
  /** The popover's id, which its "+" button opens. */
  id: string;
  name: string;
  text: string;
}

interface FeatureSectionProps {
  id: string;
  labelId: string;
  title: ReactNode;
  description: string;
  /** The illustration, a featureStage element. */
  stage: ReactNode;
  specs: Spec[];
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06L8 9.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L9.06 8l3.72-3.72a.75.75 0 0 0-1.06-1.06L8 6.94 4.28 3.22Z" />
    </svg>
  );
}

/**
 * A feature section as linear.app's: the title and text in two halves, the
 * illustration, and a Features list whose "+" opens each Tech specs side
 * panel, an HTML popover that needs no script.
 */
export function FeatureSection({ id, labelId, title, description, stage, specs }: FeatureSectionProps) {
  return (
    <section id={id} className={styles.feature} aria-labelledby={labelId}>
      <div className={cx(site.siteContainer, styles.featureHeader)}>
        <h2 id={labelId} className={styles.featureTitle}>{title}</h2>
        <p className={styles.featureDesc}>{description}</p>
      </div>
      {stage}
      <div className={cx(site.siteContainer, styles.featureFooter)}>
        <span className={styles.featureLabel}>Features</span>
        <ul className={styles.featureList}>
          {specs.map((spec, index) => (
            <li key={spec.id} className={cx(styles.featureItem, index % 2 === 1 && styles.isUneven)}>
              <button className={styles.featureButton} type="button" popoverTarget={spec.id}><span>{spec.name}</span><span className={styles.featurePlus} aria-hidden="true">+</span></button>
            </li>
          ))}
        </ul>
      </div>
      {specs.map((spec) => (
        <div key={spec.id} className={styles.spec} id={spec.id} popover="">
          <div className={styles.specHeader}>
            <span className={styles.specLabel}>Tech specs</span>
            <button className={styles.specClose} type="button" popoverTarget={spec.id} popoverTargetAction="hide" aria-label="Close"><CloseIcon /></button>
          </div>
          <div className={styles.specBody}>
            <h3>{spec.name}</h3>
            <p>{spec.text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
