/**
 * Component that handles external events such as keypresses outside the
 * webview.
 *
 * Test commands in DevTools console:
 * ```javascript
 * externalKeypressHook(72);  // h
 * externalKeypressHook(73);  // i
 * externalKeypressHook(32);  // space
 * externalKeypressHook(80);  // p
 * externalKeypressHook(65);  // a
 * externalKeypressHook(76);  // l
 * externalKeypressHook(190);  // .
 * externalKeypressHook(162);  // LCtrl
 * externalKeypressHook(81);  // Q
 * ```
 */

import {Component, Input} from '@angular/core';
import {Subject} from 'rxjs';

import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

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

// Windows virtual keys, see
// https://docs.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes
// This may be an incomplete list.
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

// The reverse of the VKCODE_SPECIAL_KEYS map.
export const SPECIAL_VIRTUAL_KEY_TO_CODE: Map<VIRTUAL_KEY, number> = new Map();
for (const k of Object.keys(VKCODE_SPECIAL_KEYS)) {
  if (VKCODE_SPECIAL_KEYS.hasOwnProperty(k)) {
    const code = Number(k);
    const vk = VKCODE_SPECIAL_KEYS[code];
    SPECIAL_VIRTUAL_KEY_TO_CODE.set(vk, code);
  }
}

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

/**
 * Get the virtual key code(s) needed to enter the character or key name.
 * @param charOrKey Character or special key name from the VIRTUAL_KEY enum.
 * @returns The virtual key codes for the chararacter or special-key name. For
 *   letters, they are converted to uppercase before conversion to key code.
 * @throws Error if `charOrKey` is not in the VIRTUAL_KEY enum and has a length
 *   that is not 1.
 */
export function getVirtualkeyCode(charOrKey: string|VIRTUAL_KEY): number[] {
  if (SPECIAL_VIRTUAL_KEY_TO_CODE.has(charOrKey as VIRTUAL_KEY)) {
    return [
      SPECIAL_VIRTUAL_KEY_TO_CODE.get(charOrKey as VIRTUAL_KEY) as number
    ];
  } else {
    if (charOrKey.length !== 1) {
      throw new Error(
          `Expected non-special char to have length 1, ` +
          `but got ${charOrKey.length} ('${charOrKey}')`)
    }
    if (charOrKey === '!') {
      return [
        SPECIAL_VIRTUAL_KEY_TO_CODE.get(VIRTUAL_KEY.LSHIFT) as number, 49
      ];
    } else if (charOrKey === '?') {
      return [
        SPECIAL_VIRTUAL_KEY_TO_CODE.get(VIRTUAL_KEY.LSHIFT) as number,
        SPECIAL_VIRTUAL_KEY_TO_CODE.get(VIRTUAL_KEY.SLASH_QUESTION_MARK) as
            number
      ];
    }
    // TODO(cais): Support other punctuation including '!' and '?'.
    return [charOrKey.toUpperCase().charCodeAt(0)];
  }
}

export function getPunctuationLiteral(
    vkCode: VIRTUAL_KEY, isShift: boolean): string {
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

export function getNumOrPunctuationLiteral(
    vkCode: number, isShift: boolean): string {
  switch (vkCode) {
    case 48:
      return isShift ? ')' : '0';
    case 49:
      return isShift ? '!' : '1';
    case 50:
      return isShift ? '@' : '2';
    case 51:
      return isShift ? '#' : '3';
    case 52:
      return isShift ? '$' : '4';
    case 53:
      return isShift ? '%' : '5';
    case 54:
      return isShift ? '^' : '6';
    case 55:
      return isShift ? '&' : '7';
    case 56:
      return isShift ? '*' : '8';
    case 56:
      return isShift ? '(' : '9';
    default:
      throw new Error(`Invalid key code for number keys: ${vkCode}`);
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
  private isShiftOn = false;

  ExternalEvewntsComponent() {}

  public externalKeypressHook(vkCode: number) {
    const virtualKey = getKeyFromVirtualKeyCode(vkCode);
    if (virtualKey === null) {
      return;
    }
    this.keySequence.push(virtualKey);
    const nowMillis = Date.now();
    if (this.previousKeypressTimeMillis === null ||
        (nowMillis - this.previousKeypressTimeMillis) >
            MIN_GAZE_KEYPRESS_MILLIS) {
      this.numGazeKeypresses++;
    }
    this.previousKeypressTimeMillis = nowMillis;
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
    if (virtualKey.length === 1 && (virtualKey >= 'a' && virtualKey <= 'z')) {
      this.insertCharAsCursorPos(virtualKey);
    } else if (
        virtualKey.length === 1 && (virtualKey >= '0' && virtualKey <= '9')) {
      this.insertCharAsCursorPos(
          getNumOrPunctuationLiteral(vkCode, this.isShiftOn));
    } else if (virtualKey === VIRTUAL_KEY.SPACE) {
      this.insertCharAsCursorPos(' ');
    } else if (virtualKey === VIRTUAL_KEY.ENTER) {
      this.insertCharAsCursorPos('\n');
    } else if (virtualKey === VIRTUAL_KEY.HOME) {
      this.cursorPos = this.getHomeKeyDestination();
    } else if (virtualKey === VIRTUAL_KEY.END) {
      this.cursorPos = this.getEndKeyDestination();
    } else if (PUNCTUATION.indexOf(virtualKey as VIRTUAL_KEY) !== -1) {
      this.insertCharAsCursorPos(
          getPunctuationLiteral(virtualKey as VIRTUAL_KEY, this.isShiftOn));
    } else if (virtualKey === VIRTUAL_KEY.LARROW) {
      if (this.cursorPos > 0) {
        this.cursorPos--;
      }
    } else if (virtualKey === VIRTUAL_KEY.RARROW) {
      if (this.cursorPos < this.text.length) {
        this.cursorPos++;
      }
    } else if (virtualKey === VIRTUAL_KEY.BACKSPACE) {
      if (this.cursorPos > 0) {
        this.text = this.text.slice(0, this.cursorPos - 1) +
            this.text.slice(this.cursorPos);
        this.cursorPos--;
      }
    } else if (virtualKey === VIRTUAL_KEY.DELETE) {
      if (this.cursorPos < this.text.length) {
        this.text = this.text.slice(0, this.cursorPos) +
            this.text.slice(this.cursorPos + 1);
      }
    } else if (
        virtualKey === VIRTUAL_KEY.LSHIFT ||
        virtualKey === VIRTUAL_KEY.RSHIFT) {
      this.isShiftOn = true;
    }
    if (virtualKey !== VIRTUAL_KEY.LSHIFT &&
        virtualKey !== VIRTUAL_KEY.RSHIFT) {
      this.isShiftOn = false;
    }
    if (originallyEmpty && this.text.length > 0) {
      this.textEntryBeginSubject.next({timestampMillis: Date.now()});
    }

    // TODO(cais): Take care of the up and down arrow keys.
    // TODO(cais): Track ctrl state.
    // TODO(cais): Take care of selection state, including Ctrl+A.
    // TODO(cais): Take care of Shift+Backspace and Shift+Delete.
    console.log(
        `externalKeypressHook(): virtualKey=${virtualKey}; ` +
        `text="${this.text}"; cursorPos=${this.cursorPos}`);
  }

  private insertCharAsCursorPos(char: string) {
    if (this.cursorPos === this.text.length) {
      this.text += char;
    } else {
      this.text = this.text.slice(0, this.cursorPos) + char +
          this.text.slice(this.cursorPos);
    }
    this.cursorPos += 1;
  }

  private getHomeKeyDestination(): number {
    let p = this.cursorPos;
    const indexNewLine = this.text.lastIndexOf('\n', this.cursorPos);
    return indexNewLine === -1 ? 0 : indexNewLine + 1;
  }

  private getEndKeyDestination(): number {
    const indexNewLine = this.text.indexOf('\n', this.cursorPos);
    return indexNewLine === -1 ? this.text.length : indexNewLine - 1;
  }

  private reset() {
    this.previousKeypressTimeMillis = null;
    this.numGazeKeypresses = 0;
    this.text = '';
    this.cursorPos = 0;
    this.isShiftOn = false;
    this.keySequence.splice(0);
  }
}
