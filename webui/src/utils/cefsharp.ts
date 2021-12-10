/** Utilites for communication with CefSharp host (if exists.) */

export type ExternalKeypressHook = (vkCode: number) => void;

export function registerExternalKeypressHook(callback: ExternalKeypressHook) {
  (window as any)["externalKeypressHook"] = callback;
}
