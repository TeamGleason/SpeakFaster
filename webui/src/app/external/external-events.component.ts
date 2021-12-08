/**
 * Component that handles external events such as keypresses outside the
 * webview.
 *
 * Test commands in DevTools console:
 * ```javascript
 * externalKeypressCallback(72);  // h
 * externalKeypressCallback(73);  // i
 * externalKeypressCallback(32);  // space
 * externalKeypressCallback(80);  // p
 * externalKeypressCallback(65);  // a
 * externalKeypressCallback(76);  // l
 * externalKeypressCallback(190);  // .
 * externalKeypressCallback(162);  // LCtrl
 * externalKeypressCallback(81);  // Q
 * ```
 */

import {Component, Input} from '@angular/core';
import {Subject} from 'rxjs';

import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-injection';

// The minimum delay between a preceeding keypress and an eye-gaze-triggered
// keypress. This is also the maximum delay between a preceding keypress and a
// keypress for which the (2nd) keypress is deteremined as an automatic keypress
// (e.g., from selection of a word completion).
const MIN_GAZE_KEYPRESS_MILLIS = 200;

export enum VIRTUAL_KEY {
  BACKSPACE = 'Backspace',
  ENTER = 'Enter',
  SPACE = ' ',
  END = 'End',
  HOME = 'Home',
  LARROW = 'LArrow',
  UARROW = 'UArrow',
  RARROW = 'RArrow',
  DARROW = 'DArrow',
  DELETE = 'Delete',
  LSHIFT = 'LShift',
  RSHIFT = 'RShift',
  LCTRL = 'LCtrl',
  RCTRL = 'RCtrl',
  SEMICOLON_COLON = ';:',
  PLUS = '+',
  COMMA = ',',
  MINUS = '-',
  PERIOD = '.',
  SLASH_QUESTION_MARK = '/?',
}

export const VKCODE_SPECIAL_KEYS: {[vkCode: number]: VIRTUAL_KEY} = {
  8: VIRTUAL_KEY.BACKSPACE,
  13: VIRTUAL_KEY.ENTER,
  32: VIRTUAL_KEY.SPACE,
  35: VIRTUAL_KEY.END,
  36: VIRTUAL_KEY.HOME,
  37: VIRTUAL_KEY.LARROW,
  38: VIRTUAL_KEY.UARROW,
  39: VIRTUAL_KEY.RARROW,
  40: VIRTUAL_KEY.DARROW,
  46: VIRTUAL_KEY.DELETE,
  160: VIRTUAL_KEY.LSHIFT,
  161: VIRTUAL_KEY.RSHIFT,
  162: VIRTUAL_KEY.LCTRL,
  163: VIRTUAL_KEY.RCTRL,
  186: VIRTUAL_KEY.SEMICOLON_COLON,
  187: VIRTUAL_KEY.PLUS,
  188: VIRTUAL_KEY.COMMA,
  189: VIRTUAL_KEY.MINUS,
  190: VIRTUAL_KEY.PERIOD,
  191: VIRTUAL_KEY.SLASH_QUESTION_MARK,
};

export const PUNCTUATION: VIRTUAL_KEY[] = [
  VIRTUAL_KEY.SEMICOLON_COLON,
  VIRTUAL_KEY.PLUS,
  VIRTUAL_KEY.COMMA,
  VIRTUAL_KEY.MINUS,
  VIRTUAL_KEY.PERIOD,
  VIRTUAL_KEY.SLASH_QUESTION_MARK,
];

export const TTS_TRIGGER_COMBO_KEY: string[] = [VIRTUAL_KEY.LCTRL, 'q'];

function getKeyFromVirtualKeyCode(vkCode: number): string|null {
  if (vkCode >= 48 && vkCode <= 57) {
    return String.fromCharCode(vkCode);
  } else if (vkCode >= 65 && vkCode <= 90) {
    return String.fromCharCode(vkCode).toLowerCase();
  } else if (vkCode in VKCODE_SPECIAL_KEYS) {
    return VKCODE_SPECIAL_KEYS[vkCode];
  } else {
    return null;
  }
}

function getPunctuationLiteral(vkCode: VIRTUAL_KEY, isShift: boolean): string {
  switch (vkCode) {
    case VIRTUAL_KEY.SEMICOLON_COLON:
      return isShift ? ':' : ';';
    case VIRTUAL_KEY.PLUS:
      return '+';
    case VIRTUAL_KEY.COMMA:
      return ',';
    case VIRTUAL_KEY.PERIOD:
      return '.';
    case VIRTUAL_KEY.SLASH_QUESTION_MARK:
      return isShift ? '?' : '/';
    default:
      throw new Error(`Invalid virtual key code: ${VIRTUAL_KEY}`);
  }
}

function allItemsEqual(array1: string[], array2: string[]): boolean {
  if (array1.length !== array2.length) {
    return false;
  }
  for (let i = 0; i < array1.length; ++i) {
    if (array1[i] !== array2[i]) {
      return false;
    }
  }
  return true;
}

@Component({
  selector: 'app-external-events-component',
  templateUrl: './external-events.component.html',
})
export class ExternalEventsComponent {
  @Input() textEntryBeginSubject!: Subject<TextEntryBeginEvent>;
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;

  private previousKeypressTimeMillis: number|null = null;
  // Number of keypresses effected through eye gaze (as determiend by
  // a temporal threshold).
  private numGazeKeypresses = 0;
  // The sequence of all keys, including ASCII and functional keys. Used in
  // the calculation of speed and keystroke saving rate (KSR).
  private readonly keySequence: string[] = [];
  // Millisecond timestamp (since epoch) for the previous keypress (if any)
  private text: string = '';
  private cursorPos: number = 0;

  ExternalEvewntsComponent() {}

  public externalKeypressCallback(vkCode: number) {
    const virtualKey = getKeyFromVirtualKeyCode(vkCode);
    if (virtualKey === null) {
      return;
    }
    this.keySequence.push(virtualKey);
    if (this.keySequence.length > TTS_TRIGGER_COMBO_KEY.length &&
        allItemsEqual(
            this.keySequence.slice(
                this.keySequence.length - TTS_TRIGGER_COMBO_KEY.length),
            TTS_TRIGGER_COMBO_KEY)) {
      // A TTS action has been triggered.
      console.log(`TTS event: "${this.text}"`);
      this.textEntryEndSubject.next({
        text: this.text,
        timestampMillis: Date.now(),
        numHumanKeypresses: this.numGazeKeypresses,
        isFinal: true,
      });
      this.reset();
      return;
    }
    const originallyEmpty = this.text === '';
    if (virtualKey.length === 1 && (virtualKey >= 'a' && virtualKey <= 'z') ||
        (virtualKey >= '0' && virtualKey <= '9')) {
      this.text += virtualKey;
      this.cursorPos += 1;
    } else if (virtualKey === VIRTUAL_KEY.SPACE) {
      this.text += ' ';
      this.cursorPos += 1;
    } else if (virtualKey === VIRTUAL_KEY.ENTER) {
      this.text += '\n';
      this.cursorPos += 1;
    } else if (PUNCTUATION.indexOf(virtualKey as VIRTUAL_KEY) !== -1) {
      // TODO(cais): Add shift state.
      this.text += getPunctuationLiteral(virtualKey as VIRTUAL_KEY, false);
    } else if (virtualKey === VIRTUAL_KEY.BACKSPACE) {
      if (this.cursorPos > 0) {
        this.text = this.text.slice(0, this.cursorPos - 1) +
            this.text.slice(this.cursorPos);
        this.cursorPos--;
      }
    } else if (virtualKey === VIRTUAL_KEY.DELETE) {
      if (this.cursorPos < this.text.length - 1) {
        this.text = this.text.slice(0, this.cursorPos) +
            this.text.slice(this.cursorPos + 1);
      }
    }
    if (originallyEmpty && this.text.length > 0) {
      this.textEntryBeginSubject.next({timestampMillis: Date.now()});
    }

    const nowMillis = Date.now();
    if (this.previousKeypressTimeMillis == null ||
        (nowMillis - this.previousKeypressTimeMillis) >
            MIN_GAZE_KEYPRESS_MILLIS) {
      this.numGazeKeypresses++;
    }
    this.previousKeypressTimeMillis = Date.now();
    // TODO(cais): Take care of the home, end and the arrow keys.
    // TODO(cais): Take care of the Ctrl+A.
    // TODO(cais): Take care of shift Backspace and shift delete.
    // TODO(cais): Toggle ctrl state.

    console.log(
        `externalKeypressCallback(): virtualKey=${virtualKey}; ` +
        `text="${this.text}"; cursorPos=${this.cursorPos}`);
  }

  private reset() {
    this.previousKeypressTimeMillis = null;
    this.numGazeKeypresses = 0;
    this.text = '';
    this.cursorPos = 0;
    this.keySequence.splice(0);
  }
}
