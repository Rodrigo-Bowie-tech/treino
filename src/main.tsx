import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { InstallDialog } from './components/InstallDialog';
import { ToastProvider } from './components/Toasts';
import { listenForInstallPrompt } from './hooks/useInstallPrompt';
import { applyTreinoTheme } from './lib/theme';
import { startAutoSync } from './lib/syncEngine';
import './styles.css';
import './treino.css';

applyTreinoTheme();
listenForInstallPrompt();
registerSW({ immediate: true });
startAutoSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <App />
        <InstallDialog
          appName="Treino"
          iconSrc="./icons/icon-192.png"
          dismissKey="treino:instalar-dispensado"
          quietRoutes={['/sessao', '/conectar']}
        />
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
);
