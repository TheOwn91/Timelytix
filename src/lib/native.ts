import { Capacitor } from '@capacitor/core';

/**
 * Android-App (Play Store, gebaut mit Capacitor): dieselbe Web-App, aber Dateien, Teilen und die
 * Statusleisten-Anzeige laufen über Android statt über den Browser. Die Plugins werden erst bei
 * Bedarf geladen – die Web-Version lädt sie nie.
 */
export const NATIVE = Capacitor.isNativePlatform();

/** Ordner der automatischen Sicherung in der Android-App (unter „Dokumente“). */
export const NATIVE_BACKUP_FOLDER = 'Timelytix';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Datei über das Android-Teilen-Menü anbieten (Drive, Mail, Dateien …). `false` = abgebrochen. */
export async function shareFileNative(blob: Blob, fileName: string): Promise<boolean> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const { uri } = await Filesystem.writeFile({ path: fileName, data: await blobToBase64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title: fileName, files: [uri] });
    return true;
  } catch (e) {
    // Abbruch im Teilen-Menü
    if (/cancel/i.test(String((e as Error)?.message ?? e))) return false;
    throw e;
  }
}

/**
 * Sicherung in „Dokumente/Timelytix“ ablegen – dort bleibt sie auch, wenn die App gelöscht wird.
 * Gibt den angezeigten Speicherort zurück. Klappt das nicht (z. B. Berechtigung fehlt), landet sie
 * im Ordner der App auf dem Gerät.
 */
export async function saveToDocuments(blob: Blob, fileName: string): Promise<string> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const data = await blobToBase64(blob);
  // Android 9 und älter: Speicher-Berechtigung (ab Android 10 nicht nötig)
  try {
    const perm = await Filesystem.checkPermissions();
    if (perm.publicStorage !== 'granted') await Filesystem.requestPermissions();
  } catch {
    /* nicht nötig */
  }
  const tries = [fileName, fileName.replace(/\.json$/, `-${Date.now()}.json`)];
  for (const name of tries) {
    try {
      await Filesystem.writeFile({ path: `${NATIVE_BACKUP_FOLDER}/${name}`, data, directory: Directory.Documents, recursive: true });
      return `Dokumente/${NATIVE_BACKUP_FOLDER}/${name}`;
    } catch {
      // z. B. eine gleichnamige Datei einer früheren Installation – mit Uhrzeit im Namen erneut
    }
  }
  await Filesystem.writeFile({ path: `${NATIVE_BACKUP_FOLDER}/${fileName}`, data, directory: Directory.External, recursive: true });
  return `Android/data/…/files/${NATIVE_BACKUP_FOLDER}/${fileName}`;
}

/** Benachrichtigungs-ID der Anzeige „Zeit läuft“. */
const RUNNING_ID = 1;
const TEST_ID = 2;

export type NativePermission = 'granted' | 'denied' | 'prompt';

export async function nativeNotifyPermission(request = false): Promise<NativePermission> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const res = request ? await LocalNotifications.requestPermissions() : await LocalNotifications.checkPermissions();
  return res.display === 'granted' ? 'granted' : res.display === 'denied' ? 'denied' : 'prompt';
}

/**
 * Zwei Kanäle: „Zeit gestartet“ meldet sich einmal (mit Ton/Einblendung wie eingestellt), „Zeit läuft“
 * ist still – für Änderungen (Pause) und zum Wiederherstellen, ohne erneut zu melden.
 */
const ALERT_CHANNEL = 'running-start';
const QUIET_CHANNEL = 'running';
let channels: Promise<void> | undefined;

function ensureChannels() {
  channels ??= import('@capacitor/local-notifications').then(async ({ LocalNotifications }) => {
    await LocalNotifications.createChannel({ id: ALERT_CHANNEL, name: 'Zeit gestartet', importance: 3, vibration: false, visibility: 1 });
    await LocalNotifications.createChannel({ id: QUIET_CHANNEL, name: 'Zeit läuft', importance: 2, vibration: false, visibility: 1 });
  });
  return channels.catch(() => undefined);
}

/** Ist die Anzeige „Zeit läuft“ gerade in der Benachrichtigungsleiste? */
export async function runningNativeDelivered(): Promise<boolean> {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const { notifications } = await LocalNotifications.getDeliveredNotifications();
  return notifications.some((n) => n.id === RUNNING_ID);
}

/**
 * Dauerhafte Benachrichtigung „Zeit läuft“ zeigen bzw. (ohne `notice`) entfernen.
 * `quiet`: still aktualisieren/wiederherstellen, ohne sich erneut zu melden.
 */
export async function showRunningNative(notice: { title: string; body: string } | null, opts: { test?: boolean; quiet?: boolean } = {}) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const id = opts.test ? TEST_ID : RUNNING_ID;
  if (!notice) {
    await LocalNotifications.cancel({ notifications: [{ id }] });
    return;
  }
  await ensureChannels();
  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title: notice.title,
        body: notice.body,
        channelId: opts.quiet ? QUIET_CHANNEL : ALERT_CHANNEL,
        ongoing: !opts.test,
        autoCancel: !!opts.test,
        // Sofort zeigen, ohne Wecker – sonst verlangt Android die Berechtigung „Wecker und Erinnerungen“
        isExactNotification: false,
      },
    ],
  });
}

/** Antippen der Anzeige: Das Plugin entfernt sie dabei immer – `onTap` stellt sie wieder her. */
export function onRunningNotificationTap(onTap: () => void) {
  void import('@capacitor/local-notifications').then(({ LocalNotifications }) =>
    LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      if (e.notification.id === RUNNING_ID) onTap();
    }),
  );
}
