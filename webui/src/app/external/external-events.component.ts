/**
 * Component that handles external events such as keypresses outside the
 * webview.
 *
 * Test commands in DevTools console:
 * ```javascript
 * externalKeypressHook(72, true);  // h
 * externalKeypressHook(73, true);  // i
 * externalKeypressHook(32, true);  // space
 * externalKeypressHook(80, true);  // p
 * externalKeypressHook(65, true);  // a
 * externalKeypressHook(76, true);  // l
 * externalKeypressHook(190, true);  // .
 * externalKeypressHook(162, true);  // LCtrl
 * externalKeypressHook(87, true);  // W
 * ```
 *
 * Bring to front combo key:
 * ```
 * externalKeypressHook(162, true);  // LCtrl
 * externalKeypressHook(71, true);  // G
 * ```
 */

import {Component, Input, OnInit} from '@angular/core';
import {Subject} from 'rxjs';
import {keySequenceEndsWith, removePunctuation} from 'src/utils/text-utils';

import {InputBarControlEvent} from '../input-bar/input-bar.component';
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
  [VIRTUAL_KEY.PERIOD],                                   // Period.
  [VIRTUAL_KEY.LSHIFT, VIRTUAL_KEY.SLASH_QUESTION_MARK],  // Question mark.
  [VIRTUAL_KEY.LSHIFT, '1'],                              // Exclamation point.
];
export const LCTRL_KEY_HEAD_FOR_TTS_TRIGGER = 'w';
export const EXTERNAL_PHRASE_DELIMITERS: string[][] = [
  [VIRTUAL_KEY.LCTRL, LCTRL_KEY_HEAD_FOR_TTS_TRIGGER],
  [VIRTUAL_KEY.PERIOD, VIRTUAL_KEY.SPACE],
];
export const WORD_BACKSPACE_COMBO_KEY: string[] = [
  VIRTUAL_KEY.LCTRL, VIRTUAL_KEY.LSHIFT, VIRTUAL_KEY.LARROW,
  VIRTUAL_KEY.BACKSPACE
];

// Ctrl + G brings the app to the foreground.
export const LCTRL_KEY_HEAD_FOR_FOREGROUND_TRIGGER = 'g';
export const BRING_TO_FOREGROUND_COMBO_KEY: string[] =
    [VIRTUAL_KEY.LCTRL, LCTRL_KEY_HEAD_FOR_FOREGROUND_TRIGGER];

// Ctrl + P pauses/resumes the eye tracking.
export const LCTRL_KEY_HEAD_FOR_EYE_TRACKING_TOGGLE = 'p';
export const EYE_TRACKING_TOGGLE_COMBO_KEY: string[] =
    [VIRTUAL_KEY.LCTRL, LCTRL_KEY_HEAD_FOR_EYE_TRACKING_TOGGLE];

function getKeyFromVirtualKeyCode(vkCode: number): string|null {
  if (vkCode >= 48 && vkCode <= 58) {
    return String.fromCharCode(vkCode);
  } else if (vkCode >= 65 && vkCode <= 90) {
    return String.fromCharCode(vkCode).toLowerCase();
  } else if (vkCode in VKCODE_SPECIAL_KEYS) {
    return VKCODE_SPECIAL_KEYS[vkCode];
  } else {
    return null;
  }
}

function insertCharAsCursorPos(char: string, reconState: TextReconState) {
  const casedChar =
      reconState.isShiftOn ? char.toLocaleUpperCase() : char.toLocaleLowerCase()
  if (reconState.cursorPos === reconState.text.length) {
    reconState.text += casedChar;
  }
  else {
    reconState.text = reconState.text.slice(0, reconState.cursorPos) +
        casedChar + reconState.text.slice(reconState.cursorPos);
  }
  reconState.cursorPos += 1;
}

function getHomeKeyDestination(reconState: TextReconState): number {
  let p = reconState.cursorPos;
  const indexNewLine = reconState.text.lastIndexOf('\n', reconState.cursorPos);
  return indexNewLine === -1 ? 0 : indexNewLine + 1;
}

function wordBackspace(reconState: TextReconState) {
  let j = reconState.cursorPos - 1;
  for (; j >= 0; --j) {
    const char = reconState.text[j];
    if (char !== ' ' && char !== '\n') {
      break;
    }
  }
  // Then find the last whitespace character.
  for (; j >= 0; --j) {
    const char = reconState.text[j];
    if (char === ' ' || char === '\n') {
      break;
    }
  }
  reconState.text = reconState.text.slice(0, j + 1) +
      reconState.text.slice(reconState.cursorPos);
  reconState.cursorPos = j + 1;
}

function getEndKeyDestination(reconState: TextReconState): number {
  const indexNewLine = reconState.text.indexOf('\n', reconState.cursorPos);
  return indexNewLine === -1 ? reconState.text.length : indexNewLine - 1;
}

function processIgnoreMachineKeySequences(
    isInferredMachineKey: boolean, reconState: TextReconState,
    inputBarControlSubject?: Subject<InputBarControlEvent>): void {
  // Process ignored machine key sequences.
  let numDisacrdedChars = 0;
  if (isInferredMachineKey) {
    for (const ignoreConfig of ignoreMachineKeySequenceConfigs) {
      if (keySequenceEndsWith(
              reconState.keySequence, ignoreConfig.keySequence)) {
        numDisacrdedChars =
            ignoreConfig.keySequence.length - ignoreConfig.ignoreStartIndex;
      }
    }
  }
  if (numDisacrdedChars > 0) {
    reconState.text = reconState.text.substring(
        0, reconState.text.length - numDisacrdedChars);
    reconState.keySequence.splice(
        reconState.keySequence.length - numDisacrdedChars);
    if (inputBarControlSubject) {
      inputBarControlSubject.next({
        numCharsToDeleteFromEnd: numDisacrdedChars,
      });
    }
  }
}

function resetReconState(reconState: TextReconState) {
  reconState.previousKeypressTimeMillis = null;
  reconState.numGazeKeypresses = 0;
  reconState.text = '';
  reconState.cursorPos = 0;
  reconState.isShiftOn = false;
  reconState.keySequence.splice(0);
}


export function resetReconStates() {
  resetReconState(internalReconState);
  resetReconState(externalReconState);
}

/**
 * Get the virtual key code(s) needed to enter the character or key name.
 * @param charOrKey Character or special key name from the VIRTUAL_KEY enum.
 * @returns The virtual key codes for the chararacter or special-key name. For
 *   letters, they are converted to uppercase before conversion to key code.
 *   For the "Unidentified" keycode (e.g., from Mobile browsers), returns
 *   an empty array.
 * @throws Error if `charOrKey` is not in the VIRTUAL_KEY enum and has a length
 *   that is not 1.
 */
export function getVirtualkeyCode(charOrKey: string|VIRTUAL_KEY): number[] {
  if (charOrKey === 'Unidentified') {
    return [];
  } else if (SPECIAL_VIRTUAL_KEY_TO_CODE.has(charOrKey as VIRTUAL_KEY)) {
    return [
      SPECIAL_VIRTUAL_KEY_TO_CODE.get(charOrKey as VIRTUAL_KEY) as number
    ];
  } else if (charOrKey === 'Control') {
    return getVirtualkeyCode(VIRTUAL_KEY.LCTRL);
  } else if (charOrKey === 'Shift') {
    return getVirtualkeyCode(VIRTUAL_KEY.LSHIFT);
  } else if (charOrKey === 'ArrowLeft') {
    return getVirtualkeyCode(VIRTUAL_KEY.LARROW);
  } else if (charOrKey === 'ArrowUp') {
    return getVirtualkeyCode(VIRTUAL_KEY.UARROW);
  } else if (charOrKey === 'ArrowRight') {
    return getVirtualkeyCode(VIRTUAL_KEY.RARROW);
  } else if (charOrKey === 'ArrowDown') {
    return getVirtualkeyCode(VIRTUAL_KEY.DARROW);
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
    } else if (charOrKey === ':') {
      return [
        SPECIAL_VIRTUAL_KEY_TO_CODE.get(VIRTUAL_KEY.LSHIFT) as number,
        SPECIAL_VIRTUAL_KEY_TO_CODE.get(VIRTUAL_KEY.SEMICOLON_COLON) as number
      ];
    } else if (charOrKey === '(') {
      return [
        SPECIAL_VIRTUAL_KEY_TO_CODE.get(VIRTUAL_KEY.LSHIFT) as number,
        getVirtualkeyCode('9')[0],
      ];
    } else if (charOrKey === ')') {
      return [
        SPECIAL_VIRTUAL_KEY_TO_CODE.get(VIRTUAL_KEY.LSHIFT) as number,
        getVirtualkeyCode('0')[0],
      ];
    }
    // TODO(cais): Support other punctuation including '!' and '?'.
    return [charOrKey.toUpperCase().charCodeAt(0)];
  }
}

export function getPunctuationLiteral(
    vkCode: VIRTUAL_KEY, isShift: boolean): string {
  switch (vkCode) {
    case VIRTUAL_KEY.MINUS:
      return isShift ? '_' : '-';
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
    case 57:
      return isShift ? '(' : '9';
    default:
      throw new Error(`Invalid key code for number keys: ${vkCode}`);
  }
}

// Map from characters to multiple keypresses needed to enter them.
export const MULTI_KEY_CHARS: {[char: string]: Array<VIRTUAL_KEY|string>} = {
  '?': [VIRTUAL_KEY.LSHIFT, VIRTUAL_KEY.SLASH_QUESTION_MARK],
  '!': [VIRTUAL_KEY.LSHIFT, '1'],
  ':': [VIRTUAL_KEY.LSHIFT, VIRTUAL_KEY.SEMICOLON_COLON],
  '(': [VIRTUAL_KEY.LSHIFT, '9'],
  ')': [VIRTUAL_KEY.LSHIFT, '0'],
  '_': [VIRTUAL_KEY.LSHIFT, VIRTUAL_KEY.MINUS],
};

/**
 * Detect whether the key sequence ends with a subsequence that represents a
 * character entered by multiple characters, such as '?' and '!'.
 * @param keySequence
 * @returns If the sequence ends with a multi-char sequence that represents a
 *     character, the character will be returned. Else, `null` will be returned.
 */
export function tryDetectoMultiKeyChar(keySequence: string[]): string|null {
  for (const char in MULTI_KEY_CHARS) {
    const suffix = MULTI_KEY_CHARS[char];
    if (keySequenceEndsWith(keySequence, suffix)) {
      return char;
    }
  }
  return null;
}

/** Repeat a virtual key a given number of times. */
export function repeatVirtualKey(key: VIRTUAL_KEY, num: number): VIRTUAL_KEY[] {
  return Array(num).fill(key);
}

export type KeypressListener =
    (keySequence: string[], reconstructedText: string) => void;

export interface TextReconState {
  previousKeypressTimeMillis: number|null;
  // Number of keypresses effected through eye gaze (as determiend by
  // a temporal threshold).
  numGazeKeypresses: number;
  // The sequence of all keys, including ASCII and functional keys. Used in
  // the calculation of speed and keystroke saving rate (KSR).
  keySequence: string[];
  // Millisecond timestamp (since epoch) for the previous keypress (if any)
  text: string;
  cursorPos: number;
  isShiftOn: boolean;
}

export function createInitialTextReconState(): TextReconState {
  return {
    previousKeypressTimeMillis: null,
    numGazeKeypresses: 0,
    keySequence: [],
    text: '',
    cursorPos: 0,
    isShiftOn: false,
  };
}

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

const internalReconState = createInitialTextReconState();
const externalReconState = createInitialTextReconState();

const ignoreMachineKeySequenceConfigs: IgnoreMachineKeySequenceConfig[] = [];
let textEntryBeginSubject: Subject<TextEntryBeginEvent>;
let textEntryEndSubject: Subject<TextEntryEndEvent>;
let inputBarControlSubject: Subject<InputBarControlEvent>;

export function setInternalReconStateForTest(reconState: TextReconState) {
  Object.assign(internalReconState, reconState);
}

@Component({
  selector: 'app-external-events-component',
  templateUrl: './external-events.component.html',
})
export class ExternalEventsComponent implements OnInit {
  @Input() textEntryBeginSubject!: Subject<TextEntryBeginEvent>;
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input() inputBarControlSubject!: Subject<InputBarControlEvent>;

  private static readonly keypressListeners: KeypressListener[] = [];
  private static toggleForegroundCallback?: (toForeground: boolean) => void;
  private static toggleEyeTrackingCallback?: () => void;

  ExternalEvewntsComponent() {}

  ngOnInit() {
    textEntryBeginSubject = this.textEntryBeginSubject;
    textEntryEndSubject = this.textEntryEndSubject;
    inputBarControlSubject = this.inputBarControlSubject;
    this.textEntryEndSubject.subscribe(event => {
      // TODO(cais): Add unit test.
      if (!event.isFinal) {
        return;
      }
      resetReconStates();
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
   * Register a callback for when external events (e.g., a special combo key)
   * cause the app to be put in the foreground. The caller and the callback is
   * responsible for calling the binding method `bringWindowToForeground()`.
   * @param callback
   */
  public static registerToggleForegroundCallback(
      callback: (toForeground: boolean) => void) {
    ExternalEventsComponent.toggleForegroundCallback = callback;
  }

  public static clearToggleForegroundCallback() {
    if (ExternalEventsComponent.toggleForegroundCallback) {
      ExternalEventsComponent.toggleForegroundCallback = undefined;
    }
  }

  // TODO(cais): Add doc string and unit tests.
  /**
   * Register a callback for when the shortcut key for toggling eye gaze (gaze
   * buttons' enabled state) is pressed.
   * @param callback
   */
  public static registerToggleEyeTrackingCallback(callback: () => void) {
    ExternalEventsComponent.toggleEyeTrackingCallback = callback;
  }

  public static clearToggleEyeTrackingCallback() {
    ExternalEventsComponent.toggleEyeTrackingCallback = undefined;
  }

  public static getEyeTrackingPausedMessage(): string {
    return `⏸︎ Eye tracking is paused. To re-enable it, use Ctrl+${
        LCTRL_KEY_HEAD_FOR_EYE_TRACKING_TOGGLE}.`;
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
    for (const existingConfig of ignoreMachineKeySequenceConfigs) {
      if (JSON.stringify(existingConfig.keySequence) ===
          JSON.stringify(ignoreConfig.keySequence)) {
        throw new Error(`Ignore sequence already exists: ${
            JSON.stringify(existingConfig.keySequence)}`);
      }
    }
    ignoreMachineKeySequenceConfigs.push(ignoreConfig);
  }

  /**
   * Register a machine-generated key sequence to be ignored. If the config in
   * the parameter has not been registered, an error will be thrown.
   */
  public static unregisterIgnoreKeySequence(
      ignoreConfig: IgnoreMachineKeySequenceConfig) {
    for (let i = ignoreMachineKeySequenceConfigs.length - 1; i >= 0; --i) {
      const existingConfig = ignoreMachineKeySequenceConfigs[i];
      if (JSON.stringify(existingConfig.keySequence) ===
          JSON.stringify(ignoreConfig.keySequence)) {
        ignoreMachineKeySequenceConfigs.splice(i, 1);
        return;
      }
    }
    throw new Error(
        `Ignore config is not found: ${JSON.stringify(ignoreConfig)}`);
  }

  public static clearIgnoreKeySequences() {
    ignoreMachineKeySequenceConfigs.splice(0);
  }

  /** Get the number of registered keypress listeners. */
  public static getNumKeypressListeners(): number {
    return ExternalEventsComponent.keypressListeners.length;
  }

  /** Clear all registered keypress listeners. */
  public static clearKeypressListeners() {
    ExternalEventsComponent.keypressListeners.splice(0);
  }

  public static externalKeypressHook(vkCode: number, isExternal = true) {
    const virtualKey = getKeyFromVirtualKeyCode(vkCode);
    if (virtualKey === null) {
      return;
    }
    const reconState = isExternal ? externalReconState : internalReconState;
    reconState.keySequence.push(virtualKey);
    const nowMillis = Date.now();
    const isInferredMachineKey =
        reconState.previousKeypressTimeMillis !== null &&
        (nowMillis - reconState.previousKeypressTimeMillis) <
            MIN_GAZE_KEYPRESS_MILLIS;
    if (reconState.previousKeypressTimeMillis === null ||
        !isInferredMachineKey) {
      reconState.numGazeKeypresses++;
    }
    reconState.previousKeypressTimeMillis = nowMillis;
    if (keySequenceEndsWith(
            reconState.keySequence, BRING_TO_FOREGROUND_COMBO_KEY)) {
      if (ExternalEventsComponent.toggleForegroundCallback) {
        ExternalEventsComponent.toggleForegroundCallback(
            /* toForeground= */ isExternal);
      }
      return;
    } else if (keySequenceEndsWith(
                   reconState.keySequence, EYE_TRACKING_TOGGLE_COMBO_KEY)) {
      if (ExternalEventsComponent.toggleEyeTrackingCallback) {
        ExternalEventsComponent.toggleEyeTrackingCallback();
      }
      return;
    } else if (
        isExternal &&
        (EXTERNAL_PHRASE_DELIMITERS.some(
            delimiter =>
                keySequenceEndsWith(reconState.keySequence, delimiter)))) {
      // A TTS action has been triggered.
      ExternalEventsComponent.sendReconStateAsTextEntryEndEvent(reconState);
      return;
    }

    const originallyEmpty = reconState.text === '';
    const multiKeyChar = tryDetectoMultiKeyChar(reconState.keySequence);
    if (multiKeyChar !== null) {
      insertCharAsCursorPos(multiKeyChar, reconState);
    } else if (
        virtualKey.length === 1 && (virtualKey >= 'a' && virtualKey <= 'z')) {
      insertCharAsCursorPos(virtualKey, reconState);
    } else if (
        virtualKey.length === 1 && (virtualKey >= '0' && virtualKey <= '9')) {
      insertCharAsCursorPos(
          getNumOrPunctuationLiteral(vkCode, reconState.isShiftOn), reconState);
    } else if (virtualKey === VIRTUAL_KEY.SPACE) {
      insertCharAsCursorPos(' ', reconState);
    } else if (virtualKey === VIRTUAL_KEY.ENTER) {
      insertCharAsCursorPos('\n', reconState);
    } else if (virtualKey === VIRTUAL_KEY.HOME) {
      reconState.cursorPos = getHomeKeyDestination(reconState);
    } else if (virtualKey === VIRTUAL_KEY.END) {
      reconState.cursorPos = getEndKeyDestination(reconState);
    } else if (PUNCTUATION.indexOf(virtualKey as VIRTUAL_KEY) !== -1) {
      insertCharAsCursorPos(
          getPunctuationLiteral(
              virtualKey as VIRTUAL_KEY, reconState.isShiftOn),
          reconState);
    }
    const twoKeysBack =
        reconState.keySequence[reconState.keySequence.length - 3];
    const prevKey = reconState.keySequence[reconState.keySequence.length - 2];
    const isTwoKeysBackCtrl =
        twoKeysBack === VIRTUAL_KEY.LCTRL || twoKeysBack === VIRTUAL_KEY.RCTRL;
    const isPrevKeyShift =
        prevKey === VIRTUAL_KEY.LSHIFT || prevKey === VIRTUAL_KEY.RSHIFT;
    const isPrevKeyCtrl =
        prevKey === VIRTUAL_KEY.LCTRL || prevKey === VIRTUAL_KEY.RCTRL;
    if (virtualKey === VIRTUAL_KEY.BACKSPACE) {
      if (isPrevKeyCtrl ||
          keySequenceEndsWith(
              reconState.keySequence, WORD_BACKSPACE_COMBO_KEY)) {
        // Word delete.
        wordBackspace(reconState);
      } else {
        if (reconState.cursorPos > 0) {
          reconState.text = reconState.text.slice(0, reconState.cursorPos - 1) +
              reconState.text.slice(reconState.cursorPos);
          reconState.cursorPos--;
        }
      }
    } else if (virtualKey === VIRTUAL_KEY.DELETE) {
      if (reconState.cursorPos < reconState.text.length) {
        reconState.text = reconState.text.slice(0, reconState.cursorPos) +
            reconState.text.slice(reconState.cursorPos + 1);
      }
    } else if (
        virtualKey === VIRTUAL_KEY.LSHIFT ||
        virtualKey === VIRTUAL_KEY.RSHIFT) {
      reconState.isShiftOn = true;
    } else if (
        virtualKey === VIRTUAL_KEY.LARROW &&
        !(isTwoKeysBackCtrl && isPrevKeyShift)) {
      if (reconState.cursorPos > 0) {
        reconState.cursorPos--;
      }
    } else if (virtualKey === VIRTUAL_KEY.RARROW) {
      if (reconState.cursorPos < reconState.text.length) {
        reconState.cursorPos++;
      }
    }
    if (virtualKey !== VIRTUAL_KEY.LSHIFT &&
        virtualKey !== VIRTUAL_KEY.RSHIFT) {
      reconState.isShiftOn = false;
    }

    if (isExternal &&
        SENTENCE_END_COMBO_KEYS.some(
            keys => keySequenceEndsWith(reconState.keySequence, keys))) {
      // An external sentence-end sequence has been triggered.
      ExternalEventsComponent.sendReconStateAsTextEntryEndEvent(reconState);
      return;
    }

    if (originallyEmpty && reconState.text.length > 0) {
      textEntryBeginSubject.next({timestampMillis: Date.now()});
    }

    processIgnoreMachineKeySequences(
        isInferredMachineKey, reconState,
        isExternal ? undefined : inputBarControlSubject);
    if (!isExternal) {
      ExternalEventsComponent.keypressListeners.forEach(listener => {
        listener(reconState.keySequence, reconState.text);
      });
    }

    // TODO(cais): Take care of the up and down arrow keys.
    // TODO(cais): Track ctrl state.
    // TODO(cais): Take care of selection state, including Ctrl+A.
    // TODO(cais): Take care of Shift+Backspace and Shift+Delete.
  }

  private static sendReconStateAsTextEntryEndEvent(reconState: TextReconState) {
    const text = reconState.text.replace(/\n/g, ' ').trim();
    if (removePunctuation(text)) {
      textEntryEndSubject.next({
        text,
        timestampMillis: Date.now(),
        numHumanKeypresses: reconState.numGazeKeypresses,
        isFinal: true,
      });
    }
  }

  public static placeCursor(cursorPos: number, isExternal = false) {
    const reconState = isExternal ? externalReconState : internalReconState;
    if (cursorPos > reconState.text.length) {
      reconState.cursorPos = reconState.text.length;
    } else if (cursorPos < 0) {
      reconState.cursorPos = 0;
    } else {
      reconState.cursorPos = cursorPos;
    }
  }

  /**
   * Append a string to the current reconstruction state.
   *
   * If the current string doesn't end with a whitespace, a space character will
   * be appending before the input string is appended.
   *
   * @param str
   * @param isExternal
   * @param ensureEndsInSpace Whether a space will be appended additionally if
   *     the
   *   reconstructed text does not end in whitespace.
   */
  public static appendString(
      str: string, isExternal: boolean, ensureEndsInSpace = true) {
    const reconState = isExternal ? externalReconState : internalReconState;
    for (const char of str) {
      reconState.keySequence.push(char);
    }
    if (reconState.text && !reconState.text.match(/.*\s$/)) {
      reconState.text += ' ';
    }
    reconState.text += str;
    if (ensureEndsInSpace) {
      reconState.text += ' ';
    }
    reconState.cursorPos = reconState.text.length;
  }

  static get externalText(): string {
    return externalReconState.text;
  }

  static get internalText(): string {
    return internalReconState.text;
  }

  static get internalCursorPos(): number {
    return internalReconState.cursorPos;
  }
}
