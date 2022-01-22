/** Utilites for communication with CefSharp host (if exists.) */

import {ElementRef, QueryList} from '@angular/core';
import {getVirtualkeyCode, VIRTUAL_KEY} from 'src/app/external/external-events.component';

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
 */
export function updateButtonBoxesForElements(
    instanceId: string, elements: QueryList<ElementRef<any>>) {
  // Use setTimeout() to execute the logic asynchronously, so the elements'
  // positions may have a chance to stabilize. In some cases, the positions of
  // the elements need time to stop updating since the call to this function.
  setTimeout(() => {
    const boxes: Array<[number, number, number, number]> = [];
    elements.forEach(elementRef => {
      const box = elementRef.nativeElement.getBoundingClientRect();
      boxes.push([box.left, box.top, box.right, box.bottom]);
    });
    updateButtonBoxes(instanceId, boxes);
  }, 0);
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
export function injectKeys(virtualKeys: Array<string|VIRTUAL_KEY>) {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call injectKeys(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return;
  }
  const virtualKeyCodes: number[] = [];
  for (const virtualKey of virtualKeys) {
    virtualKeyCodes.push(...getVirtualkeyCode(virtualKey));
  }
  ((window as any)[BOUND_LISTENER_NAME] as any).injectKeys(virtualKeyCodes);
}

export function resizeWindow(height: number, width: number): void {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call resizeWindow(${height}, ${
        width}), because object ${BOUND_LISTENER_NAME} is not found`)
    return;
  }
  ((window as any)[BOUND_LISTENER_NAME] as any).resizeWindow(height, width);
}

export type ExternalKeypressHook = (vkCode: number) => void;

export function registerExternalKeypressHook(callback: ExternalKeypressHook) {
  (window as any)['externalKeypressHook'] = callback;
}
