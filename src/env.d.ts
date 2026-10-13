/** Zeitpunkt des Builds (ISO), von vite.config.ts gesetzt. */
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  /** Version einer Beta der Android-App, z. B. „0.25.0-beta.7“ (Workflow „Android-App bauen“). */
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
