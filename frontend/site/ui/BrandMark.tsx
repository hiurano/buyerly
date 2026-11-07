import { cx } from './cx';
import site from './Site.module.css';

/** Buyerly's logo mark, drawn in the theme's logo colour through the PNG as a mask. */
export function BrandMark({ className }: { className?: string }) {
  return <span className={cx(site.siteBrandMark, className)} aria-hidden="true" />;
}
