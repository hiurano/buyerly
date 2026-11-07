import { LegalArticle, type LegalSection } from './LegalArticle';

const sections: LegalSection[] = [
  {
    id: 'company',
    title: 'Company',
    body: (
      <>
        <p>
          Buyerly is operated by <strong>individual entrepreneur ARTEM PETRUCHENKO</strong>, Identification Number: <strong>305879234</strong>, registered at
          Georgia, Tbilisi, Vake District, Besarion Zhgenti Street, No. 49, Apartment 20.
        </p>
      </>
    ),
  },
  {
    id: 'reach-us',
    title: 'Get in touch',
    body: (
      <>
        <p>
          Write to <a href="mailto:contact@buyerly.app">contact@buyerly.app</a> with questions about the service, your account or this company information.
        </p>
      </>
    ),
  },
];

export function About({ stylesheet }: { stylesheet: string }) {
  return (
    <LegalArticle
      stylesheet={stylesheet}
      title="About"
      pageTitle="About — Buyerly"
      description="Buyerly is a Meta Ads operations service, operated by individual entrepreneur ARTEM PETRUCHENKO in Tbilisi, Georgia."
      current="about"
      intro="Buyerly brings Meta Ads performance data, routine automation and team notifications into one place."
      sections={sections}
    />
  );
}
