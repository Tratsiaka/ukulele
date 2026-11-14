// Точка входа: стили, тема, роутер, данные, рендер, service worker.

import './styles/index.css';
import { render } from 'preact';
import { initState } from './state.js';
import { App, bootError } from './app/App.jsx';
import { applyTheme, cachedTheme } from './app/theme.js';
import { startRouter } from './app/router.js';
import { registerServiceWorker } from './app/sw-register.js';

applyTheme(cachedTheme());
startRouter();

const root = document.getElementById('app');
root.textContent = '';
render(<App />, root);

Promise.resolve()
  .then(() => initState())
  .catch((err) => {
    console.error('[uke] не удалось загрузить данные', err);
    bootError.value = err;
  });

registerServiceWorker();
