// The app's stylesheet first, so its layers lead the built CSS, before any component's CSS Module.
// The token variables join @layer base (vite.config.ts).
import './styles/app.css';
import 'virtual:buyerly-tokens.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { firstPageCode, router } from './routes';
import { registerServiceWorker } from './lib/serviceWorker';

// The next start opens from the worker's copy of this build, with no network (#499).
registerServiceWorker();

void firstPageCode().then(() => ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/*
      The address applies at once, as a link's would: shortcuts and the session read it in
      the same tick. The page switch is the transition, held until the next page has its data (#490).
    */}
    <RouterProvider router={router} useTransitions={false} />
  </React.StrictMode>
));
