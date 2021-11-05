/** Utilites for communication with CefSharp host (if exists.) */

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

export function callOnDomChange() {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call onDomChange(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return;
  }
  ((window as any)[BOUND_LISTENER_NAME] as any).onDomChange();
  console.log('Called onDomChange()');
}

export function updateButtonBoxes(
    componentName: string, boxes: Array<[number, number, number, number]>) {
  if ((window as any)[BOUND_LISTENER_NAME] == null) {
    console.warn(`Cannot call onDomChange(), because object ${
        BOUND_LISTENER_NAME} is not found`)
    return;
  }
  console.log(`updateButtonBoxes(): ${componentName}:`, boxes);
  ((window as any)[BOUND_LISTENER_NAME] as any)
      .updateButtonBoxes(componentName, boxes);
}
