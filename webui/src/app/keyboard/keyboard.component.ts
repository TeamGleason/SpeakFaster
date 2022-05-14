import {Component, HostListener} from '@angular/core';

import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {getVirtualkeyCode} from '../external/external-events.component';

// The return value indicates whether the event has been handled.
export type KeyboardCallback = (event: KeyboardEvent) => boolean;

@Component({
  selector: 'app-keyboard-component',
  templateUrl: './keyboard.component.html',
})
export class KeyboardComponent {
  private static readonly _NAME = 'KeyboardComponent';

  constructor(private eventLogger: HttpEventLogger) {}

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if ((window as any).externalKeypressHook !== undefined) {
      try {
        const vkCodes = getVirtualkeyCode(event.key);
        // NOTE: While most event.key values are traslated into a single
        // virtual-key code, some special keys (e.g., '!' and '?') are
        // translated into multiple key codes (e.g., shift + 1 and shift + /).
        // We take the last key code in the sequence in such cases, in order to
        // ensure correct reconstruction of the text from keypresses.
        const vkCode: number = vkCodes[vkCodes.length - 1];
        // TODO(cais): Simplify.
        (window as any).externalKeypressHook(vkCode, /* isExternal= */ false);
      } catch (error) {
      }
    }
  }

}
