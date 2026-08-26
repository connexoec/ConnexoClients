
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './src/index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalErrorLogging } from './src/lib/errorLogger';

// Captura de errores globales (window.onerror / promesas rechazadas). No afecta
// el arranque: si algo aquí fallara, va envuelto en try/catch internamente.
installGlobalErrorLogging();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary name="App">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
