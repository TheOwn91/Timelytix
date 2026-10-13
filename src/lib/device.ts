import { DEMO, notify } from './demo';
import { NATIVE, saveToDocuments, shareFileNative } from './native';

/** Läuft die App als installierte App (Homescreen)? */
export function isStandalone(): boolean {
  return (
    NATIVE ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Auf dem Handy über das Teilen-Menü anbieten (Dateien, Mail, Messenger …),
 * sonst als Download speichern.
 */
/** `false`, wenn das Teilen abgebrochen wurde. */
export async function shareOrDownload(blob: Blob, fileName: string): Promise<boolean> {
  if (DEMO) {
    notify('In der Demo sind Downloads gesperrt. In der installierten App wird die Datei gespeichert oder geteilt.');
    return false;
  }
  if (NATIVE) return shareFileNative(blob, fileName);
  const file = new File([blob], fileName, { type: blob.type });
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return true;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
    }
  }
  downloadBlob(blob, fileName);
  return true;
}

/** Sicherungsdatei ablegen: im Browser im Download-Ordner, in der Android-App unter „Dokumente/Timelytix“. */
export async function saveBackupFile(blob: Blob, fileName: string): Promise<string> {
  if (NATIVE) return saveToDocuments(blob, fileName);
  downloadBlob(blob, fileName);
  return `Downloads/${fileName}`;
}

/** Datei direkt in den Download-Ordner speichern. */
export function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Bittet den Browser, die lokalen Daten nicht automatisch zu löschen. */
export async function requestPersistentStorage(): Promise<void> {
  // Android-App: Die Daten gehören der App, der Browser räumt dort nichts auf
  if (NATIVE) return;
  await navigator.storage?.persist?.().catch(() => undefined);
}

/** Sind die Daten als dauerhaft gespeichert markiert? (undefined = Browser kann es nicht sagen) */
export async function storagePersisted(): Promise<boolean | undefined> {
  if (NATIVE) return undefined;
  try {
    return (await navigator.storage?.persisted?.()) ?? undefined;
  } catch {
    return undefined;
  }
}
