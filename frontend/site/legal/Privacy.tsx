import { LegalArticle, type LegalSection } from './LegalArticle';

const sections: LegalSection[] = [
  {
    id: 'operator',
    title: 'Who we are',
    body: (
      <>
        <p>
          Buyerly is operated by <strong>individual entrepreneur ARTEM PETRUCHENKO</strong>, Identification Number: <strong>305879234</strong>, at Georgia,
          Tbilisi, Vake District, Besarion Zhgenti Street, No. 49, Apartment 20. We are responsible for the personal data described in this notice. Contact:{' '}
          <a href="mailto:contact@buyerly.app">contact@buyerly.app</a>.
        </p>
      </>
    ),
  },
  {
    id: 'data',
    title: 'Data we use',
    body: (
      <>
        <p>We receive information from you, members of your workspace and the services you connect:</p>
        <ul>
          <li>
            <strong>Account and workspace:</strong> email address, name, optional avatar, workspace details, invitations and roles.
          </li>
          <li>
            <strong>Meta connections:</strong> Meta user and business identifiers, names, permissions and access tokens; advertising account, campaign, ad set
            and ad details, including aggregated performance metrics.
          </li>
          <li>
            <strong>Service activity:</strong> automation rules, settings, action history, support messages and technical records such as IP address, browser
            information and session activity.
          </li>
        </ul>
        <p>
          We use cookies for sign-in and request security, and browser storage for interface preferences and navigation. This public website does not use
          advertising or analytics trackers. Meta authorisation takes place on Meta; Buyerly does not ask for your Facebook password or session cookies.
        </p>
        <p>
          If you turn on desktop notifications, we keep your browser’s push subscription until you turn them off or sign out of that browser. Notifications go
          through your browser’s push service (for example Google, Mozilla or Apple), encrypted so that only your browser can read them.
        </p>
      </>
    ),
  },
  {
    id: 'purposes',
    title: 'Why we use data',
    body: (
      <>
        <p>
          We use account and connected advertising data to provide the service: sign you in, manage workspace access, display advertising performance, run
          actions and rules you configure, and deliver requested email messages. This processing is necessary to provide the service you request. Without the
          required account details or Meta permissions, the relevant features cannot work.
        </p>
        <p>
          We use technical records to secure and troubleshoot Buyerly, based on our legitimate interest in protecting the service and its users. We also process
          data where required by law, or with your consent where required; you may withdraw that consent. Advertising automation follows rules configured by
          authorised users.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Who receives data',
    body: (
      <>
        <p>
          Authorised workspace members can access shared workspace information according to their roles. Hosting, storage and email providers process
          information needed to operate Buyerly. Transactional email is delivered through Resend. Meta receives requests for connected advertising features.
        </p>
        <p>
          These providers may process data outside your country. Contact us for information about the providers and transfer safeguards relevant to your data.
          We may also disclose information where required by law or necessary to protect users and the service. We do not sell personal data or Meta Platform
          data.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'Storage and retention',
    body: (
      <>
        <p>
          We restrict access through account and workspace permissions and encrypt stored Meta access tokens. We keep account and advertising information while
          needed to provide your workspace and its history. Security records may be kept as needed to investigate incidents, resolve disputes or meet legal
          obligations; these purposes determine the retention period.
        </p>
        <p>
          Disconnecting a Meta connection deletes its stored token and disables the linked advertising accounts in Buyerly. It does not erase stored advertising
          history or audit records. Backup copies are removed through the backup-retention cycle rather than immediately with active records.
        </p>
      </>
    ),
  },
  {
    id: 'deletion',
    title: 'Your choices and deletion',
    body: (
      <>
        <p>
          Email <a href="mailto:contact@buyerly.app">contact@buyerly.app</a> to request access, a copy, correction or deletion of your personal data, or to
          object to or restrict processing where applicable. You may also complain to the competent data protection authority or seek a remedy in court. We may
          verify your identity before acting and respond within the applicable legal time limits.
        </p>
        <p>
          For deletion, send the subject <strong>Buyerly data deletion request</strong> from your account email and identify the workspace and whether the
          request covers a Meta connection or your Buyerly account. Do not send passwords, access tokens or sign-in codes. See the{' '}
          <a href="/data-deletion">deletion instructions</a> for the steps and scope.
        </p>
        <p>
          You can revoke access in Meta or disconnect the connection in Buyerly. Shared workspace records may involve other users; we will explain any
          information that must be retained and why.
        </p>
      </>
    ),
  },
  {
    id: 'updates',
    title: 'Updates',
    body: (
      <>
        <p>
          We update this notice when our data practices change and show the effective date above. We will notify affected users of material changes through the
          service or email. Questions: <a href="mailto:contact@buyerly.app">contact@buyerly.app</a>.
        </p>
      </>
    ),
  },
];

export function Privacy({ stylesheet }: { stylesheet: string }) {
  return (
    <LegalArticle
      stylesheet={stylesheet}
      title="Privacy"
      pageTitle="Privacy — Buyerly"
      description="How Buyerly uses data when you visit our website, use the service or connect advertising accounts."
      current="privacy"
      effective="2026-09-24"
      intro="How Buyerly uses data when you visit our website, use the service or connect advertising accounts."
      numbered
      sections={sections}
    />
  );
}
