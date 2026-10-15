import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { StartupErrorBoundary } from './components/StartupError';
import { requestPersistentStorage } from './lib/device';
import { registerServiceWorker } from './lib/update';
import { StoreProvider } from './lib/store';
import { applyDynamicColors } from './lib/theme';
import './styles.css';

// Kein Zoomen mit zwei Fingern – das iPhone ignoriert „user-scalable=no“ im Viewport
document.addEventListener('gesturestart', (e) => e.preventDefault());

registerServiceWorker();
void requestPersistentStorage();
// Android-App: Farben vom Hintergrundbild – beim Start und wenn die App zurückkommt (Bild evtl. geändert)
void applyDynamicColors();
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void applyDynamicColors());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StartupErrorBoundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </StartupErrorBoundary>
  </StrictMode>,
);
