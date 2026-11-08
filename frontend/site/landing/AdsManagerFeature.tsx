import { FeatureSection, type Spec } from './FeatureSection';
import { cx } from '../ui/cx';
import site from '../ui/Site.module.css';
import feature from './Feature.module.css';
import mockup from './Mockup.module.css';

// Campaigns and accounts: the Ad accounts list with the Display options popover over it.

const specs: Spec[] = [
  {
    id: 'ads-accounts',
    name: 'Ad accounts',
    text: 'Every connected Meta ad account on one page, grouped by team, with its status, today’s spend, attached rules and whether automation is on.',
  },
  {
    id: 'ads-columns',
    name: 'Metrics and columns',
    text: 'Any metric as a column on campaigns, ad sets and ads: spend, impressions, CTR, CPC, link clicks, leads, CPL, registrations, purchases and more.',
  },
  {
    id: 'ads-filters',
    name: 'Filters and sorting',
    text: 'Filter and sort by any metric, status or attached rule. Filters and display options stay as you left them after a reload.',
  },
  {
    id: 'ads-grouping',
    name: 'Grouping and periods',
    text: 'Group ad sets and ads by campaign, and switch the period between today, yesterday and the last 3 or 7 days.',
  },
];

export function AdsManagerFeature() {
  return (
    <FeatureSection
      id="product"
      labelId="feature-ads"
      title={
        <>
          Campaigns
          <br /> and accounts
        </>
      }
      description="Every ad account, campaign, ad set and ad in one view. Any metric as a column, with filters, sorting, grouping and any period."
      specs={specs}
      stage={
        <div className={cx(site.siteContainer, feature.featureStage)} aria-hidden="true">
          <div className={feature.featureArt}>
            <div className={feature.featurePanel}>
              <div className={mockup.accView}>
                <div className={mockup.accHead}>
                  <span className={mockup.appViewTitle}>Ad accounts</span>
                  <span className={mockup.appTools}>
                    <span className={mockup.appPeriod}>
                      Group: Team <span>▾</span>
                    </span>
                  </span>
                </div>
                <div className={mockup.accTable}>
                  <div className={cx(mockup.accRow, mockup.isHead)}>
                    <span>Name</span>
                    <span>Status</span>
                    <span>Team</span>
                    <span className={mockup.accNum}>Spend today</span>
                    <span className={mockup.accNum}>Rules</span>
                    <span className={mockup.accAuto}>Automation</span>
                  </div>
                  <div className={mockup.accGroup}>
                    Lead gen <span>3</span>
                  </div>
                  <div className={mockup.accRow}>
                    <span className={mockup.accName}>
                      <i className={mockup.accAvatar}>NL</i>NL · Lead gen
                    </span>
                    <span className={mockup.accStatus}>
                      <i className={cx(mockup.accDot, mockup.isOk)} />
                      Active
                    </span>
                    <span>Lead gen</span>
                    <span className={mockup.accNum}>$412.80</span>
                    <span className={mockup.accNum}>4</span>
                    <span className={mockup.accAuto}>
                      <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    </span>
                  </div>
                  <div className={mockup.accRow}>
                    <span className={mockup.accName}>
                      <i className={mockup.accAvatar}>UK</i>UK · Lead gen
                    </span>
                    <span className={mockup.accStatus}>
                      <i className={cx(mockup.accDot, mockup.isOk)} />
                      Active
                    </span>
                    <span>Lead gen</span>
                    <span className={mockup.accNum}>$131.55</span>
                    <span className={mockup.accNum}>2</span>
                    <span className={mockup.accAuto}>
                      <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    </span>
                  </div>
                  <div className={mockup.accRow}>
                    <span className={mockup.accName}>
                      <i className={mockup.accAvatar}>DE</i>DE · Lead gen
                    </span>
                    <span className={mockup.accStatus}>
                      <i className={cx(mockup.accDot, mockup.isWarn)} />
                      In review
                    </span>
                    <span>Lead gen</span>
                    <span className={mockup.accNum}>$0.00</span>
                    <span className={mockup.accNum}>1</span>
                    <span className={mockup.accAuto}>
                      <i className={mockup.appSwitch} />
                    </span>
                  </div>
                  <div className={mockup.accGroup}>
                    Sweepstakes <span>2</span>
                  </div>
                  <div className={mockup.accRow}>
                    <span className={mockup.accName}>
                      <i className={mockup.accAvatar}>US</i>US · Sweepstakes
                    </span>
                    <span className={mockup.accStatus}>
                      <i className={cx(mockup.accDot, mockup.isOk)} />
                      Active
                    </span>
                    <span>Sweepstakes</span>
                    <span className={mockup.accNum}>$544.03</span>
                    <span className={mockup.accNum}>7</span>
                    <span className={mockup.accAuto}>
                      <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    </span>
                  </div>
                  <div className={mockup.accRow}>
                    <span className={mockup.accName}>
                      <i className={mockup.accAvatar}>CA</i>CA · Sweepstakes
                    </span>
                    <span className={mockup.accStatus}>
                      <i className={cx(mockup.accDot, mockup.isOk)} />
                      Active
                    </span>
                    <span>Sweepstakes</span>
                    <span className={mockup.accNum}>$96.17</span>
                    <span className={mockup.accNum}>3</span>
                    <span className={mockup.accAuto}>
                      <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    </span>
                  </div>
                  <div className={mockup.accGroup}>
                    E-commerce <span>2</span>
                  </div>
                  <div className={mockup.accRow}>
                    <span className={mockup.accName}>
                      <i className={mockup.accAvatar}>DE</i>DE · E-commerce
                    </span>
                    <span className={mockup.accStatus}>
                      <i className={cx(mockup.accDot, mockup.isOk)} />
                      Active
                    </span>
                    <span>E-commerce</span>
                    <span className={mockup.accNum}>$228.40</span>
                    <span className={mockup.accNum}>2</span>
                    <span className={mockup.accAuto}>
                      <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    </span>
                  </div>
                  <div className={mockup.accRow}>
                    <span className={mockup.accName}>
                      <i className={mockup.accAvatar}>FR</i>FR · E-commerce
                    </span>
                    <span className={mockup.accStatus}>
                      <i className={cx(mockup.accDot, mockup.isWarn)} />
                      Grace period
                    </span>
                    <span>E-commerce</span>
                    <span className={mockup.accNum}>$18.90</span>
                    <span className={mockup.accNum}>0</span>
                    <span className={mockup.accAuto}>
                      <i className={mockup.appSwitch} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={feature.featureCard}>
            <div className={mockup.dopt}>
              <div className={mockup.doptRow}>
                <span>Grouping</span>
                <span className={mockup.doptSelect}>
                  Campaign <span>▾</span>
                </span>
              </div>
              <div className={mockup.doptRow}>
                <span>Ordering</span>
                <span className={mockup.doptSelect}>
                  Spend <span>▾</span>
                </span>
              </div>
              <div className={mockup.doptSep} />
              <div className={mockup.doptTitle}>List options</div>
              <div className={mockup.doptSub}>Display properties</div>
              <div className={mockup.doptChips}>
                <span className={cx(mockup.doptChip, mockup.isOn)}>Delivery</span>
                <span className={cx(mockup.doptChip, mockup.isOn)}>Budget</span>
                <span className={cx(mockup.doptChip, mockup.isOn)}>Spend</span>
                <span className={mockup.doptChip}>Impressions</span>
                <span className={mockup.doptChip}>Reach</span>
                <span className={mockup.doptChip}>CPM</span>
                <span className={mockup.doptChip}>Clicks</span>
                <span className={cx(mockup.doptChip, mockup.isOn)}>CTR</span>
                <span className={mockup.doptChip}>CPC</span>
                <span className={mockup.doptChip}>Link clicks</span>
                <span className={mockup.doptChip}>Link CTR</span>
                <span className={mockup.doptChip}>Link CPC</span>
                <span className={mockup.doptChip}>Landing page views</span>
                <span className={cx(mockup.doptChip, mockup.isOn)}>Leads</span>
                <span className={cx(mockup.doptChip, mockup.isOn)}>CPL</span>
                <span className={mockup.doptChip}>Registrations</span>
                <span className={mockup.doptChip}>CPReg</span>
                <span className={mockup.doptChip}>Purchases</span>
                <span className={mockup.doptChip}>CPP</span>
                <span className={cx(mockup.doptChip, mockup.isOn)}>Rules</span>
                <span className={mockup.doptChip}>ID</span>
              </div>
            </div>
          </div>
        </div>
      }
    />
  );
}
