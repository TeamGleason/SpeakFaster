import {Component, HostListener} from '@angular/core';

import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {getVirtualkeyCode} from '../external/external-events.component';

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

  constructor(private eventLogger: HttpEventLogger) {}

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    this.eventLogger.logKeypress(event);
    if ((window as any).externalKeypressHook !== undefined) {
      try {
        const vkCode: number = getVirtualkeyCode(event.key)[0];
        (window as any).externalKeypressHook(vkCode, /* isExternal= */ false);
      } catch (error) {
      }
    }
  }
}
