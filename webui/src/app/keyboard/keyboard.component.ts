import {Component, HostListener} from '@angular/core';

// The return value indicates whether the event has been handled.
export type KeyboardCallback = (event: KeyboardEvent) => boolean;

const callbackStack: Array<{callbackName: string, callback: KeyboardCallback}> =
    [];

@Component({
  selector: 'app-keyboard-component',
  templateUrl: './keyboard.component.html',
})
export class KeyboardComponent {
  private static readonly _NAME = 'KeyboardComponent';

  private static readonly callbackStack:
      Array<{callbackName: string, callback: KeyboardCallback}> = [];

  /**
   * Register a callback
   * @param callbackName A unique identifier for the callback. If there is
   *   already a callback with this name registered, this call will be no-op.
   * @param callback
   */
  static registerCallback(callbackName: string, callback: KeyboardCallback) {
    if (callbackName === '') {
      throw new Error('Empty component name');
    }
    const alreadyExists =
        callbackStack.map(item => item.callbackName).indexOf(callbackName) !==
        -1;
    if (alreadyExists) {
      return;
    }
    callbackStack.push({callbackName: callbackName, callback});
    console.log(`Registered keyboard callback: ${callbackName}`);
  }

  static unregisterCallback(callbackName: string) {
    for (let i = callbackStack.length - 1; i >= 0; --i) {
      if (callbackStack[i].callbackName === callbackName) {
        callbackStack.splice(i, 1);
      }
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    const length = callbackStack.length;
    if (length === 0) {
      return;
    }
    for (let i = length - 1; i >= 0; --i) {
      const callback = callbackStack[i].callback;
      if (callback(event)) {
        event.preventDefault();
        event.stopPropagation();
        break;
      }
    }
  }
}
