import { FeatureSection, type Spec } from './FeatureSection';
import { cx } from '../ui/cx';
import feature from './Feature.module.css';
import mockup from './Mockup.module.css';

// Rules and automations: the rules list fading out, and the New rule window on the right half.

const specs: Spec[] = [
  {
    id: 'rules-onoff',
    name: 'Turn off and on',
    text: 'Rules turn campaigns, ad sets and ads off, or back on, when their conditions are met. Every action can be undone from the Inbox.',
  },
  {
    id: 'rules-budget',
    name: 'Budget up and down',
    text: 'Raise or lower an ad set’s budget by a percentage when it does well or badly, with a daily cap you set.',
  },
  {
    id: 'rules-examples',
    name: 'Ready-made examples',
    text: 'Start from tested examples, like stopping an ad set that spends without leads, and adjust the numbers to your account.',
  },
  {
    id: 'rules-board',
    name: 'Board view',
    text: 'See rules as a list or a board, grouped by status or label, and filter them by action, metric, window or ad account.',
  },
];

export function RulesFeature() {
  return (
    <FeatureSection
      id="rules"
      labelId="feature-rules"
      title={
        <>
          Rules
          <br /> and automations
        </>
      }
      description="Rules read like a sentence: when an ad set spends $20 with no leads, turn it off. They check every few minutes, around the clock, and act or notify you, with Undo."
      specs={specs}
      stage={
        <div className={cx(feature.featureStage, feature.isSplit)} aria-hidden="true">
          <div className={mockup.splitArt}>
            <div className={mockup.splitPanel}>
              <div className={mockup.rulesList}>
                <div className={mockup.accHead}>
                  <span className={mockup.appViewTitle}>Rules</span>
                  <span className={mockup.appTools}>
                    <span className={mockup.appPeriod}>
                      Group: Status <span>▾</span>
                    </span>
                  </span>
                </div>
                <div className={mockup.accGroup}>
                  <i className={cx(mockup.ruleStatus, mockup.isActive)} />
                  Active <span>4</span>
                </div>
                <div className={mockup.ruleRow}>
                  <span className={mockup.ruleId}>RUL-01</span>
                  <span className={mockup.ruleName}>Stop with no leads after $20</span>
                  <span className={mockup.ruleChip}>Spend ≥ $20 · Leads = 0</span>
                  <span className={mockup.ruleChip}>Turn off</span>
                  <span className={mockup.ruleLast}>12 min ago</span>
                </div>
                <div className={mockup.ruleRow}>
                  <span className={mockup.ruleId}>RUL-02</span>
                  <span className={mockup.ruleName}>Stop expensive leads</span>
                  <span className={mockup.ruleChip}>{'CPL > $12'}</span>
                  <span className={mockup.ruleChip}>Turn off</span>
                  <span className={mockup.ruleLast}>1 h ago</span>
                </div>
                <div className={mockup.ruleRow}>
                  <span className={mockup.ruleId}>RUL-03</span>
                  <span className={mockup.ruleName}>+20% on cheap purchases</span>
                  <span className={mockup.ruleChip}>{'CPP < $15'}</span>
                  <span className={mockup.ruleChip}>Budget +20%</span>
                  <span className={mockup.ruleLast}>3 h ago</span>
                </div>
                <div className={mockup.ruleRow}>
                  <span className={mockup.ruleId}>RUL-05</span>
                  <span className={mockup.ruleName}>Alert on CPReg above $25</span>
                  <span className={mockup.ruleChip}>{'CPReg > $25'}</span>
                  <span className={mockup.ruleChip}>Notify</span>
                  <span className={mockup.ruleLast}>Yesterday</span>
                </div>
                <div className={mockup.accGroup}>
                  <i className={cx(mockup.ruleStatus, mockup.isPaused)} />
                  Paused <span>1</span>
                </div>
                <div className={mockup.ruleRow}>
                  <span className={mockup.ruleId}>RUL-04</span>
                  <span className={mockup.ruleName}>−20% on weak CTR</span>
                  <span className={mockup.ruleChip}>{'CTR < 0.8%'}</span>
                  <span className={mockup.ruleChip}>Budget −20%</span>
                  <span className={mockup.ruleLast}>Oct 12</span>
                </div>
                <div className={mockup.accGroup}>
                  <i className={cx(mockup.ruleStatus, mockup.isReview)} />
                  Needs review <span>1</span>
                </div>
                <div className={mockup.ruleRow}>
                  <span className={mockup.ruleId}>RUL-06</span>
                  <span className={mockup.ruleName}>Turn on when a purchase lands</span>
                  <span className={mockup.ruleChip}>Purchases ≥ 1</span>
                  <span className={mockup.ruleChip}>Turn on</span>
                  <span className={mockup.ruleLast}>Never</span>
                </div>
              </div>
            </div>
            <div className={mockup.splitBox}>
              <div className={mockup.nr}>
                <div className={mockup.nrHead}>
                  <span className={mockup.nrCrumb}>Rules</span>
                  <span className={mockup.nrSep}>›</span>
                  <span className={mockup.nrTitle}>New rule</span>
                </div>
                <div className={mockup.nrName}>Spend ≥ 20 & Leads = 0 → Turn off</div>
                <div className={mockup.nrLine}>
                  <span className={mockup.nrKw}>When</span>
                  <span className={mockup.nrPill}>Ad set</span>
                  <span className={mockup.nrWord}>has</span>
                  <span className={mockup.nrPill}>all</span>
                  <span className={mockup.nrWord}>of</span>
                  <span className={mockup.nrCond}>
                    <b>Spend</b>
                    <i />
                    <span>≥</span>
                    <i />
                    <b>$20</b>
                  </span>
                  <span className={mockup.nrCond}>
                    <b>Leads</b>
                    <i />
                    <span>=</span>
                    <i />
                    <b>0</b>
                  </span>
                  <span className={cx(mockup.nrPill, mockup.isDashed)}>+ Condition</span>
                  <span className={mockup.nrPill}>Today</span>
                </div>
                <div className={mockup.nrLine}>
                  <span className={mockup.nrKw}>Then</span>
                  <span className={mockup.nrPill}>Turn the ad set off</span>
                </div>
                <div className={cx(mockup.nrLine, mockup.isProps)}>
                  <span className={mockup.nrPill}>Run on</span>
                  <span className={mockup.nrPill}>Labels</span>
                  <span className={mockup.nrPill}>Every 5 min</span>
                  <span className={mockup.nrPill}>Once a day</span>
                </div>
                <p className={mockup.nrHint}>
                  Checks each ad set every 5 min and turns it off when spend ≥ $20 and leads = 0 (today). Acts on the same ad set at most once a day.
                </p>
                <div className={mockup.nrFoot}>
                  <span className={cx(mockup.appSwitch, mockup.isOn)} />
                  <span>Create more</span>
                  <span className={mockup.nrCreate}>Create rule</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    />
  );
}
