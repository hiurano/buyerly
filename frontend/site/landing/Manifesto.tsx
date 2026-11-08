import { cx } from '../ui/cx';
import site from '../ui/Site.module.css';
import manifesto from './Manifesto.module.css';

/** The manifesto as linear.app's "A new species…" block: a statement and three figures, whose parts lift on hover. */
export function Manifesto() {
  return (
    <section className={cx(site.siteContainer, manifesto.manifesto)} aria-labelledby="manifesto-title">
      <h2 id="manifesto-title" className={manifesto.manifestoTitle}>
        <strong>A new kind of ad ops tool.</strong> Built around how buying teams actually work, Buyerly turns hours of manual checks into rules that run on
        their own.
      </h2>
      <div className={manifesto.manifestoGrid}>
        <div className={manifesto.manifestoItem}>
          <span className={manifesto.manifestoFig}>Fig 0.1</span>
          <div className={manifesto.manifestoArt}>
            <svg className={manifesto.figArt} viewBox="0 0 265 262" width="265" height="262" aria-hidden="true">
              <polygon className={manifesto.fLow} points="21.1,153.0 132.0,217.0 132.0,229.0 21.1,165.0" />
              <polygon className={manifesto.fLow} points="242.9,153.0 132.0,217.0 132.0,229.0 242.9,165.0" />
              <polygon className={manifesto.fMid} points="132.0,89.0 242.9,153.0 132.0,217.0 21.1,153.0" />
              <g className={manifesto.lift1}>
                <line className={manifesto.sDot} x1="132.0" y1="183.0" x2="132.0" y2="203.0" />
                <line className={manifesto.sDot} x1="52.3" y1="137.0" x2="52.3" y2="157.0" />
                <line className={manifesto.sDot} x1="211.7" y1="137.0" x2="211.7" y2="157.0" />
                <polygon className={manifesto.fLow} points="52.3,125.0 132.0,171.0 132.0,183.0 52.3,137.0" />
                <polygon className={manifesto.fLow} points="211.7,125.0 132.0,171.0 132.0,183.0 211.7,137.0" />
                <polygon className={manifesto.fMid} points="132.0,79.0 211.7,125.0 132.0,171.0 52.3,125.0" />
              </g>
              <g className={manifesto.lift2}>
                <line className={manifesto.sDot} x1="132.0" y1="137.0" x2="132.0" y2="157.0" />
                <line className={manifesto.sDot} x1="83.5" y1="109.0" x2="83.5" y2="129.0" />
                <line className={manifesto.sDot} x1="180.5" y1="109.0" x2="180.5" y2="129.0" />
                <polygon className={manifesto.fMid} points="83.5,97.0 132.0,125.0 132.0,137.0 83.5,109.0" />
                <polygon className={manifesto.fMid} points="180.5,97.0 132.0,125.0 132.0,137.0 180.5,109.0" />
                <polygon className={manifesto.fHi} points="132.0,69.0 180.5,97.0 132.0,125.0 83.5,97.0" />
              </g>
              <g className={manifesto.lift2}>
                <polygon className={manifesto.sHiThin} points="132.0,83.0 156.2,97.0 132.0,111.0 107.8,97.0" />
              </g>
            </svg>
          </div>
          <div className={manifesto.manifestoText}>
            <h3>Purpose-built</h3>
            <p>Shaped by the daily routine of media buyers: accounts, campaigns, ad sets and ads in one place.</p>
          </div>
        </div>
        <div className={manifesto.manifestoItem}>
          <span className={manifesto.manifestoFig}>Fig 0.2</span>
          <div className={manifesto.manifestoArt}>
            <svg className={manifesto.figArt} viewBox="0 0 265 262" width="265" height="262" aria-hidden="true">
              <g transform="matrix(0.8660254 0.5 -0.8660254 0.5 132 175)">
                <circle className={manifesto.fLow} r="86" />
              </g>
              <line className={manifesto.sMid} x1="26.7" y1="161" x2="26.7" y2="175" />
              <line className={manifesto.sMid} x1="237.3" y1="161" x2="237.3" y2="175" />
              <g transform="matrix(0.8660254 0.5 -0.8660254 0.5 132 161)">
                <circle className={manifesto.fMid} r="86" />
                <circle className={manifesto.sDot} r="60" />
                <line className={manifesto.sHi} x1="72.0" y1="0.0" x2="80.0" y2="0.0" />
                <line className={manifesto.sMid} x1="62.4" y1="36.0" x2="69.3" y2="40.0" />
                <line className={manifesto.sMid} x1="36.0" y1="62.4" x2="40.0" y2="69.3" />
                <line className={manifesto.sHi} x1="0.0" y1="72.0" x2="0.0" y2="80.0" />
                <line className={manifesto.sMid} x1="-36.0" y1="62.4" x2="-40.0" y2="69.3" />
                <line className={manifesto.sMid} x1="-62.4" y1="36.0" x2="-69.3" y2="40.0" />
                <line className={manifesto.sHi} x1="-72.0" y1="0.0" x2="-80.0" y2="0.0" />
                <line className={manifesto.sMid} x1="-62.4" y1="-36.0" x2="-69.3" y2="-40.0" />
                <line className={manifesto.sMid} x1="-36.0" y1="-62.4" x2="-40.0" y2="-69.3" />
                <line className={manifesto.sHi} x1="-0.0" y1="-72.0" x2="-0.0" y2="-80.0" />
                <line className={manifesto.sMid} x1="36.0" y1="-62.4" x2="40.0" y2="-69.3" />
                <line className={manifesto.sMid} x1="62.4" y1="-36.0" x2="69.3" y2="-40.0" />
                <g className={manifesto.sweep}>
                  <path className={manifesto.fSweep} d="M0 0 L56 0 A56 56 0 0 0 46.2 -31.6 Z" />
                  <line className={manifesto.sHi} x1="0" y1="0" x2="56" y2="0" />
                </g>
                <circle className={manifesto.fHiDot} r="4" />
              </g>
            </svg>
          </div>
          <div className={manifesto.manifestoText}>
            <h3>Automated</h3>
            <p>Rules check your campaigns every few minutes, around the clock, and act on them.</p>
          </div>
        </div>
        <div className={manifesto.manifestoItem}>
          <span className={manifesto.manifestoFig}>Fig 0.3</span>
          <div className={manifesto.manifestoArt}>
            <svg className={manifesto.figArt} viewBox="0 0 265 262" width="265" height="262" aria-hidden="true">
              <polygon className={manifesto.fLow} points="24.6,129.0 163.2,209.0 163.2,217.0 24.6,137.0" />
              <polygon className={manifesto.fLow} points="239.4,165.0 163.2,209.0 163.2,217.0 239.4,173.0" />
              <polygon className={manifesto.fMid} points="100.8,85.0 239.4,165.0 163.2,209.0 24.6,129.0" />
              <g>
                <polygon className={manifesto.fMid} points="52.3,111.0 100.8,139.0 100.8,157.0 52.3,129.0" />
                <polygon className={manifesto.fMid} points="149.3,111.0 100.8,139.0 100.8,157.0 149.3,129.0" />
                <polygon className={manifesto.fHi} points="100.8,83.0 149.3,111.0 100.8,139.0 52.3,111.0" />
                <g transform="matrix(0.8660254 0.5 -0.8660254 0.5 132.0 129.0)">
                  <text className={manifesto.tKey} x="-36" y="0" textAnchor="middle" dominantBaseline="central">
                    ⌘
                  </text>
                </g>
              </g>
              <g className={manifesto.press}>
                <polygon className={manifesto.fMid} points="114.7,147.0 163.2,175.0 163.2,193.0 114.7,165.0" />
                <polygon className={manifesto.fMid} points="211.7,147.0 163.2,175.0 163.2,193.0 211.7,165.0" />
                <polygon className={manifesto.fHi} points="163.2,119.0 211.7,147.0 163.2,175.0 114.7,147.0" />
                <g transform="matrix(0.8660254 0.5 -0.8660254 0.5 132.0 129.0)">
                  <text className={manifesto.tKey} x="36" y="0" textAnchor="middle" dominantBaseline="central">
                    K
                  </text>
                </g>
              </g>
            </svg>
          </div>
          <div className={manifesto.manifestoText}>
            <h3>Designed for speed</h3>
            <p>Keyboard-first, with ⌘K on every page to jump anywhere and act on anything.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
