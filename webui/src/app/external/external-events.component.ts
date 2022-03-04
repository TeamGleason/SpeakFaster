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

import {Component, Input, OnInit} from '@angular/core';
import {Subject} from 'rxjs';
import {keySequenceEndsWith} from 'src/utils/text-utils';

import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

// The minimum delay between a preceeding keypress and an eye-gaze-triggered
// keypress. This is also the maximum delay between a preceding keypress and a
// keypress for which the (2nd) keypress is deteremined as an automatic keypress
// (e.g., from selection of a word completion).
const MIN_GAZE_KEYPRESS_MILLIS = 200;

export enum VIRTUAL_KEY {
  BACKSPACE = 'Backspace',
  ENTER = 'Enter',
  ALT = 'Alt',
  SPACE = ' ',
  END = 'End',
  HOME = 'Home',
  LARROW = 'LArrow',
  UARROW = 'UArrow',
  RARROW = 'RArrow',
  DARROW = 'DArrow',
  DELETE = 'Delete',
  F1 = 'F1',
  F2 = 'F2',
  F3 = 'F3',
  F4 = 'F4',
  F5 = 'F5',
  F6 = 'F6',
  F7 = 'F7',
  F8 = 'F8',
  F9 = 'F9',
  F10 = 'F10',
  F11 = 'F11',
  F12 = 'F12',
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
  VK_OEM_7 = '\'',
}

// Windows virtual keys, see
// https://docs.microsoft.com/en-us/windows/win32/inputdev/virtual-key-codes
// This may be an incomplete list.
export const VKCODE_SPECIAL_KEYS: {[vkCode: number]: VIRTUAL_KEY} = {
  8: VIRTUAL_KEY.BACKSPACE,
  13: VIRTUAL_KEY.ENTER,
  18: VIRTUAL_KEY.ALT,
  32: VIRTUAL_KEY.SPACE,
  35: VIRTUAL_KEY.END,
  36: VIRTUAL_KEY.HOME,
  37: VIRTUAL_KEY.LARROW,
  38: VIRTUAL_KEY.UARROW,
  39: VIRTUAL_KEY.RARROW,
  40: VIRTUAL_KEY.DARROW,
  46: VIRTUAL_KEY.DELETE,
  112: VIRTUAL_KEY.F1,
  113: VIRTUAL_KEY.F2,
  114: VIRTUAL_KEY.F3,
  115: VIRTUAL_KEY.F4,
  116: VIRTUAL_KEY.F5,
  117: VIRTUAL_KEY.F6,
  118: VIRTUAL_KEY.F7,
  119: VIRTUAL_KEY.F8,
  120: VIRTUAL_KEY.F9,
  121: VIRTUAL_KEY.F10,
  122: VIRTUAL_KEY.F11,
  123: VIRTUAL_KEY.F12,
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
  222: VIRTUAL_KEY.VK_OEM_7,
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
  VIRTUAL_KEY.SEMICOLON_COLON, VIRTUAL_KEY.PLUS, VIRTUAL_KEY.COMMA,
  VIRTUAL_KEY.MINUS, VIRTUAL_KEY.PERIOD, VIRTUAL_KEY.SLASH_QUESTION_MARK,
  VIRTUAL_KEY.VK_OEM_7,  // Single quote.
];

export const SENTENCE_END_COMBO_KEYS: string[][] = [
  [VIRTUAL_KEY.PERIOD, VIRTUAL_KEY.SPACE],
];
export const LCTRL_KEY_HEAD_FOR_TTS_TRIGGER = 'w';
export const TTS_TRIGGER_COMBO_KEY: string[] =
    [VIRTUAL_KEY.LCTRL, LCTRL_KEY_HEAD_FOR_TTS_TRIGGER];

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
    case VIRTUAL_KEY.VK_OEM_7:
      return '\'';
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

/** Repeat a virtual key a given number of times. */
export function repeatVirtualKey(key: VIRTUAL_KEY, num: number): VIRTUAL_KEY[] {
  return Array(num).fill(key);
}

export type KeypressListener =
    (keySequence: string[], reconstructedText: string) => void;

/**
 * A configuration for ignoring a certain sequence of machine-generated key
 * sequences or a part of it.
 */
export interface IgnoreMachineKeySequenceConfig {
  // The sequence of keys, e.g., for ", ", use `[VIRTUAL_KEY.COMMA,
  // VIRTUAL_KEY.SPACE]`.
  keySequence: Array<string|VIRTUAL_KEY>;

  // Inclusive index for the ignored keys, must be <= keySequence.length - 1;
  // For example, if keySequence is `[VIRTUAL_KEY.COMMA, VIRTUAL_KEY.SPACE]` and
  // ignoreStartIndex is 1, then the second (Space) key will be ignored.
  ignoreStartIndex: number;
}

@Component({
  selector: 'app-external-events-component',
  templateUrl: './external-events.component.html',
})
export class ExternalEventsComponent implements OnInit {
  @Input() textEntryBeginSubject!: Subject<TextEntryBeginEvent>;
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;

  private static readonly keypressListeners: KeypressListener[] = [];
  private static readonly ignoreMachineKeySequenceConfigs:
      IgnoreMachineKeySequenceConfig[] = [];

  private previousKeypressTimeMillis: number|null = null;
  // Number of keypresses effected through eye gaze (as determiend by
  // a temporal threshold).
  private numGazeKeypresses = 0;
  // The sequence of all keys, including ASCII and functional keys. Used in
  // the calculation of speed and keystroke saving rate (KSR).
  private readonly keySequence: string[] = [];
  // Millisecond timestamp (since epoch) for the previous keypress (if any)
  private _text: string = '';
  private cursorPos: number = 0;
  private isShiftOn = false;

  ExternalEvewntsComponent() {}

  ngOnInit() {
    this.textEntryEndSubject.subscribe(event => {
      // TODO(cais): Add unit test.
      if (!event.isFinal) {
        return;
      }
      this.reset();
    });
  }

  /**
   * Register a listener for keypresses.
   * Repeated registrations of the same listener function are ignored.
   * @param listener
   */
  public static registerKeypressListener(listener: KeypressListener) {
    if (ExternalEventsComponent.keypressListeners.indexOf(listener) !== -1) {
      // Ignore repeated registration.
      return;
    }
    ExternalEventsComponent.keypressListeners.push(listener);
  }

  /**
   * Unregister a registered listener. If the `listener` object is
   * unregistered, this call is a no-op.
   */
  public static unregisterKeypressListener(listener: KeypressListener) {
    const index = ExternalEventsComponent.keypressListeners.indexOf(listener);
    if (index !== -1) {
      ExternalEventsComponent.keypressListeners.splice(index, 1);
    }
  }

  /**
   * Register a machine-generated key sequence to be ignored. Repeated
   * registration of the same key sequence will lead to error.
   */
  public static registerIgnoreKeySequence(ignoreConfig:
                                              IgnoreMachineKeySequenceConfig) {
    if (ignoreConfig.keySequence.length <= 1) {
      throw new Error(`Cannot register ignore-sequence of length ${
          ignoreConfig.keySequence.length}`);
    }
    if (ignoreConfig.ignoreStartIndex < 0 ||
        ignoreConfig.ignoreStartIndex >= ignoreConfig.keySequence.length) {
      throw new Error(
          `Invalid ignore start index: ${ignoreConfig.ignoreStartIndex}`);
    }
    for (const existingConfig of
             ExternalEventsComponent.ignoreMachineKeySequenceConfigs) {
      if (JSON.stringify(existingConfig.keySequence) ===
          JSON.stringify(ignoreConfig.keySequence)) {
        throw new Error(`Ignore sequence already exists: ${
            JSON.stringify(existingConfig.keySequence)}`);
      }
    }
    ExternalEventsComponent.ignoreMachineKeySequenceConfigs.push(ignoreConfig);
  }

  /**
   * Register a machine-generated key sequence to be ignored. If the config in
   * the parameter has not been registered, an error will be thrown.
   */
  public static unregisterIgnoreKeySequence(
      ignoreConfig: IgnoreMachineKeySequenceConfig) {
    for (let i =
             ExternalEventsComponent.ignoreMachineKeySequenceConfigs.length - 1;
         i >= 0; --i) {
      const existingConfig =
          ExternalEventsComponent.ignoreMachineKeySequenceConfigs[i];
      if (JSON.stringify(existingConfig.keySequence) ===
          JSON.stringify(ignoreConfig.keySequence)) {
        ExternalEventsComponent.ignoreMachineKeySequenceConfigs.splice(i, 1);
        return;
      }
    }
    throw new Error(
        `Ignore config is not found: ${JSON.stringify(ignoreConfig)}`);
  }

  public static clearIgnoreKeySequences() {
    ExternalEventsComponent.ignoreMachineKeySequenceConfigs.splice(0);
  }

  /** Get the number of registered keypress listeners. */
  public static getNumKeypressListeners(): number {
    return ExternalEventsComponent.keypressListeners.length;
  }

  /** Clear all registered keypress listeners. */
  public static clearKeypressListeners() {
    ExternalEventsComponent.keypressListeners.splice(0);
  }

  public externalKeypressHook(vkCode: number, isExternal = true) {
    const virtualKey = getKeyFromVirtualKeyCode(vkCode);
    if (virtualKey === null) {
      return;
    }
    this.keySequence.push(virtualKey);
    const nowMillis = Date.now();
    const isInferredMachineKey = this.previousKeypressTimeMillis !== null &&
        (nowMillis - this.previousKeypressTimeMillis) <
            MIN_GAZE_KEYPRESS_MILLIS;
    if (this.previousKeypressTimeMillis === null || !isInferredMachineKey) {
      this.numGazeKeypresses++;
    }
    this.previousKeypressTimeMillis = nowMillis;

    if (isExternal &&
        (keySequenceEndsWith(this.keySequence, TTS_TRIGGER_COMBO_KEY) ||
         SENTENCE_END_COMBO_KEYS.some(
             keys => keySequenceEndsWith(this.keySequence, keys)))) {
      // A TTS action has been triggered.
      const text = this._text.trim();
      if (text) {
        console.log(`Sentence-end event: "${text}"`);
        this.textEntryEndSubject.next({
          text,
          timestampMillis: Date.now(),
          numHumanKeypresses: this.numGazeKeypresses,
          isFinal: true,
        });
      }
      return;
    }

    const originallyEmpty = this._text === '';
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
      if (this.cursorPos < this._text.length) {
        this.cursorPos++;
      }
    } else if (virtualKey === VIRTUAL_KEY.BACKSPACE) {
      if (this.cursorPos > 0) {
        this._text = this._text.slice(0, this.cursorPos - 1) +
            this._text.slice(this.cursorPos);
        this.cursorPos--;
      }
    } else if (virtualKey === VIRTUAL_KEY.DELETE) {
      if (this.cursorPos < this._text.length) {
        this._text = this._text.slice(0, this.cursorPos) +
            this._text.slice(this.cursorPos + 1);
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
    if (originallyEmpty && this._text.length > 0) {
      this.textEntryBeginSubject.next({timestampMillis: Date.now()});
    }

    this.processIgnoreMachineKeySequences(isInferredMachineKey);
    ExternalEventsComponent.keypressListeners.forEach(listener => {
      listener(this.keySequence, this._text);
    });

    // TODO(cais): Take care of the up and down arrow keys.
    // TODO(cais): Track ctrl state.
    // TODO(cais): Take care of selection state, including Ctrl+A.
    // TODO(cais): Take care of Shift+Backspace and Shift+Delete.
    console.log(
        `externalKeypressHook(): virtualKey=${virtualKey}; ` +
        `text="${this._text}"; cursorPos=${this.cursorPos}`);
  }

  private processIgnoreMachineKeySequences(isInferredMachineKey: boolean):
      void {
    // Process ignored machine key sequences.
    let numDisacrdedChars = 0;
    if (isInferredMachineKey) {
      for (const ignoreConfig of
               ExternalEventsComponent.ignoreMachineKeySequenceConfigs) {
        if (keySequenceEndsWith(this.keySequence, ignoreConfig.keySequence)) {
          numDisacrdedChars =
              ignoreConfig.keySequence.length - ignoreConfig.ignoreStartIndex;
        }
      }
    }
    if (numDisacrdedChars > 0) {
      this._text =
          this._text.substring(0, this._text.length - numDisacrdedChars);
      this.keySequence.splice(this.keySequence.length - numDisacrdedChars);
    }
  }

  private insertCharAsCursorPos(char: string) {
    if (this.cursorPos === this._text.length) {
      this._text += char;
    } else {
      this._text = this._text.slice(0, this.cursorPos) + char +
          this._text.slice(this.cursorPos);
    }
    this.cursorPos += 1;
  }

  private getHomeKeyDestination(): number {
    let p = this.cursorPos;
    const indexNewLine = this._text.lastIndexOf('\n', this.cursorPos);
    return indexNewLine === -1 ? 0 : indexNewLine + 1;
  }

  private getEndKeyDestination(): number {
    const indexNewLine = this._text.indexOf('\n', this.cursorPos);
    return indexNewLine === -1 ? this._text.length : indexNewLine - 1;
  }

  get text(): string {
    return this._text;
  }

  private reset() {
    this.previousKeypressTimeMillis = null;
    this.numGazeKeypresses = 0;
    this._text = '';
    this.cursorPos = 0;
    this.isShiftOn = false;
    this.keySequence.splice(0);
  }
}
