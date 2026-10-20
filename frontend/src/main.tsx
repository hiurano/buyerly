import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { keepFaviconAcrossRoutes } from './lib/favicon';
import './styles/index.css';

keepFaviconAcrossRoutes();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
