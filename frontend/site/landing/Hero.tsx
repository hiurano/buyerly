import { cx } from '../ui/cx';
import site from '../ui/Site.module.css';
import hero from './Hero.module.css';
import mockup from './Mockup.module.css';

/** The rules mark in the Rules column. */
function RulesIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.397 1.482a1.501 1.501 0 0 1 2.594 1.184L10.677 5.5H12.5a1.5 1.5 0 0 1 1.102 2.518l-6 6.5a1.5 1.5 0 0 1-2.593-1.184l.314-2.834H3.5a1.5 1.5 0 0 1-1.103-2.518zM3.5 9H7l-.5 4.5 6-6.5H9l.5-4.5z"
      />
    </svg>
  );
}

/** The hero as linear.app's: the title, the subline with the New link, and the app frame with Buyerly's own sidebar and Ads Manager in the app's tokens. */
export function Hero() {
  return (
    <section aria-labelledby="hero-title">
      <div className={cx(site.siteContainer, hero.heroCopy)}>
        <h1 id="hero-title" className={hero.heroTitle}>
          <span className={hero.heroLine}>The operations system</span>
          <br className={hero.heroBreak} /> <span className={hero.heroLine}>for Meta Ads teams</span>
        </h1>
        <div className={hero.heroSub}>
          <p>Purpose-built for media buyers. Monitor every account, automate the routine, and keep the team in the loop.</p>
          <a className={hero.heroNew} href="#changelog">
            <span className={hero.heroNewLabel}>New</span>
            <span>Rules board →</span>
          </a>
        </div>
      </div>
      <div className={hero.heroVisual} aria-hidden="true">
        <div className={hero.heroFrameWrap}>
          <div className={mockup.appFrame}>
            <div className={mockup.appSidebar}>
              <div className={mockup.appWs}>
                <span className={mockup.appWsName}>
                  <span className={mockup.appWsInitial}>N</span>
                  Northwind
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M4.47 6.47a.75.75 0 0 1 1.06 0L8 8.94l2.47-2.47a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </span>
                <span className={mockup.appIconBtn}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M7 2.5a4.5 4.5 0 1 0 2.81 8.02l2.84 2.84a.75.75 0 1 0 1.06-1.06l-2.84-2.84A4.5 4.5 0 0 0 7 2.5ZM4 7a3 3 0 1 1 6 0 3 3 0 0 1-6 0Z"
                    />
                  </svg>
                </span>
              </div>
              <div className={mockup.appNav}>
                <span className={mockup.appNavItem}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M11.0069 1.00879C12.0235 1.09224 12.8967 1.78967 13.1944 2.78027L14.8907 8.42871C15.0034 8.80411 15.0258 9.20103 14.9571 9.58691L14.5069 12.1143L14.4375 12.4219C14.0542 13.8306 12.8312 14.8559 11.378 14.9863L11.0625 15H4.92875L4.6143 14.9863C3.16087 14.8561 1.93819 13.8307 1.55473 12.4219L1.48539 12.1143L1.03422 9.58691C0.974045 9.24914 0.984493 8.90311 1.06352 8.57031L1.1016 8.42871L2.79691 2.78027C3.09453 1.78948 3.96862 1.09214 4.98539 1.00879L5.19047 1H10.8018L11.0069 1.00879ZM2.96098 11.8516C3.13119 12.8053 3.96043 13.4999 4.92875 13.5H11.0625C12.031 13.5 12.8611 12.8054 13.0313 11.8516L13.2715 10.5H11.6211C11.2249 10.5 10.8512 10.6738 10.5957 10.9697L10.4932 11.1035C10.1201 11.6634 9.49195 11.9999 8.81938 12H7.17191C6.54154 11.9998 5.95019 11.7042 5.57133 11.2061L5.49809 11.1035C5.24687 10.7266 4.82396 10.5 4.37113 10.5H2.71977L2.96098 11.8516ZM5.19047 2.5C4.80433 2.50005 4.45748 2.72173 4.29203 3.06055L4.23246 3.21191L2.53715 8.86035C2.5234 8.90613 2.514 8.95293 2.50688 9H4.37113C5.32524 9.00001 6.21689 9.47715 6.74613 10.2715L6.78422 10.3223C6.88083 10.4341 7.02214 10.4998 7.17191 10.5H8.81938C8.99076 10.4999 9.15106 10.4142 9.24613 10.2715L9.34965 10.126C9.88713 9.41919 10.7268 9 11.6211 9H13.4854C13.4785 8.95295 13.4689 8.90616 13.4551 8.86035L11.7588 3.21191C11.6318 2.78947 11.2427 2.50018 10.8018 2.5H5.19047Z"
                    />
                  </svg>
                  Inbox<span className={mockup.appNavCount}>3</span>
                </span>
                <span className={mockup.appNavItem}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M14.083,8 L14.083,10.667 Q14.083,10.977 13.863,11.197 Q13.674,11.387 13.417,11.413 L13.417,12.667 Q13.417,13.253 13.002,13.669 Q12.587,14.083 12,14.083 L4,14.083 Q1.917,14.083 1.917,12 L1.917,4 Q1.917,1.917 4,1.917 L10.667,1.917 Q12.083,1.917 12.083,3.333 L12.083,4.585 Q13.417,4.625 13.417,6 L13.417,7.254 Q13.674,7.28 13.863,7.47 Q14.083,7.689 14.083,8 Z M11.917,11.417 L10.667,11.417 Q8.583,11.417 8.583,9.333 Q8.583,7.25 10.667,7.25 L11.917,7.25 L11.917,6.083 L4,6.083 Q3.685,6.083 3.417,6.035 L3.417,12 Q3.417,12.583 4,12.583 L11.917,12.583 Z M10.583,4.583 L10.583,3.417 L4,3.417 Q3.417,3.417 3.417,4 Q3.417,4.583 4,4.583 Z M12.583,8.75 L10.667,8.75 Q10.083,8.75 10.083,9.333 Q10.083,9.917 10.667,9.917 L12.583,9.917 Z"
                    />
                  </svg>
                  Ad accounts
                </span>
                <span className={cx(mockup.appNavItem, mockup.isActive)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11.265 3.002c-1.23 0-2.191.93-3.061 2.11-1.196-1.528-2.197-2.11-3.394-2.11C2.37 3.002.5 6.188.5 9.56c0 2.11 1.018 3.441 2.722 3.441 1.227 0 2.11-.58 3.678-3.331l1.104-1.956q.236.383.498.825l.735 1.241c1.433 2.406 2.232 3.221 3.678 3.221 1.66 0 2.585-1.35 2.585-3.504 0-3.53-1.912-6.496-4.235-6.496M5.704 8.926c-1.272 2-1.712 2.448-2.42 2.448-.729 0-1.162-.641-1.162-1.786 0-2.448 1.217-4.952 2.668-4.952.785 0 1.442.456 2.447 1.9a200 200 0 0 0-1.533 2.39m4.8-.252-.88-1.471a31 31 0 0 0-.686-1.072c.793-1.228 1.447-1.84 2.224-1.84 1.616 0 2.908 2.387 2.908 5.318 0 1.117-.365 1.765-1.12 1.765-.725 0-1.07-.48-2.446-2.7" />
                  </svg>
                  Campaigns
                </span>
                <span className={mockup.appNavItem}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M8.397 1.482a1.501 1.501 0 0 1 2.594 1.184L10.677 5.5H12.5a1.5 1.5 0 0 1 1.102 2.518l-6 6.5a1.5 1.5 0 0 1-2.593-1.184l.314-2.834H3.5a1.5 1.5 0 0 1-1.103-2.518zM3.5 9H7l-.5 4.5 6-6.5H9l.5-4.5z"
                    />
                  </svg>
                  Rules
                </span>
              </div>
            </div>
            <div className={mockup.appView}>
              <div className={mockup.appViewHeader}>
                <span className={mockup.appViewTitle}>Campaigns</span>
                <span className={mockup.appGhostBtn}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8.75 4C8.75 3.58579 8.41421 3.25 8 3.25C7.58579 3.25 7.25 3.58579 7.25 4V7.25H4C3.58579 7.25 3.25 7.58579 3.25 8C3.25 8.41421 3.58579 8.75 4 8.75H7.25V12C7.25 12.4142 7.58579 12.75 8 12.75C8.41421 12.75 8.75 12.4142 8.75 12V8.75H12C12.4142 8.75 12.75 8.41421 12.75 8C12.75 7.58579 12.4142 7.25 12 7.25H8.75V4Z" />
                  </svg>
                  Add account
                </span>
              </div>
              <div className={mockup.appToolbar}>
                <div className={mockup.appTabs}>
                  <span className={cx(mockup.appTab, mockup.isActive)}>Campaigns</span>
                  <span className={mockup.appTab}>Ad sets</span>
                  <span className={mockup.appTab}>Ads</span>
                </div>
                <div className={mockup.appTools}>
                  <span className={mockup.appPeriod}>
                    Today <span>▾</span>
                  </span>
                  <span className={mockup.appIconBtn}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M14.25 3a.75.75 0 0 1 0 1.5H1.75a.75.75 0 0 1 0-1.5h12.5ZM4 8a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 8Zm2.75 3.5a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5h-2.5Z"
                      />
                    </svg>
                  </span>
                  <span className={mockup.appIconBtn}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M7 2.5C8.11933 2.5 9.06613 3.23584 9.38477 4.25H14.75C15.1642 4.25 15.5 4.58579 15.5 5C15.5 5.41421 15.1642 5.75 14.75 5.75H9.38477C9.06613 6.76416 8.11933 7.5 7 7.5C5.88067 7.5 4.93387 6.76416 4.61523 5.75H2.25C1.83579 5.75 1.5 5.41421 1.5 5C1.5 4.58579 1.83579 4.25 2.25 4.25H4.61523C4.93387 3.23584 5.88067 2.5 7 2.5ZM7 4C6.44772 4 6 4.44772 6 5C6 5.55228 6.44772 6 7 6C7.55228 6 8 5.55228 8 5C8 4.44772 7.55228 4 7 4Z"
                      />
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M10 13.5C8.88067 13.5 7.93387 12.7642 7.61523 11.75H2.25C1.83579 11.75 1.5 11.4142 1.5 11C1.5 10.5858 1.83579 10.25 2.25 10.25H7.61523C7.93387 9.23584 8.88067 8.5 10 8.5C11.1193 8.5 12.0661 9.23584 12.3848 10.25H14.75C15.1642 10.25 15.5 10.5858 15.5 11C15.5 11.4142 15.1642 11.75 14.75 11.75H12.3848C12.0661 12.7642 11.1193 13.5 10 13.5ZM10 12C10.5523 12 11 11.5523 11 11C11 10.4477 10.5523 10 10 10C9.44772 10 9 10.4477 9 11C9 11.5523 9.44772 12 10 12Z"
                      />
                    </svg>
                  </span>
                </div>
              </div>
              <div className={mockup.appTable}>
                <div className={cx(mockup.appRow, mockup.isHead)}>
                  <span>Name</span>
                  <span>Budget</span>
                  <span>Spend</span>
                  <span>Impr.</span>
                  <span>CTR</span>
                  <span>CPC</span>
                  <span>Leads</span>
                  <span>CPL</span>
                  <span>Rules</span>
                </div>
                <div className={mockup.appGroup}>
                  NL · Lead gen <span>5</span>
                </div>
                <div className={mockup.appRow}>
                  <span className={mockup.appName}>
                    <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    <b>NL | Leads | Broad 25–44</b>
                  </span>
                  <span>$120</span>
                  <span>$96.40</span>
                  <span>18,204</span>
                  <span>1.84%</span>
                  <span>$0.29</span>
                  <span>41</span>
                  <span>$2.35</span>
                  <span className={mockup.appRules}>
                    <RulesIcon />2 rules
                  </span>
                </div>
                <div className={mockup.appRow}>
                  <span className={mockup.appName}>
                    <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    <b>NL | Leads | Lookalike 3%</b>
                  </span>
                  <span>$80</span>
                  <span>$71.12</span>
                  <span>12,950</span>
                  <span>2.10%</span>
                  <span>$0.26</span>
                  <span>33</span>
                  <span>$2.16</span>
                  <span className={mockup.appRules}>
                    <RulesIcon />1 rule
                  </span>
                </div>
                <div className={mockup.appRow}>
                  <span className={mockup.appName}>
                    <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    <b>NL | Leads | Retargeting 30d</b>
                  </span>
                  <span>$40</span>
                  <span>$38.75</span>
                  <span>6,412</span>
                  <span>2.95%</span>
                  <span>$0.20</span>
                  <span>22</span>
                  <span>$1.76</span>
                  <span className={mockup.appRules}>
                    <RulesIcon />1 rule
                  </span>
                </div>
                <div className={cx(mockup.appRow, mockup.isOff)}>
                  <span className={mockup.appName}>
                    <i className={mockup.appSwitch} />
                    <b>NL | Leads | Interests · Finance</b>
                  </span>
                  <span>$60</span>
                  <span>$44.10</span>
                  <span>9,870</span>
                  <span>0.92%</span>
                  <span>$0.49</span>
                  <span>0</span>
                  <span>
                    <span className={mockup.appMuted}>—</span>
                  </span>
                  <span className={mockup.appRules}>
                    <RulesIcon />1 rule
                  </span>
                </div>
                <div className={mockup.appRow}>
                  <span className={mockup.appName}>
                    <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    <b>NL | Leads | Creative test #14</b>
                  </span>
                  <span>$50</span>
                  <span>$23.30</span>
                  <span>4,118</span>
                  <span>1.37%</span>
                  <span>$0.41</span>
                  <span>9</span>
                  <span>$2.59</span>
                  <span className={cx(mockup.appRules, mockup.appMuted)}>—</span>
                </div>
                <div className={mockup.appGroup}>
                  US · Sweepstakes <span>4</span>
                </div>
                <div className={mockup.appRow}>
                  <span className={mockup.appName}>
                    <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    <b>US | Sweeps | Broad</b>
                  </span>
                  <span>$300</span>
                  <span>$212.84</span>
                  <span>41,226</span>
                  <span>1.12%</span>
                  <span>$0.46</span>
                  <span>118</span>
                  <span>$1.80</span>
                  <span className={mockup.appRules}>
                    <RulesIcon />3 rules
                  </span>
                </div>
                <div className={mockup.appRow}>
                  <span className={mockup.appName}>
                    <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    <b>US | Sweeps | Advantage+</b>
                  </span>
                  <span>$250</span>
                  <span>$187.03</span>
                  <span>38,904</span>
                  <span>1.31%</span>
                  <span>$0.37</span>
                  <span>97</span>
                  <span>$1.93</span>
                  <span className={mockup.appRules}>
                    <RulesIcon />2 rules
                  </span>
                </div>
                <div className={mockup.appRow}>
                  <span className={mockup.appName}>
                    <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    <b>US | Sweeps | Lookalike 1%</b>
                  </span>
                  <span>$150</span>
                  <span>$131.66</span>
                  <span>22,310</span>
                  <span>1.48%</span>
                  <span>$0.40</span>
                  <span>64</span>
                  <span>$2.06</span>
                  <span className={mockup.appRules}>
                    <RulesIcon />1 rule
                  </span>
                </div>
                <div className={cx(mockup.appRow, mockup.isOff)}>
                  <span className={mockup.appName}>
                    <i className={mockup.appSwitch} />
                    <b>US | Sweeps | Retargeting 7d</b>
                  </span>
                  <span>$70</span>
                  <span>$12.40</span>
                  <span>1,905</span>
                  <span>0.74%</span>
                  <span>$0.88</span>
                  <span>2</span>
                  <span>$6.20</span>
                  <span className={mockup.appRules}>
                    <RulesIcon />1 rule
                  </span>
                </div>
                <div className={mockup.appGroup}>
                  UK · Lead gen <span>3</span>
                </div>
                <div className={mockup.appRow}>
                  <span className={mockup.appName}>
                    <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    <b>UK | Leads | Broad 30–55</b>
                  </span>
                  <span>$90</span>
                  <span>$64.18</span>
                  <span>11,407</span>
                  <span>1.62%</span>
                  <span>$0.35</span>
                  <span>26</span>
                  <span>$2.47</span>
                  <span className={mockup.appRules}>
                    <RulesIcon />1 rule
                  </span>
                </div>
                <div className={mockup.appRow}>
                  <span className={mockup.appName}>
                    <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    <b>UK | Leads | Lookalike 2%</b>
                  </span>
                  <span>$70</span>
                  <span>$49.92</span>
                  <span>8,833</span>
                  <span>1.71%</span>
                  <span>$0.33</span>
                  <span>19</span>
                  <span>$2.63</span>
                  <span className={mockup.appRules}>
                    <RulesIcon />1 rule
                  </span>
                </div>
                <div className={mockup.appRow}>
                  <span className={mockup.appName}>
                    <i className={cx(mockup.appSwitch, mockup.isOn)} />
                    <b>UK | Leads | Creative test #6</b>
                  </span>
                  <span>$40</span>
                  <span>$17.45</span>
                  <span>3,201</span>
                  <span>1.28%</span>
                  <span>$0.43</span>
                  <span>6</span>
                  <span>$2.91</span>
                  <span className={cx(mockup.appRules, mockup.appMuted)}>—</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
