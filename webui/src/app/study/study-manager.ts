/** Manager class for dialogs in a study. */

import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Subject} from 'rxjs';

import {HttpEventLogger} from '../event-logger/event-logger-impl';

/** A dialog, i.e., conversation between two speakers. */
export interface Dialog {
  // Turns of the dialog.
  turns: string[];
}

const COMMAND_STUDY_ON = 'study on';
const COMMAND_STUDY_OFF = 'study off';
const DIALOG_START_PREFIX = 'dialog start ';
const DIALOG_STOP = 'dialog stop';

const PARTNER_TURN_DELAY_MILLIS = 1000;
const USER_TURN_DELAY_MILLIS = 3000;

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
  //   private actualDialogs: {[dialogId: string]: Dialog} = {};
  private turnTimestamps: Date[] = [];
  private currentDialogId: string|null = null;
  private currentDialogTurnMode: 'a'|'b'|null = null;
  private currentTurnIndex: number|null = null;

  public studyUserTurns: Subject<{text: string | null, isComplete: boolean}> =
      new Subject;

  constructor(readonly httpC: HttpClient) {}

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
        this.currentDialogTurnMode = 'b';
        this.incrementTurn();
      } else {
        this.currentDialogTurnMode = 'a';
        setTimeout(() => this.emitStudyUserTurn(), USER_TURN_DELAY_MILLIS);
      }
      return true;
    } else if (text === DIALOG_STOP) {
      this.reset();
      return true;
    }
    return false;
  }

  private emitStudyUserTurn() {
    const dialog = this.dialogs[this.currentDialogId!];
    const numTurns = dialog.turns.length;
    this.studyUserTurns.next({
      text: this.isUserTurn ? this.getCurrentDialogTurnText() : null,
      isComplete: this.currentTurnIndex === numTurns,
    });
  }

  private reset() {
    this.currentDialogId = null;
    this.currentDialogTurnMode = null;
    this.currentTurnIndex = null;
    // TODO(cais): Add unit tests.
    this.studyUserTurns.next({text: null, isComplete: true});
  }

  public async loadDialog(dialogId: string) {
    // TODO(cais): Check for non-empty dialog turns.
  }

  public async startDialog(dialogId: string) {
    this.dialogs[dialogId] = {
      turns: [
        'Shall we go', 'I am not ready yet', 'When will you be ready',
        'Not sure', 'Hurry up', 'Okay, will be there soon'
      ],
    };
    if (this.dialogs[dialogId] === undefined) {
      await this.loadDialog(dialogId);
    }
    this.currentDialogId = dialogId;
    this.currentTurnIndex = 0;
    this.turnTimestamps.splice(0);
  }

  public getCurrentDialogId(): string|null {
    return this.currentDialogId;
  }

  /**
   * Get 0-based turn index.
   * @returns null if there is no ongoing dialog.
   */
  public getCurrentDialogTurnIndex(): number|null {
    return this.currentTurnIndex;
  }

  /**
   * Get the text of the current turn.
   * @returns
   */
  public getCurrentDialogTurnText(): string|null {
    if (this.currentDialogId === null || this.currentTurnIndex === null) {
      return null;
    }
    return this.dialogs[this.currentDialogId].turns[this.currentTurnIndex];
  }

  public getPreviousDialogTurnTexts():
      Array<{text: string, partnerId: string|null, timestamp: Date}>|null {
    if (this.currentDialogId === null || this.currentTurnIndex === null) {
      return null;
    }
    const texts = this.dialogs[this.currentDialogId].turns.slice(
        0, this.currentTurnIndex);
    return texts.map((text, i) => {
      let partnerId = null;
      if ((this.currentDialogTurnMode === 'a' && i % 2 === 1) ||
          (this.currentDialogTurnMode === 'b' && i % 2 === 0)) {
        partnerId = 'Partner';
      }
      return {
        text, partnerId, timestamp: this.turnTimestamps[i],
      }
    });
  }

  public incrementTurn(): {turnIndex: number, isComplete: boolean} {
    if (this.currentDialogId === null) {
      throw new Error(
          'Cannot increment dialog turn because there is not ongoing study dialog.');
    }
    const dialog = this.dialogs[this.currentDialogId];
    const numTurns = dialog.turns.length;
    if (this.currentTurnIndex! >= numTurns) {
      throw new Error(
          `Cannot increment turn, already at the end: ${numTurns - 1}`);
    }
    this.turnTimestamps.push(new Date());
    if (this.isUserTurn) {
      console.log('*** A100: is user turn:', this.currentTurnIndex);  // DEBUG
      this.studyUserTurns.next({
        text: null,
        isComplete: false,
      });
    }
    this.currentTurnIndex!++;
    const isComplete = this.currentTurnIndex === numTurns;
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
    return {turnIndex: this.currentTurnIndex!, isComplete};
  }

  public get isUserTurn(): boolean {
    if (this.currentDialogId === null) {
      return false;
    }
    const dialog = this.dialogs[this.currentDialogId];
    const numTurns = dialog.turns.length;
    return this.currentTurnIndex! < numTurns &&
        (this.currentDialogTurnMode === 'a' &&
         this.currentTurnIndex! % 2 === 0) ||
        (this.currentDialogTurnMode === 'b' &&
         this.currentTurnIndex! % 2 === 1);
  }
}
