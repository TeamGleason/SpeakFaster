/** Types related to the host app and host machine. */

export interface HostInfo {
  // Version string for the host app.
  hostAppVersion: string;

  // Version of the eye tracker engine.
  engineVersion?: string;
}
