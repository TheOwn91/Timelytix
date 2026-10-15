import { useEffect, useState } from 'react';
import { DEMO } from '../lib/demo';
import { isIOS, isStandalone } from '../lib/device';
import { NATIVE } from '../lib/native';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

/** Hinweis bzw. Button, um die App auf dem Homescreen zu installieren. */
/** Wurde die Installation angeboten (Android/Chrome), zeigt der Browser seinen eigenen Dialog. */
function useInstallPrompt() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const l = () => rerender((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return {
    canPrompt: !!deferred,
    prompt: async () => {
      await deferred?.prompt();
      deferred = null;
      rerender((n) => n + 1);
    },
  };
}

/** Knopf bzw. Anleitung zum Installieren (für Einstellungen und Einrichtungs-Assistent). */
export function InstallHelp() {
  const { canPrompt, prompt } = useInstallPrompt();
  if (canPrompt) {
    return (
      <button className="btn primary full" onClick={() => void prompt()}>
        📲 App installieren
      </button>
    );
  }
  return isIOS() ? (
    <ol className="small install-steps">
      <li>
        In <strong>Safari</strong> unten auf <strong>Teilen</strong> (□↑) tippen
      </li>
      <li>
        <strong>„Zum Home-Bildschirm“</strong> wählen und bestätigen
      </li>
    </ol>
  ) : (
    <ol className="small install-steps">
      <li>
        Im Browser-Menü (<strong>⋮</strong>) auf <strong>„App installieren“</strong> bzw.{' '}
        <strong>„Zum Startbildschirm hinzufügen“</strong> tippen
      </li>
    </ol>
  );
}

export function InstallCard() {
  // Android-App aus dem Play Store: nichts zu installieren
  if (NATIVE) return null;
  if (DEMO) {
    return (
      <section className="card">
        <h2>Demo</h2>
        <p className="muted small">Beispieldaten – deine Eingaben bleiben nur in diesem Browser.</p>
      </section>
    );
  }
  // Schon installiert: nichts zu tun
  if (isStandalone()) return null;

  return (
    <section className="card">
      <h2>Als App installieren</h2>
      <p className="muted small">Startet dann vom Homescreen und läuft offline.</p>
      <InstallHelp />
    </section>
  );
}
