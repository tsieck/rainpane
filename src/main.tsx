import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/globals.css';

document.documentElement.dataset.view = new URLSearchParams(window.location.search).get('view') === 'overlay'
  ? 'overlay'
  : 'demo';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
