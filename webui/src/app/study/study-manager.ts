/** Manager class for dialogs in a study. */

import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Subject} from 'rxjs';

import {HttpEventLogger} from '../event-logger/event-logger-impl';

/** A dialog, i.e., conversation between exactly two speakers. */
export interface Dialog {
  // Turns of the dialog.
  turns: string[];
}

export interface StudyDialogResponse {
  dialog_id: string;
  dialog?: Dialog;
  error?: string;
}

// Command to start a study: Turns the logging mode to full.
const COMMAND_STUDY_ON = 'study on';
// Command to stop a study: Turns the logging mode to default (non-full).
const COMMAND_STUDY_OFF = 'study off';
// Prefix of a command to start a scripted dialog in abbreviaton mode. Starting
// a dialog automatically sets the logging mode to full.
const START_ABBREV_PREFIX = 'start abbrev ';
// Same as the `start abbrev `command, but for full text entry mode (i.e., not
// abbreviation.)
const START_FULL_PREFIX = 'start full ';
// Command to stop a script dialog, if one is already started.
const DIALOG_STOP = 'dialog stop';
// The dialog ID for free form conversation.
const FREEFORM_DIALOG_ID = 'freeform';

// The prefix of the ID of any dialog that is unscripted.
const UNSCRIPTED_ID_PREFIX = 'u';

const PARTNER_TURN_DELAY_MILLIS = 1000;
const USER_TURN_DELAY_MILLIS = 3000;

let partnerTurnDelayMillisForTest: number|null = null;
let userTurnDelayMillisForTest: number|null = null;

export function setDelaysForTesting(
    partnerTurnDelayMillis: number, userTurnDelayMillis: number) {
  partnerTurnDelayMillisForTest = partnerTurnDelayMillis;
  userTurnDelayMillisForTest = userTurnDelayMillis;
}

function getPartnerTurnDelayMillis(): number {
  return partnerTurnDelayMillisForTest || PARTNER_TURN_DELAY_MILLIS;
}

function getUserTurnDelayMillis(): number {
  return userTurnDelayMillisForTest || USER_TURN_DELAY_MILLIS;
}

/**
 * Determines whether a string is a study command for the SpeakFaster UI.
 * @param text
 * @returns A boolean indicator.
 */
export function isCommand(text: string): boolean {
  text = text.trim().toLocaleLowerCase();
  return text === COMMAND_STUDY_ON || text === COMMAND_STUDY_OFF ||
      text.startsWith(START_ABBREV_PREFIX) ||
      text.startsWith(START_FULL_PREFIX) || text.startsWith(DIALOG_STOP);
}

/** A turn to be entered by the user. */
export interface StudyUserTurn {
  text: string|null;
  instruction: string;
  isAbbreviation: boolean;
  isComplete: boolean;
  error?: string;
}

const STUDY_DIALOG_ENDPOINT = '/study_dialogs';

@Injectable({
  providedIn: 'root',
})
export class StudyManager {
  private dialogs: {[dialogId: string]: Dialog} = {};
  private _isStudyOn: boolean = false;
  private turnTimestamps: Date[] = [];
  // The ID of the current ongoing dialog (if any). `null` means there is no
  // ongoing dialog.
  private dialogId: string|null = null;
  // Whether the current ongoing dialog is for user to enter abbreviation, if
  // any. `null` if there is no ongoing dialog.
  private isAbbreviation: boolean|null = null;
  // Which role is played by the user in this dialog: 'a' means the user starts
  // the dialog, 'b' means the partner starts the dialog.
  private userRole: 'a'|'b'|null = null;
  // The current turn (i.e., the turn that is ongoing and hasn't been completed
  // yet), 0-based. So 0 means the 1st turn of the dialog.
  private turnIndex: number|null = null;
  private actualTurnTexts: {[turnIndex: number]: string} = {};
  private isFullyScripted: boolean = true;
  // Waiting for partner turns after the epoch millis timestamp.
  private _waitingForPartnerTurnAfter: number|null = null;

  // A subject for the turns that the user should enter.
  public studyUserTurns: Subject<StudyUserTurn> = new Subject();

  /** Constructor of StudyManager. */
  constructor(
      readonly httpClient: HttpClient|null,
      private eventLogger: HttpEventLogger|null) {
    this.populateDummyDialogs();
  }

  /**
   * Detect remote-control commands and handle them accordingly
   * @param text
   * @returns whether `text` is handled as a remote-control command.
   * */
  public async maybeHandleRemoteControlCommand(text: string): Promise<boolean> {
    text = text.trim().toLocaleLowerCase();
    let isHandledAsCommand = true;
    if (text === COMMAND_STUDY_ON) {
      this.switchToStudyOnMode();
    } else if (text === COMMAND_STUDY_OFF) {
      HttpEventLogger.setFullLogging(false);
      this.reset(/* error= */ undefined, /* endStudy= */ true);
    } else if (
        text.startsWith(START_ABBREV_PREFIX) ||
        text.startsWith(START_FULL_PREFIX)) {
      const isAbbreviation = text.startsWith(START_ABBREV_PREFIX);
      const prefix = isAbbreviation ? START_ABBREV_PREFIX : START_FULL_PREFIX;
      const dialogIdAndTurn = text.slice(prefix.length).trim();
      // Turn = 'a' means the machine starts the turn.
      const [dialogId, turn] = dialogIdAndTurn.split(' ');
      await this.startDialog(dialogId, isAbbreviation);
      this.isFullyScripted = !dialogId.startsWith(UNSCRIPTED_ID_PREFIX);
      if ((turn && turn.toLocaleLowerCase() === 'b') || !this.isFullyScripted) {
        // For now, unscripted dialogs starts with a turn from the partner.
        this.userRole = 'b';
        this.incrementTurn();
      } else {
        this.userRole = 'a';
        setTimeout(() => this.emitStudyUserTurn(), getUserTurnDelayMillis());
      }
      this.switchToStudyOnMode();
    } else if (text === DIALOG_STOP) {
      this.reset();
    } else {
      isHandledAsCommand = false;
    }
    if (isHandledAsCommand && this.eventLogger !== null) {
      this.eventLogger.logRemoteCommand({
        command: text,
      });
    }
    return isHandledAsCommand;
  }

  private switchToStudyOnMode() {
    HttpEventLogger.setFullLogging(true);
    this._isStudyOn = true;
  }

  /** Emits a user's turn to the subject.  */
  private emitStudyUserTurn() {
    const dialog = this.dialogs[this.dialogId!];
    if (dialog === undefined) {
      return;
    }
    const numTurns = dialog.turns.length;
    const turnText = this.getDialogTurnText();
    let instruction =
        this.isAbbreviation ? 'Enter in abbreviation:' : 'Enter in full:';
    if (turnText === '') {  // Unscripted.
      instruction = this.isAbbreviation ? 'Enter your reply in abbreviation.' :
                                          'Enter your reply in full';
    }
    this.studyUserTurns.next({
      instruction,
      text: this.isUserTurn ? turnText : null,
      isAbbreviation: this.isAbbreviation!,
      isComplete: this.turnIndex === numTurns,
    });
  }

  private reset(error?: string, endStudy: boolean = false) {
    if (endStudy) {
      this._isStudyOn = false;
    }
    this.dialogId = null;
    this.userRole = null;
    this.turnIndex = null;
    this.actualTurnTexts = {};
    this.isFullyScripted = true;
    this._waitingForPartnerTurnAfter = null;
    this.studyUserTurns.next({
      instruction: '',
      text: null,
      isAbbreviation: true,
      isComplete: true,
      error,
    });
  }

  private async loadDialog(dialogId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!dialogId) {
        reject(new Error(`Invalid dialog ID: ${dialogId}`));
      }
      this.httpClient
          ?.get<StudyDialogResponse>(STUDY_DIALOG_ENDPOINT, {
            headers: {
              'Content-Type': 'application/json',
            },
            params: {
              dialog_id: dialogId,
            }
          })
          .subscribe(
              (response: StudyDialogResponse) => {
                if (!response.error && response.dialog) {
                  this.dialogs[dialogId] = response.dialog;
                  console.log(
                      `Loaded dialog ${dialogId}:`,
                      JSON.stringify(response.dialog));
                }
                resolve();
              },
              err => {
                reject(err);
              });
    });
  }

  /** Starts a dialog of the given dialog ID. */
  public async startDialog(dialogId: string, isAbbreviation: boolean) {
    if (!dialogId) {
      throw new Error('Invalid dialog ID');
    }
    if (dialogId.toLocaleLowerCase() !==
            FREEFORM_DIALOG_ID.toLocaleLowerCase() &&
        this.dialogs[dialogId] === undefined) {
      try {
        await this.loadDialog(dialogId);
      } catch (err) {
        const errorMessage = `Failed to load dialog of ID "${dialogId}"`;
        console.error(errorMessage);
        this.reset(errorMessage);
        return;
      }
    }
    this.dialogId = dialogId.toLocaleLowerCase();
    console.log('Starting dialog:', this.dialogId);
    this.isAbbreviation = isAbbreviation;
    this.turnIndex = 0;
    this.turnTimestamps.splice(0);
  }

  public get isStudyOn(): boolean {
    return this._isStudyOn;
  }

  public get isAbbreviationMode(): boolean {
    return this.isAbbreviation === true;
  }

  /**
   * Gets the ID of the current ongoing dialog, if any. Returns `null` if and
   * only if there is no ongoing dialog.
   */
  public getDialogId(): string|null {
    return this.dialogId;
  }

  /**
   * Gets whether the study manager is currently waiting for a turn from the
   * partner (during unscripted dialogs). If not waiting, returns `null`. If
   * waiting, returns the timestamp in milliseconds since the epoch of when the
   * waiting started.
   */
  public get waitingForPartnerTurnAfter(): number|null {
    return this._waitingForPartnerTurnAfter;
  }

  public isDialogOngoing(): boolean {
    return this.dialogId !== null && this.dialogId !== FREEFORM_DIALOG_ID;
  }

  /**
   * Gets the 0-based turn index of the ongoing dialog (if any).
   * @returns `null` if there is no ongoing dialog.
   */
  public getDialogTurnIndex(): number|null {
    return this.turnIndex;
  }

  /**
   * Get the text of the current ongoing (i.e., to be completed) turn.
   * @returns
   */
  public getDialogTurnText(): string|null {
    if (this.dialogId === null || this.turnIndex === null) {
      return null;
    }
    return this.dialogs[this.dialogId].turns[this.turnIndex];
  }

  /**
   * Gets the text of the completed turns of the ongoing dialog (if any).
   * If there is no ongoing diaog, returns null.
   */
  public getPreviousDialogTurns():
      Array<{text: string, partnerId: string|null, timestamp: Date}>|null {
    if (this.dialogId === null || this.turnIndex === null) {
      return null;
    }
    const texts = this.dialogs[this.dialogId].turns.slice(0, this.turnIndex);
    return texts.map((text, i) => {
      let partnerId = null;
      if ((this.userRole === 'a' && i % 2 === 1) ||
          (this.userRole === 'b' && i % 2 === 0)) {
        partnerId = 'Partner';
      }
      if (this.actualTurnTexts[i]) {
        text = this.actualTurnTexts[i];
      }
      return {
        text, partnerId, timestamp: this.turnTimestamps[i],
      }
    });
  }

  /**
   * Increments the turn index in the ongoing dialog (if any).
   * @param turnText: The actual entered turn text. Optional. If not provided,
   *   will use the turn from the script.
   * @returns A object with the following fields:
   *   - turnIndex: The 0-based turn index after the turn increment.
   *   - isComplete: A boolean flag for whether the dialog is complete after the
   *     increment.
   * @throw Error if there is no ongoing dialog, or if the ongoing dialog has
   *   already ended.
   */
  public incrementTurn(turnText?: string):
      {turnIndex: number, isComplete: boolean} {
    if (this.dialogId === null) {
      throw new Error(
          'Cannot increment dialog turn because there is not ongoing study dialog.');
    }
    this._waitingForPartnerTurnAfter = null;
    if (turnText) {
      this.actualTurnTexts[this.turnIndex!] = turnText;
    }
    const dialog = this.dialogs[this.dialogId];
    const numTurns = dialog.turns.length;
    if (this.turnIndex! >= numTurns) {
      throw new Error(
          `Cannot increment turn, already at the end: ${numTurns - 1}`);
    }
    this.turnTimestamps.push(new Date());
    if (this.isUserTurn) {
      this.studyUserTurns.next({
        instruction: '',
        text: null,
        isAbbreviation: this.isAbbreviation!,
        isComplete: false,
      });
    }
    this.turnIndex!++;
    const isComplete = this.turnIndex === numTurns;
    if (isComplete) {
      setTimeout(() => {
        this.emitStudyUserTurn();
        this.reset();
      }, getUserTurnDelayMillis());
    } else {
      if (!this.isUserTurn) {
        if (this.isFullyScripted) {
          setTimeout(() => {
            this.incrementTurn();
          }, getPartnerTurnDelayMillis());
        } else {
          // Start waiting for a manually entered turn from the partner.
          this._waitingForPartnerTurnAfter = new Date().getTime();
        }
      } else {
        setTimeout(() => this.emitStudyUserTurn(), getUserTurnDelayMillis());
      }
    }
    return {turnIndex: this.turnIndex!, isComplete};
  }

  /**
   * Gets whether there is an ongoing dialog *and* it is currently the user's
   * turn.
   */
  public get isUserTurn(): boolean {
    if (this.dialogId === null) {
      return false;
    }
    const dialog = this.dialogs[this.dialogId];
    const numTurns = dialog.turns.length;
    return this.turnIndex! < numTurns &&
        (this.userRole === 'a' && this.turnIndex! % 2 === 0) ||
        (this.userRole === 'b' && this.turnIndex! % 2 === 1);
  }

  /**
   * Pre-populate hardcoded dummy dialogs that do not require retrieval over
   * the network.
   */
  private populateDummyDialogs() {
    this.dialogs['dummy1'] = {
      turns: [
        'Shall we go to the movies today',
        'What good movies are on right now',
        'We can check on our way there',
        'Not sure I want to see a movie right now',
        'How about going to the mall',
        'Okay, I\'ll get ready soon',
      ],
    };
    this.dialogs['dummy2'] = {
      turns: [
        'Bye bye',
        'See you later',
      ],
    };
    this.dialogs['dummy3'] = {
      turns: [
        'where is the dog?',
        'i saw him playing in the backyard',
      ]
    };
    this.dialogs['utest1'] =
        createUnscriptedDialogWithInitialQuestion(
            'How do you like the weather today?');
  }
}

function createUnscriptedDialogWithInitialQuestion(
    initialQuestion: string, numTurns = 6): Dialog {
  if (initialQuestion === '') {
    throw new Error('Initial question cannot be empty.');
  }
  if (numTurns < 2) {
    throw new Error(
        `Number of turns is expected to be >= 2, but got ${numTurns}`)
  }
  const turns: string[] = [];
  for (let i = 0; i < numTurns; ++i) {
    turns.push(i === 0 ? initialQuestion : '');
  }
  return {turns};
}
