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

// Command to start a study: Turns the logging mode to full.
const COMMAND_STUDY_ON = 'study on';
// Command to stop a study: Turns the logging mode to default (non-full).
const COMMAND_STUDY_OFF = 'study off';
// Prefix of a command to start a scripted dialog. Starting a dialog
// automatically sets the logging mode to full.
const DIALOG_START_PREFIX = 'dialog start ';
// Command to stop a script dialog, if one is already started.
const DIALOG_STOP = 'dialog stop';

const PARTNER_TURN_DELAY_MILLIS = 1000;
const USER_TURN_DELAY_MILLIS = 3000;

/**
 * Determines whether a string is a study command for the SpeakFaster UI.
 * @param text
 * @returns A boolean indicator.
 */
export function isCommand(text: string): boolean {
  text = text.trim().toLocaleLowerCase();
  return text === COMMAND_STUDY_ON || text === COMMAND_STUDY_OFF ||
      text.startsWith(DIALOG_START_PREFIX) || text.startsWith(DIALOG_STOP);
}

@Injectable({
  providedIn: 'root',
})
export class StudyManager {
  private dialogs: {[dialogId: string]: Dialog} = {};
  private turnTimestamps: Date[] = [];
  // The ID of the current ongoing dialog (if any). `null` means there is no
  // ongoing dialog.
  private dialogId: string|null = null;
  // Which role is played by the user in this dialog: 'a' means the user starts
  // the dialog, 'b' means the partner starts the dialog.
  private userRole: 'a'|'b'|null = null;
  // The current turn (i.e., the turn that is ongoing and hasn't been completed
  // yet), 0-based. So 0 means the 1st turn of the dialog.
  private turnIndex: number|null = null;

  // A subject for the turns that the user should enter.
  public studyUserTurns: Subject<{text: string | null, isComplete: boolean}> =
      new Subject;

  /** Constructor of StudyManager. */
  constructor(readonly httpClient: HttpClient|null) {
    this.populateDummyDialogs();
  }

  /**
   * Detect remote-control commands and handle them accordingly
   * @param text
   * @returns whether `text` is handled as a remote-control command.
   * */
  public async maybeHandleRemoteControlCommands(text: string):
      Promise<boolean> {
    text = text.trim().toLocaleLowerCase();
    if (text === COMMAND_STUDY_ON) {
      HttpEventLogger.setFullLogging(true);
      return true;
    } else if (text === COMMAND_STUDY_OFF) {
      HttpEventLogger.setFullLogging(false);
      this.reset();
      return true;
    } else if (text.startsWith(DIALOG_START_PREFIX)) {
      const dialogIdAndTurn = text.slice(DIALOG_START_PREFIX.length).trim();
      // Turn = 'a' means the machine starts the turn.
      const [dialogId, turn] = dialogIdAndTurn.split(' ');
      console.log(`Starting dialog ${dialogId}: turn=${turn}`);
      await this.startDialog(dialogId);
      if (turn && turn.toLocaleLowerCase() === 'b') {
        this.userRole = 'b';
        this.incrementTurn();
      } else {
        this.userRole = 'a';
        setTimeout(() => this.emitStudyUserTurn(), USER_TURN_DELAY_MILLIS);
      }
      HttpEventLogger.setFullLogging(true);
      return true;
    } else if (text === DIALOG_STOP) {
      this.reset();
      return true;
    }
    return false;
  }

  /** Emits a user's turn to the subject.  */
  private emitStudyUserTurn() {
    const dialog = this.dialogs[this.dialogId!];
    const numTurns = dialog.turns.length;
    this.studyUserTurns.next({
      text: this.isUserTurn ? this.getDialogTurnText() : null,
      isComplete: this.turnIndex === numTurns,
    });
  }

  private reset() {
    this.dialogId = null;
    this.userRole = null;
    this.turnIndex = null;
    // TODO(cais): Add unit tests.
    this.studyUserTurns.next({text: null, isComplete: true});
  }

  public async loadDialog(dialogId: string) {
    // TODO(cais): Implement.
    // TODO(cais): Check for non-empty dialog turns.
  }

  /** Starts a dialog of the given dialog ID. */
  public async startDialog(dialogId: string) {
    // TODO(cais): Remove the hard coded dialog.
    if (this.dialogs[dialogId] === undefined) {
      await this.loadDialog(dialogId);
    }
    this.dialogId = dialogId;
    this.turnIndex = 0;
    this.turnTimestamps.splice(0);
  }

  /**
   * Gets the ID of the current ongoing dialog, if any. Returns `null` if and
   * only if there is no ongoing dialog.
   */
  public getDialogId(): string|null {
    return this.dialogId;
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
  public getPreviousDialogTurnTexts():
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
      return {
        text, partnerId, timestamp: this.turnTimestamps[i],
      }
    });
  }

  /**
   * Increments the turn index in the ongoing dialog (if any).
   * @returns A object with the following fields:
   *   - turnIndex: The 0-based turn index after the turn increment.
   *   - isComplete: A boolean flag for whether the dialog is complete after the
   *     increment.
   * @throw Error if there is no ongoing dialog, or if the ongoing dialog has
   *   already ended.
   */
  public incrementTurn(): {turnIndex: number, isComplete: boolean} {
    if (this.dialogId === null) {
      throw new Error(
          'Cannot increment dialog turn because there is not ongoing study dialog.');
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
        text: null,
        isComplete: false,
      });
    }
    this.turnIndex!++;
    const isComplete = this.turnIndex === numTurns;
    if (isComplete) {
      setTimeout(() => this.emitStudyUserTurn(), USER_TURN_DELAY_MILLIS);
    } else {
      if (!this.isUserTurn) {
        setTimeout(() => {
          this.incrementTurn();
          setTimeout(() => this.emitStudyUserTurn(), USER_TURN_DELAY_MILLIS);
        }, PARTNER_TURN_DELAY_MILLIS);
      } else {
        setTimeout(() => this.emitStudyUserTurn(), USER_TURN_DELAY_MILLIS);
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
        'Shall we go', 'I am not ready yet', 'When will you be ready',
        'Not sure', 'Hurry up', 'Okay, will be there soon'
      ],
    };
  }
}
