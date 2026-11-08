import { LegalArticle, type LegalSection } from './LegalArticle';

const sections: LegalSection[] = [
  {
    id: 'request',
    title: 'Send a deletion request',
    body: (
      <>
        <p>
          Email <a href="mailto:contact@buyerly.app">contact@buyerly.app</a> from your Buyerly account email with the subject{' '}
          <strong>Buyerly data deletion request</strong>. Identify your workspace and say whether you want to delete a Meta connection or your Buyerly account.
          If you no longer have access to that email, contact us to arrange ownership verification.
        </p>
        <p>
          We may ask for information needed to verify your authority over the account or workspace. Never send passwords, access tokens, cookies or sign-in
          codes.
        </p>
      </>
    ),
  },
  {
    id: 'disconnect',
    title: 'Stop connected access',
    body: (
      <>
        <p>
          You can disconnect a Meta connection in Buyerly or remove Buyerly in Meta’s Business Integrations or Apps and Websites settings. Disconnecting in
          Buyerly deletes the stored connection token and disables linked advertising accounts in Buyerly. Revoking permission in Meta stops access under that
          authorisation.
        </p>
        <p>
          Neither step by itself erases all historical records held by Buyerly. Send a deletion request for those records. This process does not delete
          campaigns or accounts on Meta.
        </p>
      </>
    ),
  },
  {
    id: 'scope',
    title: 'What happens next',
    body: (
      <>
        <p>
          After verification, we delete the personal data covered by your request, including connection credentials and profile data as applicable. We assess
          related advertising data, rules and shared workspace records according to your authority and the rights of other members.
        </p>
        <p>
          We explain any limited retention needed for security, legal obligations or disputes. Backup copies expire through the backup-retention cycle. We
          respond within applicable legal time limits and confirm the outcome. More information is in <a href="/privacy#deletion">Privacy</a>.
        </p>
      </>
    ),
  },
];

export function DataDeletion({ stylesheet }: { stylesheet: string }) {
  return (
    <LegalArticle
      stylesheet={stylesheet}
      title="Data deletion"
      pageTitle="Data deletion — Buyerly"
      description="How to stop connected access and request deletion of your Buyerly data."
      effective="2026-09-20"
      intro="How to stop connected access and request deletion of your Buyerly data."
      numbered
      sections={sections}
    />
  );
}
