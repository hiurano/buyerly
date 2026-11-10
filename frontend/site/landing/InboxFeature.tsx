import { FeatureSection, type Spec } from './FeatureSection';
import { cx } from '../ui/cx';
import feature from './Feature.module.css';
import mockup from './Mockup.module.css';

// Inbox and notifications: four cards (Inbox, an event, the email and Telegram) on a carousel.

const specs: Spec[] = [
  {
    id: 'inbox-feed',
    name: 'Inbox',
    text: 'Rule actions, alerts and ad account changes in one feed for each teammate, with filters, search and the details of every event.',
  },
  {
    id: 'inbox-snooze',
    name: 'Snooze',
    text: 'Snooze a notification to a time you type, like 4 pm or 2 days, or pick a date. It comes back to the Inbox then.',
  },
  { id: 'inbox-email', name: 'Email', text: 'Get Inbox notifications by email a few minutes after they happen, all of them or only priority ones.' },
  {
    id: 'inbox-telegram',
    name: 'Telegram',
    text: 'Connect Telegram and get the same notifications as chat messages, with the ad account and workspace they came from.',
  },
];

export function InboxFeature() {
  return (
    <FeatureSection
      id="inbox"
      labelId="feature-inbox"
      title={
        <>
          Inbox
          <br /> and notifications
        </>
      }
      description="Every rule action and account change lands in each teammate’s Inbox, and by email or Telegram for those who turn it on."
      specs={specs}
      stage={
        <div className={cx(feature.featureStage, feature.isCarousel)} aria-hidden="true">
          <div className={mockup.carouselTrack}>
            <div className={mockup.carouselFrame}>
              <div className={mockup.cfHead}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M11.0069 1.00879C12.0235 1.09224 12.8967 1.78967 13.1944 2.78027L14.8907 8.42871C15.0034 8.80411 15.0258 9.20103 14.9571 9.58691L14.5069 12.1143L14.4375 12.4219C14.0542 13.8306 12.8312 14.8559 11.378 14.9863L11.0625 15H4.92875L4.6143 14.9863C3.16087 14.8561 1.93819 13.8307 1.55473 12.4219L1.48539 12.1143L1.03422 9.58691C0.974045 9.24914 0.984493 8.90311 1.06352 8.57031L1.1016 8.42871L2.79691 2.78027C3.09453 1.78948 3.96862 1.09214 4.98539 1.00879L5.19047 1H10.8018L11.0069 1.00879ZM2.96098 11.8516C3.13119 12.8053 3.96043 13.4999 4.92875 13.5H11.0625C12.031 13.5 12.8611 12.8054 13.0313 11.8516L13.2715 10.5H11.6211C11.2249 10.5 10.8512 10.6738 10.5957 10.9697L10.4932 11.1035C10.1201 11.6634 9.49195 11.9999 8.81938 12H7.17191C6.54154 11.9998 5.95019 11.7042 5.57133 11.2061L5.49809 11.1035C5.24687 10.7266 4.82396 10.5 4.37113 10.5H2.71977L2.96098 11.8516ZM5.19047 2.5C4.80433 2.50005 4.45748 2.72173 4.29203 3.06055L4.23246 3.21191L2.53715 8.86035C2.5234 8.90613 2.514 8.95293 2.50688 9H4.37113C5.32524 9.00001 6.21689 9.47715 6.74613 10.2715L6.78422 10.3223C6.88083 10.4341 7.02214 10.4998 7.17191 10.5H8.81938C8.99076 10.4999 9.15106 10.4142 9.24613 10.2715L9.34965 10.126C9.88713 9.41919 10.7268 9 11.6211 9H13.4854C13.4785 8.95295 13.4689 8.90616 13.4551 8.86035L11.7588 3.21191C11.6318 2.78947 11.2427 2.50018 10.8018 2.5H5.19047Z"
                  />
                </svg>
                <span>Inbox</span>
              </div>
              <div className={mockup.ibList}>
                <div className={cx(mockup.ibRow, mockup.isUnread)}>
                  <span className={mockup.ibAvatar}>
                    <span className={mockup.appWsMark} />
                  </span>
                  <span className={mockup.ibText}>
                    <b>Turned off</b>
                    <span>NL | Leads | Interests · Finance · Spend $21.40 ≥ $20 and 0 leads today</span>
                  </span>
                  <span className={mockup.ibTime}>2m</span>
                </div>
                <div className={cx(mockup.ibRow, mockup.isUnread)}>
                  <span className={mockup.ibAvatar}>
                    <span className={mockup.appWsMark} />
                  </span>
                  <span className={mockup.ibText}>
                    <b>Budget raised</b>
                    <span>{'US | Sweeps | Broad · $250 → $300 a day, CPL $1.80 < $2'}</span>
                  </span>
                  <span className={mockup.ibTime}>14m</span>
                </div>
                <div className={mockup.ibRow}>
                  <span className={mockup.ibAvatar}>
                    <span className={mockup.appWsMark} />
                  </span>
                  <span className={mockup.ibText}>
                    <b>Rule alert</b>
                    <span>{'UK | Leads | Creative test #6 · CPReg $27.10 > $25'}</span>
                  </span>
                  <span className={mockup.ibTime}>1h</span>
                </div>
                <div className={mockup.ibRow}>
                  <span className={mockup.ibAvatar}>
                    <span className={mockup.appWsMark} />
                  </span>
                  <span className={mockup.ibText}>
                    <b>Ad account needs attention</b>
                    <span>FR · E-commerce · Payment is in a grace period</span>
                  </span>
                  <span className={mockup.ibTime}>3h</span>
                </div>
                <div className={mockup.ibRow}>
                  <span className={mockup.ibAvatar}>
                    <span className={mockup.appWsMark} />
                  </span>
                  <span className={mockup.ibText}>
                    <b>Turned on</b>
                    <span>DE | Shop | Retargeting 7d · A purchase landed after the pause</span>
                  </span>
                  <span className={mockup.ibTime}>5h</span>
                </div>
              </div>
            </div>
            <div className={cx(mockup.carouselFrame, mockup.isGlowRight)}>
              <div className={mockup.cfHead}>
                <span className={mockup.cfCrumb}>Inbox</span>
                <span className={mockup.nrSep}>›</span>
                <span>Turned off</span>
              </div>
              <div className={mockup.ibDetail}>
                <h4>Turned off</h4>
                <p className={mockup.ibTarget}>NL | Leads | Interests · Finance</p>
                <div className={mockup.ibMessage}>Spend $21.40 ≥ $20 and 0 leads today. Rule RUL-01 “Stop with no leads after $20”.</div>
                <div className={mockup.ibMeta}>
                  <span>Ad set</span>
                  <span>NL · Lead gen</span>
                  <span>2 min ago</span>
                </div>
                <div className={mockup.ibActions}>
                  <span className={mockup.nrPill}>Snooze</span>
                  <span className={mockup.ibUndo}>Undo</span>
                </div>
              </div>
            </div>
            <div className={cx(mockup.carouselFrame, mockup.isGlowLeft)}>
              <div className={mockup.cfHead}>
                <span>Email</span>
                <span className={mockup.cfSub}>notifications@buyerly.app</span>
              </div>
              <div className={mockup.emCard}>
                <span className={mockup.emLogo}>Buyerly</span>
                <h4>Budget raised · US | Sweeps | Broad</h4>
                <p className={mockup.emContext}>US · Sweepstakes · Northwind</p>
                <div className={mockup.emMessage}>$250 → $300 a day: CPL $1.80 is under $2.</div>
                <span className={mockup.emButton}>Open your Inbox</span>
                <p className={mockup.emFoot}>Buyerly · Unsubscribe</p>
              </div>
            </div>
            <div className={mockup.carouselFrame}>
              <div className={mockup.cfHead}>
                <span>Telegram</span>
                <span className={mockup.cfSub}>Buyerly bot</span>
              </div>
              <div className={mockup.tgChat}>
                <div className={mockup.tgBubble}>
                  <b>Rule alert</b> · UK | Leads | Creative test #6
                  <br />
                  {'CPReg $27.10 > $25'}
                  <br />
                  <span>UK · Lead gen · Northwind</span>
                  <i>10:42</i>
                </div>
                <div className={mockup.tgBubble}>
                  <b>Turned off</b> · NL | Leads | Interests · Finance
                  <br />
                  Spend $21.40 ≥ $20 and 0 leads today
                  <br />
                  <span>NL · Lead gen · Northwind</span>
                  <i>10:58</i>
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    />
  );
}
