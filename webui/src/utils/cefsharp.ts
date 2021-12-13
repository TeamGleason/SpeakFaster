/** Utilites for communication with CefSharp host (if exists.) */

import {ElementRef, QueryList} from '@angular/core';
import {getVirtualkeyCode, VIRTUAL_KEY} from 'src/app/external/external-events.component';

const CEFSHARP_OBJECT_NAME = 'CefSharp';
const BOUND_LISTENER_NAME = 'boundListener';

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

export function callOnDomChange() {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call onDomChange(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return;
  }
  ((window as any)[BOUND_LISTENER_NAME] as any).onDomChange();
  console.log('Called onDomChange()');
}

/** TODO(cais): Add doc string. */
export function updateButtonBoxesForElements(
    componentName: string, queryList: QueryList<ElementRef<any>>) {
  // Use setTimeout() to execute the logic asynchronously, so the elements'
  // positions may have a chance to stabilize. In some cases, the positions of
  // the elements need time to stop updating since the call to this function.
  setTimeout(() => {
    const boxes: Array<[number, number, number, number]> = [];
    queryList.forEach(elementRef => {
      const box = elementRef.nativeElement.getBoundingClientRect();
      boxes.push([box.left, box.top, box.right, box.bottom]);
    });
    updateButtonBoxes(componentName, boxes);
  }, 0);
}

export function updateButtonBoxesToEmpty(componentName: string) {
  updateButtonBoxes(componentName, []);
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

export function injectKeys(virtualKeys: Array<string|VIRTUAL_KEY>) {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call injectKeys(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return;
  }
  const virtualKeyCodes: number[] = [];
  for (const virtualKey of virtualKeys) {
    virtualKeyCodes.push(getVirtualkeyCode(virtualKey));
  }
  ((window as any)[BOUND_LISTENER_NAME] as any).injectKeys(virtualKeyCodes);
}

export type ExternalKeypressHook = (vkCode: number) => void;

export function registerExternalKeypressHook(callback: ExternalKeypressHook) {
  (window as any)['externalKeypressHook'] = callback;
}
