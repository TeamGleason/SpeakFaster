/** Utilites for communication with CefSharp host (if exists.) */

import {ElementRef, QueryList} from '@angular/core';
import {getVirtualkeyCode, VIRTUAL_KEY} from 'src/app/external/external-events.component';
import {HostInfo} from 'src/app/settings/hostinfo';
import {AppSettings, DEFAULT_DWELL_DELAY_MILLIS, DEFAULT_GAZE_FUZZY_RADIUS, getAppSettings, setShowGazeTracker} from 'src/app/settings/settings';

import {endsWithSentenceEndPunctuation} from './text-utils';

const CEFSHARP_OBJECT_NAME = 'CefSharp';
export const BOUND_LISTENER_NAME = 'boundListener';

export const LONG_DWELL_ATTRIBUTE_KEY = 'longDwell';
export const LONG_DWELL_ATTRIBUTE_VALUE = 'true';
export const LONG_DWELL_THRESHOLD_DURATION_MILLIS = 400;

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

export const REMOVE_ALL_GAZE_BUTTONS_DIRECTIVE = '__remove_all__';

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
    const boxes: Array<number[]> = [];
    elements.forEach(elementRef => {
      const nativeElement = elementRef.nativeElement as HTMLElement;
      const box = nativeElement.getBoundingClientRect();
      const boxValues = [box.left, box.top, box.right, box.bottom];
      if (nativeElement.getAttribute(LONG_DWELL_ATTRIBUTE_KEY)) {
        boxValues.push(LONG_DWELL_THRESHOLD_DURATION_MILLIS);
      }
      // Do not register boxes that belong to elements whose CSS visibility is
      // hidden.
      if (window.getComputedStyle(nativeElement).visibility === 'hidden') {
        return;
      }
      if (containerRect == null ||
          isRectVisibleInsideContainer(box, containerRect)) {
        boxes.push(boxValues);
      }
    });
    updateButtonBoxes(instanceId, boxes);
  }, 0);
}

/**
 * Bring main window to the foreground.
 */
export async function bringWindowToForeground() {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call bringWindowToForeground(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return;
  }
  ((window as any)[BOUND_LISTENER_NAME] as any).bringWindowToForeground();
}

/**
 * Bring a focus app to the foreground (only if it is running).
 */
export async function bringFocusAppToForeground() {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call bringFocusAppToForeground(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return;
  }
  ((window as any)[BOUND_LISTENER_NAME] as any).bringFocusAppToForeground();
}


/**
 * Toggle the enabled/disabled state of gaze buttons.
 * @returns The new enabled state after toggling.
 */
export async function toggleGazeButtonsState(): Promise<boolean> {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call toggleGazeButtonsState(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return true;
  }
  return await ((window as any)[BOUND_LISTENER_NAME] as any)
             .toggleGazeButtonsState() as boolean;
}

/**
 * Updates the host app regarding eye tracking options.
 * @param showGazeTracker Whether the dot that tracks the gaze point is
 *     shown.
 * @param gazeFuzzyRadius The radius for the fuzzy gaze pointer (e.g, 20).
 * @param dwellDelayMillis The dwell delay for gaze clicking, in
 *     milliseconds.
 */
export function setEyeGazeOptions(
    showGazeTracker: boolean, gazeFuzzyRadius: number,
    dwellDelayMillis: number) {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call setEyeGazeOptions(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return;
  }
  console.log(`Calling host setEyeGazeOptions with: setEyeGazeOptions=${
      setShowGazeTracker}, gazeFuzzyRadius=${gazeFuzzyRadius}`);
  ((window as any)[BOUND_LISTENER_NAME] as any)
      .setEyeGazeOptions(showGazeTracker, gazeFuzzyRadius, dwellDelayMillis);
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

/**
 * Remove all buttons from all component instance.
 * This is done, e.g., when the entire app page reloads.
 */
export function removeAllButtonBoxes() {
  updateButtonBoxes(REMOVE_ALL_GAZE_BUTTONS_DIRECTIVE, []);
}

/**
 * Interface method for updating the button boxes of a component instance.
 * @param componentName Name of the component instance.
 * @param boxes Each element is a number[] of leghth 4 or 5. Length 4: the basic
 *   case, which is interpreted as [left, top, right bottom]. Length 5: the
 * extra element is interpreted as the custom threshold duration for gaze
 * clicking, in the unit of milliseconds.
 */
function updateButtonBoxes(componentName: string, boxes: number[][]) {
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
 * @param text (optional) the text to be injected. This doesn't include
 *   non-text parts of `virtualKeys` such as the Backspaces for erasure. This
 *   argument may be used for setting the system clipboard (for copy-pasting) on
 *   the host side.
 */
export function injectKeys(
    virtualKeys: Array<string|VIRTUAL_KEY>, text: string|null): number {
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
             .injectKeys(virtualKeyCodes, text) as number;
}

/** Inject text as keys. Append final punctuation and space if there is none. */
export function injectTextAsKeys(text: string): Array<string|VIRTUAL_KEY> {
  const injectedKeys: Array<string|VIRTUAL_KEY> = [];
  injectedKeys.push(...text.split(''));
  if (!text?.trim()) {
    return [];
  }
  text = text.trim();
  if (!endsWithSentenceEndPunctuation(text)) {
    text += '.';
    injectedKeys.push(VIRTUAL_KEY.PERIOD);
  }
  text += ' ';
  injectedKeys.push(VIRTUAL_KEY.SPACE);
  injectKeys(injectedKeys, text);
  return injectedKeys;
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

export type ExternalKeypressHook = (vkCode: number, isExternal: boolean) =>
    void;

export function registerExternalKeypressHook(callback: ExternalKeypressHook) {
  (window as any)['externalKeypressHook'] = callback;
}

export type HostWindowFocusHook = (isFocused: boolean) => void;

export function registerHostWindowFocusHook(callback: HostWindowFocusHook) {
  (window as any)['setHostWindowFocus'] = callback;
}

export type EYE_TRACKER_STATUS = 'disconnected'|'connected';

export type EyeTrackerStatusHook = (status: EYE_TRACKER_STATUS) => void;

/**
 * Registers a callback to receive updates about eye tracker status from the
 * host.
 */
export function registerEyeTrackerStatusHook(callback: EyeTrackerStatusHook) {
  (window as any)['eyeTrackerStatusHook'] = callback;
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

/** Retrieve host info, including host app version. */
export async function getHostInfo(): Promise<HostInfo|null> {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(
        `Cannot call getSerializedHostInfo() ` +
        `because object ${BOUND_LISTENER_NAME} is not found`);
    return null;
  }
  try {
    const serializedHostInfo =
        await ((window as any)[BOUND_LISTENER_NAME] as any)
            .getSerializedHostInfo() as string;
    return JSON.parse(serializedHostInfo) as HostInfo;
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
                                                  appSettings.gazeFuzzyRadius,
      appSettings.dwellDelayMillis === undefined ?
          DEFAULT_DWELL_DELAY_MILLIS :
          appSettings.dwellDelayMillis);
}
