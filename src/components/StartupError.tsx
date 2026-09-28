import { Component, type ReactNode } from 'react';

/** Setzt die App zurück auf den Stand vom Server: Service Worker abmelden, eigene Offline-Speicher leeren. Daten bleiben. */
export async function resetAppCache() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
    const scope = new URL('./', window.location.href).href;
    await Promise.all(regs.filter((r) => r.scope === scope).map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('timelytix-')).map((k) => caches.delete(k)));
  } catch {
    /* nicht unterstützt */
  }
  window.location.reload();
}

/** Statt eines weißen Bildschirms: Fehlermeldung mit „Neu laden“ und „Zwischenspeicher leeren“. */
export function StartupErrorView({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="page">
      <section className="card startup-error">
        <h2>Timelytix konnte nicht starten</h2>
        <p>Deine Daten sind nicht verloren. Meist hilft es, die App neu zu laden oder den Zwischenspeicher zu leeren.</p>
        <button className="btn primary full" onClick={() => window.location.reload()}>
          Neu laden
        </button>
        <button className="btn secondary full" onClick={() => void resetAppCache()}>
          Zwischenspeicher leeren und neu laden
        </button>
        <p className="muted small">Fehler: {message}</p>
      </section>
    </div>
  );
}

export class StartupErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error ? <StartupErrorView error={this.state.error} /> : this.props.children;
  }
}
