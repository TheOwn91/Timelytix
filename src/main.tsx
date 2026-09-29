import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StartupErrorBoundary } from './components/StartupError';
import { requestPersistentStorage } from './lib/device';
import { registerServiceWorker } from './lib/update';
import { StoreProvider } from './lib/store';
import './styles.css';

// Kein Zoomen mit zwei Fingern – das iPhone ignoriert „user-scalable=no“ im Viewport
document.addEventListener('gesturestart', (e) => e.preventDefault());

registerServiceWorker();
void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StartupErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </StartupErrorBoundary>
  </StrictMode>,
);
