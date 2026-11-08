import type { ReactNode } from 'react';
import { SiteFooter, type FooterPage } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import site from './Site.module.css';

// The theme before the first paint (#232), as index.html sets it for the app.
// It is the page's only script: with JavaScript off, the page stays light.
const THEME_SCRIPT =
  "/* Theme before first paint (#232): the choice from Settings → Preferences, otherwise the system. */(function(){var d=document.documentElement,m=matchMedia('(prefers-color-scheme: dark)');function a(){var t;try{t=localStorage.getItem('buyerly-interface-theme')}catch(e){}if(t!=='light'&&t!=='dark')t=m.matches?'dark':'light';d.setAttribute('data-theme',t);d.style.colorScheme=t;d.classList.toggle('dark',t==='dark')}a();m.addEventListener('change',a)})()";

export interface DocumentProps {
  title: string;
  description: string;
  /** The built stylesheet's address (site/plugin.ts). */
  stylesheet: string;
  /** The footer link of the page itself, marked as the current page. */
  current?: FooterPage;
  bodyClassName?: string;
  children: ReactNode;
}

/** A whole public page: the head, the shared header and footer, and the page's main between them. */
export function Document({ title, description, stylesheet, current, bodyClassName, children }: DocumentProps) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <meta charSet="utf-8" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content={description} />
        <title>{title}</title>
        <link rel="icon" type="image/svg+xml" href="/static/icons/favicon.svg?v=4" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=3" sizes="180x180" />
        <link rel="stylesheet" href={stylesheet} />
      </head>
      <body className={bodyClassName}>
        <a className={site.skipLink} href="#main">Skip to content</a>
        <SiteHeader />
        {children}
        <SiteFooter current={current} />
      </body>
    </html>
  );
}
