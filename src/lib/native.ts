import { Capacitor, registerPlugin } from '@capacitor/core';

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
const REMINDER_CHANNEL = 'reminders';
let channels: Promise<void> | undefined;

function ensureChannels() {
  channels ??= import('@capacitor/local-notifications').then(async ({ LocalNotifications }) => {
    await LocalNotifications.createChannel({ id: ALERT_CHANNEL, name: 'Zeit gestartet', importance: 3, vibration: false, visibility: 1 });
    await LocalNotifications.createChannel({ id: QUIET_CHANNEL, name: 'Zeit läuft', importance: 2, vibration: false, visibility: 1 });
    await LocalNotifications.createChannel({ id: REMINDER_CHANNEL, name: 'Erinnerungen', importance: 4, visibility: 1 });
  });
  return channels.catch(() => undefined);
}

/** Eigene Android-Erweiterung (android/…/RunningNotice.java): Anzeige „Zeit läuft“, die nach Wegwischen wiederkommt. */
interface RunningNoticePlugin {
  show(o: { title: string; body: string; quiet?: boolean }): Promise<void>;
  hide(): Promise<void>;
  isShown(): Promise<{ shown: boolean }>;
}
const RunningNotice = registerPlugin<RunningNoticePlugin>('RunningNotice');

/** Ist die Anzeige „Zeit läuft“ gerade in der Benachrichtigungsleiste? */
export async function runningNativeDelivered(): Promise<boolean> {
  return (await RunningNotice.isShown()).shown;
}

/**
 * Dauerhafte Benachrichtigung „Zeit läuft“ zeigen bzw. (ohne `notice`) entfernen. Weggewischt erscheint
 * sie sofort still wieder, bis die Zeit gestoppt ist.
 * `quiet`: still aktualisieren/wiederherstellen, ohne sich erneut zu melden.
 */
export async function showRunningNative(notice: { title: string; body: string } | null, opts: { quiet?: boolean } = {}) {
  if (!notice) {
    await RunningNotice.hide();
    // Frühere Versionen zeigten sie über das Benachrichtigungs-Plugin (gleiche ID) – Reste entfernen
    await cancelNative([RUNNING_ID]).catch(() => undefined);
    return;
  }
  await RunningNotice.show({ ...notice, quiet: !!opts.quiet });
}

/** Probe-Benachrichtigung aus den Einstellungen (lässt sich wegwischen). */
export async function showTestNative(notice: { title: string; body: string }) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await ensureChannels();
  await LocalNotifications.schedule({
    notifications: [{ id: TEST_ID, ...notice, channelId: ALERT_CHANNEL, autoCancel: true, isExactNotification: false }],
  });
}

/** Geplante und bereits angezeigte Benachrichtigungen entfernen (`cancel` allein betrifft nur geplante). */
export async function cancelNative(ids: number[]) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  await LocalNotifications.removeDeliveredNotificationsById({ ids });
}

/** Erinnerung zum Zeitpunkt `at` planen (liegt er nicht in der Zukunft: sofort zeigen). */
export async function scheduleReminderNative(r: { id: number; title: string; body: string; at: number }) {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  await ensureChannels();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: r.id,
        title: r.title,
        body: r.body,
        channelId: REMINDER_CHANNEL,
        autoCancel: true,
        // Ungenauer Wecker reicht (wenige Minuten Verzögerung) – keine Berechtigung „Wecker und Erinnerungen“ nötig
        isExactNotification: false,
        schedule: r.at > Date.now() ? { at: new Date(r.at), allowWhileIdle: true } : undefined,
      },
    ],
  });
}
