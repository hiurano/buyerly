import { LegalArticle, type LegalSection } from './LegalArticle';

const sections: LegalSection[] = [
  {
    id: 'service',
    title: 'Buyerly and access',
    body: (
      <>
        <p>
          Buyerly is operated by <strong>individual entrepreneur ARTEM PETRUCHENKO</strong>, Identification Number: <strong>305879234</strong>, at Georgia,
          Tbilisi, Vake District, Besarion Zhgenti Street, No. 49, Apartment 20. Contact: <a href="mailto:contact@buyerly.app">contact@buyerly.app</a>.
        </p>
        <p>
          Buyerly helps teams monitor Meta advertising, organise accounts and run advertising rules. By using Buyerly, you agree to these terms. If you act for
          an organisation, you must have authority to do so. Access is currently available to approved or invited users through email sign-in.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Your account and connected assets',
    body: (
      <>
        <p>
          Keep your sign-in email and account secure, provide accurate information and report suspected unauthorised access. Connect only assets you are
          authorised to manage. Workspace administrators are responsible for invitations and member access; each user is responsible for actions they authorise.
        </p>
      </>
    ),
  },
  {
    id: 'automation',
    title: 'Advertising and automation',
    body: (
      <>
        <p>
          Actions and enabled rules can change advertising delivery and budgets. Review their scope, conditions and settings before use and monitor their
          results. You remain responsible for advertising decisions, spend and compliance with Meta policies. Performance data can be delayed or revised, and
          Buyerly does not guarantee campaign results or that every action can be undone.
        </p>
      </>
    ),
  },
  {
    id: 'use',
    title: 'Acceptable use',
    body: (
      <>
        <p>
          Use Buyerly only for lawful, authorised work. Do not access other users’ data without permission, bypass security or Meta restrictions, introduce
          malicious code, disrupt the service or misuse connected data.
        </p>
      </>
    ),
  },
  {
    id: 'data',
    title: 'Data and integrations',
    body: (
      <>
        <p>
          You retain your rights to the data you provide and authorise us to process it to operate Buyerly. Our <a href="/privacy">Privacy</a> notice explains
          data use and deletion. Connecting an asset does not transfer ownership of it to Buyerly.
        </p>
        <p>
          Meta and other third-party services have their own terms. Changes to their APIs, permissions or availability may affect Buyerly. Buyerly is an
          independent service and is not operated by Meta.
        </p>
      </>
    ),
  },
  {
    id: 'availability',
    title: 'Availability and responsibility',
    body: (
      <>
        <p>
          We work to keep Buyerly reliable, but cannot promise uninterrupted or error-free service. We may update or limit features for maintenance, security or
          changes to connected services. Verify important advertising actions and do not rely on automation as your only safeguard.
        </p>
        <p>
          To the extent permitted by applicable law, the service is provided on an “as available” basis and we are not liable for indirect or consequential
          losses. Nothing in these terms excludes liability or rights that cannot legally be excluded.
        </p>
      </>
    ),
  },
  {
    id: 'ending',
    title: 'Ending access and changes',
    body: (
      <>
        <p>
          You can stop using Buyerly, revoke connections and <a href="/privacy#deletion">request deletion</a> at any time. We may suspend or end access for
          misuse, security risks or legal requirements. Disconnecting an integration does not delete your advertising assets on Meta.
        </p>
        <p>
          We may update these terms as the service changes. We will notify affected users of material changes through the service or email before they take
          effect. If you disagree, stop using the service. Questions or concerns: <a href="mailto:contact@buyerly.app">contact@buyerly.app</a>.
        </p>
      </>
    ),
  },
];

export function Terms({ stylesheet }: { stylesheet: string }) {
  return (
    <LegalArticle
      stylesheet={stylesheet}
      title="Terms"
      pageTitle="Terms — Buyerly"
      description="The conditions for using Buyerly and its connected advertising features."
      current="terms"
      effective="2026-09-24"
      intro="The conditions for using Buyerly and its connected advertising features."
      numbered
      sections={sections}
    />
  );
}
