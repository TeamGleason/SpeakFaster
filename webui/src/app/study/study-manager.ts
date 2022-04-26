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

const DIALOG_START_PREFIX = 'dialog start ';
const DIALOG_STOP = 'dialog stop'

    @Injectable({
      providedIn: 'root',
    }) export class StudyManager {
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
    if (text === 'study on') {
      HttpEventLogger.setFullLogging(true);
      return true;
    } else if (text === 'study off') {
      HttpEventLogger.setFullLogging(false);
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
        this.emitStudyUserTurn();
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
    const isUsersTurn = this.currentTurnIndex! < numTurns &&
        ((this.currentDialogTurnMode === 'a' &&
          this.currentTurnIndex! % 2 === 0) ||
         (this.currentDialogTurnMode === 'b' &&
          this.currentTurnIndex! % 2 === 1));
    this.studyUserTurns.next({
      text: isUsersTurn ? this.getCurrentDialogTurnText() : null,
      isComplete: this.currentTurnIndex === numTurns,
    });
  }

  private reset() {
    this.currentDialogId = null;
    this.currentDialogTurnMode = null;
    this.currentTurnIndex = null;
  }

  public async loadDialog(dialogId: string) {
    // TODO(cais): Check for non-empty dialog turns.
  }

  public async startDialog(dialogId: string) {
    // DEBUG
    this.dialogs[dialogId] = {
      turns: [
        'Shall we go', 'I am not ready yet', 'When will you be ready',
        'No idea', 'Hurry up', 'Stop rushing me'
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

  //   public getCurrentDialogActualText(): string[]|null {
  //     if (this.currentDialogId === null || this.currentTurnIndex === null) {
  //       return null;
  //     }
  //     return this.actualDialogs[this.currentDialogId].turns.slice(
  //         0, this.currentTurnIndex);
  //   }

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
    this.currentTurnIndex!++;
    const isComplete = this.currentTurnIndex === numTurns;
    if (isComplete) {
      this.emitStudyUserTurn();
    } else {
      if ((this.currentDialogTurnMode === 'a' &&
           this.currentTurnIndex! % 2 === 1) ||
          (this.currentDialogTurnMode === 'b' &&
           this.currentTurnIndex! % 2 === 0)) {
        this.incrementTurn();
      }
      this.emitStudyUserTurn();
    }
    return {turnIndex: this.currentTurnIndex!, isComplete};
  }
}
