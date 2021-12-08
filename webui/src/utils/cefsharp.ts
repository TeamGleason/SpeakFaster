/** Utilites for communication with CefSharp host (if exists.) */

export type ExternalKeypressCallback = (vkCode: number) => void;

export function registerExternalKeypressCallback(callback: ExternalKeypressCallback) {
  (window as any)["externalKeypressCallback"] = callback;
}
