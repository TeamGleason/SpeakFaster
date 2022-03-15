/** Utilites for communication with CefSharp host (if exists.) */

import {ElementRef, QueryList} from '@angular/core';
import {getVirtualkeyCode, VIRTUAL_KEY} from 'src/app/external/external-events.component';
import {AppSettings, DEFAULT_GAZE_FUZZY_RADIUS, getAppSettings, setShowGazeTracker} from 'src/app/settings/settings';

const CEFSHARP_OBJECT_NAME = 'CefSharp';
export const BOUND_LISTENER_NAME = 'boundListener';

export async function bindCefSharpListener() {
  if ((window as any)[BOUND_LISTENER_NAME]) {
    return;
  }
  const cefSharp = (window as any)[CEFSHARP_OBJECT_NAME];
  if (cefSharp == null) {
    console.log(`Global object ${CEFSHARP_OBJECT_NAME} is not found`);
    return;
  }
  await cefSharp.BindObjectAsync(BOUND_LISTENER_NAME);
  console.log(
      `Bound CefSharp object: ${BOUND_LISTENER_NAME}:`,
      (window as any)[BOUND_LISTENER_NAME])
}

export function registerNewAccessToken(accessToken: string) {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call registerNewAccessToken(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return;
  }
  ((window as any)[BOUND_LISTENER_NAME] as any)
      .registerNewAccessToken(accessToken);
  console.log('Called registerNewAccessToken()');
}

/**
 * Update the clickable buttons for a component instance.
 *
 * The instanceId is used to track updates to the clickable buttons.
 *
 * @param instanceId Unique identifier for the component instance. Different
 *   instances of the same component type must have different `instanceId`s.
 * @param elements The list of clickable buttons to register.
 * @param containerRect Optional DOMRect object that specifies the container
 *   rectangle. If provided, it will cause only the elements that are
 *   partially or entirely visible in the containerRect to be registered.
 *   If not provided (default), all elements will be reigstered regardless
 *   of location.
 */
export function updateButtonBoxesForElements(
    instanceId: string, elements: QueryList<ElementRef<any>>,
    containerRect?: DOMRect) {
  // Use setTimeout() to execute the logic asynchronously, so the elements'
  // positions may have a chance to stabilize. In some cases, the positions of
  // the elements need time to stop updating since the call to this function.
  setTimeout(() => {
    const boxes: Array<[number, number, number, number]> = [];
    elements.forEach(elementRef => {
      const box = elementRef.nativeElement.getBoundingClientRect();
      if (containerRect == null ||
          isRectVisibleInsideContainer(box, containerRect)) {
        boxes.push([box.left, box.top, box.right, box.bottom]);
      }
    });
    updateButtonBoxes(instanceId, boxes);
  }, 0);
}

/**
 * Updates the host app regarding eye tracking options.
 * @param showGazeTracker Whether the dot that tracks the gaze point is
 *     shown.
 * @param gazeFuzzyRadius The radius for the fuzzy gaze pointer (e.g, 20).
 */
export function setEyeGazeOptions(
    showGazeTracker: boolean, gazeFuzzyRadius: number) {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call setEyeGazeOptions(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return;
  }
  console.log(`Calling host setEyeGazeOptions with: setEyeGazeOptions=${
      setShowGazeTracker}, gazeFuzzyRadius=${gazeFuzzyRadius}`);
  ((window as any)[BOUND_LISTENER_NAME] as any)
      .setEyeGazeOptions(showGazeTracker, gazeFuzzyRadius);
}

function isRectVisibleInsideContainer(rect: DOMRect, containerRect: DOMRect) {
  const {bottom, height, top} = rect;
  return top <= containerRect.top ? containerRect.top - top <= height :
                                    bottom - containerRect.bottom <= height;
}

/** Remove the clickable buttons of a given instance to an empty array. */
export function updateButtonBoxesToEmpty(instanceId: string) {
  updateButtonBoxes(instanceId, []);
}

function updateButtonBoxes(
    componentName: string, boxes: Array<[number, number, number, number]>) {
  console.log(`updateButtonBoxes(): ${componentName}:`, JSON.stringify(boxes));
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call updateButtonBoxes(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return;
  }
  ((window as any)[BOUND_LISTENER_NAME] as any)
      .updateButtonBoxes(componentName, boxes);
}

/**
 * Request programmable injection of keys.
 * @param virtualKeys The characters or special keys to inject, in the given
 *   order. A special key (Backspace or Enter) must use the VIRTUAL_KEY enum.
 *   Non-special keys (e.g., letters, numbers, and punctuation) should be in
 *   their literal form.
 */
export function injectKeys(virtualKeys: Array<string|VIRTUAL_KEY>): number {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call injectKeys(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return 0;
  }
  const virtualKeyCodes: number[] = [];
  for (const virtualKey of virtualKeys) {
    virtualKeyCodes.push(...getVirtualkeyCode(virtualKey));
  }
  return ((window as any)[BOUND_LISTENER_NAME] as any)
             .injectKeys(virtualKeyCodes) as number;
}

/** Request host app to reset the state of the attached soft keyboard. */
export function requestSoftKeyboardReset() {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call requestSoftKeyboardReset(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return;
  }
  ((window as any)[BOUND_LISTENER_NAME] as any).requestSoftKeyboardReset();
}

/**
 * Request hosting app to resize the window that contains the web view.
 * @param height new window height
 * @param width new window width
 */
export function resizeWindow(height: number, width: number): void {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call resizeWindow(${height}, ${
        width}), because object ${BOUND_LISTENER_NAME} is not found`);
    return;
  }
  ((window as any)[BOUND_LISTENER_NAME] as any).resizeWindow(height, width);
}

export type ExternalKeypressHook = (vkCode: number) => void;

export function registerExternalKeypressHook(callback: ExternalKeypressHook) {
  (window as any)['externalKeypressHook'] = callback;
}

export type HostWindowFocusHook = (isFocused: boolean) => void;

export function registerHostWindowFocusHook(callback: HostWindowFocusHook) {
  (window as any)['setHostWindowFocus'] = callback;
}

export type ExternalAccessTokenHook = (accessToken: string) => void;

/**
 * Hook used to receive access token from external sources (e.g., the host
 * app). The host app may periodically poll for new access tokens by using
 * a refresh token and this hook is the mechanism through which the new
 * access token is provided to the WebUI.
 */
export function registerExternalAccessTokenHook(
    callback: ExternalAccessTokenHook) {
  (window as any)['externalAccessTokenHook'] = callback;
}

/**
 * Try saving settings through the CefSharp host bridge.
 *
 * The settings will be serialized and stored by the host app.
 *
 * @returns `true` if and only if saving is successful.
 */
export async function saveSettings(settings: AppSettings): Promise<boolean> {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(
        `Cannot call save settings ` +
        `because object ${BOUND_LISTENER_NAME} is not found`);
    return false;
  }
  ((window as any)[BOUND_LISTENER_NAME] as any)
      .saveSettings(JSON.stringify(settings));
  return true;
}

/**
 * Try loading settings from the CefSharp host bridge.
 *
 * @returns If the host bridge exists and the host has previously saved settings
 *     (see `saveSettings()`), the deserialized settings object. Else, returns
 *     `null`.
 */
export async function loadSettings(): Promise<AppSettings|null> {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(
        `Cannot call load settings ` +
        `because object ${BOUND_LISTENER_NAME} is not found`);
    return null;
  }
  const appSettings: string =
      await ((window as any)[BOUND_LISTENER_NAME] as any).loadSettings();
  if (!appSettings) {
    return null;
  }
  try {
    return JSON.parse(appSettings) as AppSettings;
  } catch (error) {
    return null;
  }
}

/** Request the host app to quit. */
export function requestQuitApp(): void {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(
        `Cannot call requestQuitApp() ` +
        `because object ${BOUND_LISTENER_NAME} is not found`);
    return;
  }
  ((window as any)[BOUND_LISTENER_NAME] as any).requestQuitApp();
}

export async function setHostEyeGazeOptions() {
  const appSettings = await getAppSettings();
  setEyeGazeOptions(
      appSettings.showGazeTracker === 'YES',
      appSettings.gazeFuzzyRadius === undefined ? DEFAULT_GAZE_FUZZY_RADIUS :
                                                  appSettings.gazeFuzzyRadius);
}
