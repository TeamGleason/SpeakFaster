/** Component that displays the contextual signals relevant for text entry. */

import {AfterViewInit, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject, Subscription, timer} from 'rxjs';
import {createUuid} from 'src/utils/uuid';

import {ConversationTurnComponent} from '../conversation-turn/conversation-turn.component';
import {getPhraseStats, HttpEventLogger} from '../event-logger/event-logger-impl';
import {SpeakFasterService} from '../speakfaster-service';
import {isCommand, StudyManager} from '../study/study-manager';
import {ContextSignal, ConversationTurnContextSignal, getConversationTurnContextSignal} from '../types/context';
import {ConversationTurn} from '../types/conversation';
import {TextEntryEndEvent} from '../types/text-entry';

import {DEFAULT_CONTEXT_SIGNALS} from './default-context';

@Component({
  selector: 'app-context-component',
  templateUrl: './context.component.html',
  providers: [],
})
export class ContextComponent implements OnInit, OnDestroy, AfterViewInit {
  private static readonly _NAME = 'ContextComponent';
  // Maximum number of used, most recent context signals, when study is on.
  // When study is off, use of context signals follows user focus.
  public static readonly MAX_USED_CONTEXT_COUNT_DURING_STUDY = 5;
  private static readonly MAX_DISPLAYED_CONTEXT_COUNT = 3;
  private static readonly MAX_FOCUS_CONTEXT_SIGNALS = 3;

  @Input() userId!: string;
  @Input() isStudyOn: boolean = false;
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input() isDev: boolean = false;

  private static readonly CONTEXT_POLLING_INTERVAL_MILLIS = 3 * 1000;
  private contextRetrievalTimerSubscription: Subscription|null = null;
  // These are all the context signals, including the ones that are utilized
  // (e.g., for AE) butnot displayed. These are the displayed context signals.
  readonly allContextSignals: ConversationTurnContextSignal[] = [];
  readonly contextSignals: ConversationTurnContextSignal[] = [];
  contextRetrievalError: string|null = null;

  @Output()
  contextStringsUpdated: EventEmitter<ConversationTurn[]> = new EventEmitter();
  @Output()
  contextStringsSelected: EventEmitter<ConversationTurn[]> = new EventEmitter();

  @ViewChildren('contextItem')
  viewButtons!: QueryList<ConversationTurnComponent>;

  private readonly focusContextIds: string[] = [];
  private continuousContextRetrieval = true;
  private studyUserTurnsSubscription?: Subscription;
  private handledCommandTimestamps: number[] = [];

  constructor(
      private speakFasterService: SpeakFasterService,
      private studyManager: StudyManager, private eventLogger: HttpEventLogger,
      private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    if (!this.userId) {
      throw new Error('Empty user ID');
    }
    this.focusContextIds.splice(0);
    this.textEntryEndSubject.subscribe((textInjection: TextEntryEndEvent) => {
      if (!textInjection.isFinal || textInjection.isAborted ||
          textInjection.text.trim() === '') {
        return;
      }
      if (this.studyManager.getDialogId() !== null) {
        this.studyManager.incrementTurn(textInjection.text);
        this.retrieveContext();
        return;
      }
      const timestamp = new Date(textInjection.timestampMillis);
      this.appendTextInjectionToContext(
          getConversationTurnContextSignal(this.userId, {
            speakerId: this.userId,
            speechContent: textInjection.text,
            startTimestamp: timestamp,
            isTts: true,
            isHardcoded: false,
          }));
      this.emitContextStringsSelected();
      // TODO(cais): Limit length of textInjections?
      this.studyUserTurnsSubscription =
          this.studyManager.studyUserTurns.subscribe(() => {
            this.retrieveContext();
          });
    });
  }

  ngOnDestroy() {
    if (this.studyUserTurnsSubscription) {
      this.studyUserTurnsSubscription.unsubscribe();
    }
  };

  ngAfterViewInit() {
    if (!this.continuousContextRetrieval) {
      return;
    }
    this.contextRetrievalTimerSubscription =
        timer(50, ContextComponent.CONTEXT_POLLING_INTERVAL_MILLIS)
            .subscribe(() => {
              this.retrieveContext();
            });
    this.viewButtons.changes.subscribe(() => {
      this.viewButtons.forEach((turnComponent) => {
        turnComponent.forceUpdateButtonBox();
      });
    });
  }

  disableContinuousContextRetrieval() {
    this.continuousContextRetrieval = false;
    if (this.contextRetrievalTimerSubscription === null) {
      return;
    }
    this.contextRetrievalTimerSubscription.unsubscribe();
  }

  isContextInFocus(contextId: string): boolean {
    return this.focusContextIds.indexOf(contextId) !== -1;
  }

  onTurnClicked(event: Event, contextId: string) {
    if (this.studyManager.isStudyOn) {
      // TODO(cais): Add unit test.
      return;
    }
    const i = this.focusContextIds.indexOf(contextId);
    if (i === -1) {
      this.focusContextIds.push(contextId);
      this.cleanUpAndSortFocusContextIds();
      for (let i = 0; i < this.contextSignals.length; ++i) {
        if (this.contextSignals[i].contextId === contextId) {
          break;
        }
      }
    } else {
      this.focusContextIds.splice(i, 1);
    }
    this.emitContextStringsSelected();
  }

  onContextAddButtonClicked(event: Event) {
    const text = prompt('Enter manual context:');
    if (text === null) {
      return;
    }
    const addedContextSignal: ConversationTurnContextSignal =
        getConversationTurnContextSignal(this.userId, {
          speakerId: this.userId,
          speechContent: text,
          startTimestamp: new Date(),
          isTts: false,
          isHardcoded: true,
        });
    this.allContextSignals.push(addedContextSignal);
    this.contextSignals.push(addedContextSignal);
    this.focusContextIds.splice(0);
    this.focusContextIds.push(addedContextSignal.contextId!);
    this.limitContextItemsCount();
    this.emitContextStringsSelected();
  }

  // NOTE: document:keydown can prevent the default tab-switching
  // action of Alt + number keys.
  handleKeyboardEvent(event: KeyboardEvent): boolean {
    if (this.studyManager.isStudyOn) {
      return false;
    }
    if (event.ctrlKey && event.key.toLocaleLowerCase() == 'c') {
      // Ctrl C for polling context.
      this.retrieveContext();
      return true;
    } else if (!event.altKey) {
      return false;
    }
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      return false;
    }
    const keyIndex = Number.parseInt(event.key) - 1;
    if (keyIndex >= 0 && keyIndex < this.contextSignals.length) {
      const contextId = this.contextSignals[keyIndex].contextId!;
      if (this.focusContextIds.indexOf(contextId) === -1) {
        this.focusContextIds.push(contextId);
        this.cleanUpAndSortFocusContextIds();
      } else if (
          this.focusContextIds.indexOf(contextId) !== -1 &&
          this.focusContextIds.length > 1) {
        this.focusContextIds.splice(this.focusContextIds.indexOf(contextId), 1);
      }
      return true;
    }
    return false;
  }

  private populateConversationTurnWithDefault() {
    if (this.contextSignals.length > 0) {
      return;
    }
    this.cleanUpContextSignals();
    this.allContextSignals.push(...DEFAULT_CONTEXT_SIGNALS);
    this.contextSignals.push(...DEFAULT_CONTEXT_SIGNALS);
    if (this.contextSignals.length > 0 && this.focusContextIds.length === 0) {
      this.focusContextIds.push(
          this.contextSignals[this.contextSignals.length - 1].contextId!);
      this.cleanUpAndSortFocusContextIds();
    }
    this.emitContextStringsSelected();
  }

  /**
   * Clean ups all the context signals that are not manually entered.
   */
  private cleanUpContextSignals() {
    for (let i = this.contextSignals.length - 1; i >= 0; --i) {
      if (this.contextSignals[i].isHardcoded) {
        this.contextSignals.splice(i, 1);
      }
    }
  }

  private retrieveContext() {
    if (this.studyManager.isDialogOngoing()) {
      this.allContextSignals.splice(0);
      this.contextSignals.splice(0);
      for (const {text, partnerId, timestamp} of this.studyManager
               .getPreviousDialogTurns()!) {
        if (isCommand(text)) {
          continue;
        }
        const signal: ConversationTurnContextSignal = {
          contextType: 'ConversationTurn',
          conversationTurn: {
            speakerId: partnerId,
            speechContent: text,
            startTimestamp: timestamp,
          },
          userId: this.userId,
          contextId: createUuid(),
          timestamp,
        };
        this.allContextSignals.push(signal);
        this.contextSignals.push(signal);
      }
      this.limitContextItemsCount();
      this.focusContextIds.splice(0);
      this.focusContextIds.push(
          ...this.contextSignals.map(signal => signal.contextId));
      const signalsToEmit = this.studyManager.isStudyOn ?
          this.allContextSignals :
          this.contextSignals;
      this.contextStringsSelected.emit(
          signalsToEmit.map(signal => signal.conversationTurn));
      if (this.studyManager.waitingForPartnerTurnAfter === null) {
        return;
      }
    }
    this.speakFasterService.retrieveContext(this.userId)
        .subscribe(
            async data => {
              if (data.errorMessage != null) {
                if (data.result !== 'ERROR_INVALID_USER_ID') {
                  this.contextRetrievalError = 'Context retrieval error';
                }
                this.populateConversationTurnWithDefault();
                return;
              }
              if (this.studyManager.waitingForPartnerTurnAfter !== null) {
                if (data.contextSignals == null ||
                    data.contextSignals.length === 0) {
                  return;
                }
                if (this.checkForIncomingPartnerTurns(
                        data.contextSignals,
                        this.studyManager.waitingForPartnerTurnAfter)) {
                  return;
                }
              } else {
                if (data.contextSignals == null ||
                    data.contextSignals.length === 0) {
                  this.populateConversationTurnWithDefault();
                  this.contextStringsUpdated.next([]);
                  return;
                }
                await this.processContextSignals(data.contextSignals);
              }
            },
            error => {
              this.cleanUpContextSignals();
              this.contextRetrievalError = 'Context retrieval error';
            });
  }

  /**
   * Check for context turns after the given timestamp.
   * @returns `true` if a context turn with a timestamp later than
   *     `afterEpochMillis` is found. Else, returns `false`.
   */
  private checkForIncomingPartnerTurns(
      contextSignals: ContextSignal[], afterEpochMillis: number): boolean {
    for (let i = contextSignals.length - 1; i >= 0; --i) {
      const contextSignal = contextSignals[i];
      if ((contextSignal as ConversationTurnContextSignal).conversationTurn ==
              null ||
          contextSignal.timestamp === undefined) {
        continue;
      }
      const timestamp = new Date(contextSignal.timestamp).getTime();
      const speechContent = (contextSignal as ConversationTurnContextSignal)
                                .conversationTurn.speechContent;
      if (timestamp > afterEpochMillis) {
        console.log(
            'Received manual partner turn:', speechContent, timestamp,
            this.studyManager.waitingForPartnerTurnAfter);
        this.studyManager.incrementTurn(speechContent);
        // TODO(cais): Add unit test.
        return true;
      }
    }
    return false;
  }

  private async processContextSignals(contextSignals: ContextSignal[]) {
    this.cleanUpContextSignals();
    let isHandledAsCommand = false;
    for (let i = contextSignals.length - 1; i >= 0; --i) {
      const contextSignal = contextSignals[i];
      if ((contextSignal as ConversationTurnContextSignal).conversationTurn ==
              null ||
          contextSignal.timestamp === undefined) {
        continue;
      }
      const timestamp = new Date(contextSignal.timestamp).getTime();
      const handledPreviously = this.handledCommandTimestamps.some(
          handledTimestamp => handledTimestamp >= timestamp);
      if (handledPreviously) {
        continue;
      }
      const speechContent = (contextSignal as ConversationTurnContextSignal)
                                .conversationTurn.speechContent;
      isHandledAsCommand =
          await this.studyManager.maybeHandleRemoteControlCommand(
              speechContent);
      if (isHandledAsCommand) {
        this.handledCommandTimestamps.push(timestamp);
        break;
      }
    }
    for (let contextSignal of (isHandledAsCommand ? [] : contextSignals)) {
      // TOOD(cais): Fix typing.
      if ((contextSignal as ConversationTurnContextSignal).conversationTurn ==
              null ||
          contextSignal.timestamp === undefined) {
        continue;
      }
      if (this.contextSignals.find(
              signal => contextSignal.contextId === signal.contextId)) {
        // Avoid adding duplicate context signals.
        continue;
      }
      const speechContent = (contextSignal as ConversationTurnContextSignal)
                                .conversationTurn.speechContent;
      if (isHandledAsCommand) {
        continue;
      }
      this.contextSignals.push(
          (contextSignal as ConversationTurnContextSignal));
      this.eventLogger.logIncomingContextualTurn(getPhraseStats(speechContent));
    }
    this.limitContextItemsCount();
    this.cleanUpAndSortFocusContextIds();
    if (this.focusContextIds.length === 0 && this.contextSignals.length > 0) {
      this.focusContextIds.push(
          this.contextSignals[this.contextSignals.length - 1].contextId!);
      this.cleanUpAndSortFocusContextIds();
    }
    this.emitContextStringsSelected();
    this.contextRetrievalError = null;
    this.contextStringsUpdated.next(
        this.contextSignals.map(signal => signal.conversationTurn));
  }

  private appendTextInjectionToContext(turnSignal:
                                           ConversationTurnContextSignal) {
    if (this.contextSignals.length > 0 &&
        this.contextSignals[this.contextSignals.length - 1]
                .conversationTurn.speechContent ===
            turnSignal.conversationTurn.speechContent) {
      // Ignore repeated contextual turns.
      // TODO(cais): Add unit tests.
      return;
    }
    // Also add the latest user entered text.
    this.contextSignals.push(turnSignal);
    // Sort context turns in asecnding order of timestamp.
    this.sortContextSignals();
    this.limitContextItemsCount();
    this.cleanUpAndSortFocusContextIds();
    this.cdr.detectChanges();
  }

  private sortContextSignals(): void {
    this.contextSignals.sort((turn0, turn1) => {
      // Hardcoded ones always go to the first.
      if (turn0.conversationTurn!.isHardcoded &&
          !turn1.conversationTurn!.isHardcoded) {
        return -1;
      } else if (
          !turn0.conversationTurn!.isHardcoded &&
          turn1.conversationTurn!.isHardcoded) {
        return 1;
      } else {
        // TODO(cais): What if startTimestamp is unavailable?
        return new Date(turn0.timestamp).getTime() -
            new Date(turn1.timestamp).getTime();
      }
    });
  }

  private limitContextItemsCount() {
    this.sortContextSignals();
    if (this.contextSignals.length >
        ContextComponent.MAX_DISPLAYED_CONTEXT_COUNT) {
      const numExtras = this.contextSignals.length -
          ContextComponent.MAX_DISPLAYED_CONTEXT_COUNT;
      this.contextSignals.splice(0, numExtras);
    }
    if (this.allContextSignals.length >
        ContextComponent.MAX_USED_CONTEXT_COUNT_DURING_STUDY) {
      const numExtras = this.allContextSignals.length -
          ContextComponent.MAX_USED_CONTEXT_COUNT_DURING_STUDY;
      this.allContextSignals.splice(0, numExtras);
    }
  }

  private cleanUpAndSortFocusContextIds() {
    const existingContextIds =
        this.contextSignals.map(signal => signal.contextId!);
    for (let i = this.focusContextIds.length - 1; i >= 0; --i) {
      if (existingContextIds.indexOf(this.focusContextIds[i]) === -1) {
        this.focusContextIds.splice(i, 1);
      }
    }
    const contextIdsAndIndices: Array<[string, number]> = [];
    for (const contextId of this.focusContextIds) {
      contextIdsAndIndices.push(
          [contextId, existingContextIds.indexOf(contextId)]);
    }
    contextIdsAndIndices.sort((item0, item1) => {
      return item0[1] - item1[1];
    });
    this.focusContextIds.splice(0);
    this.focusContextIds.push(...contextIdsAndIndices.map(item => item[0]));
    // If still has room, add latest turn, if and only if it is self TTS.
    if (this.contextSignals.length > 0) {
      const latestSignal = this.contextSignals[this.contextSignals.length - 1];
      const latestContextId = latestSignal.contextId!;
      if (this.focusContextIds.indexOf(latestContextId) === -1 &&
          latestSignal.conversationTurn != null &&
          latestSignal.conversationTurn.isTts) {
        this.focusContextIds.push(latestContextId);
      }
      if (this.focusContextIds.length >
          ContextComponent.MAX_FOCUS_CONTEXT_SIGNALS) {
        this.focusContextIds.splice(
            0,
            this.focusContextIds.length -
                ContextComponent.MAX_FOCUS_CONTEXT_SIGNALS);
      } else if (this.focusContextIds.length === 0) {
        this.focusContextIds.push(
            this.contextSignals[this.contextSignals.length - 1].contextId);
      }
    }
  }

  // TODO(cais): Fix bug: Context from selected AE option is not included in
  // later AE.
  private emitContextStringsSelected() {
    this.contextStringsSelected.emit(
        this.contextSignals
            .filter(
                signal =>
                    this.focusContextIds.indexOf(signal.contextId!) !== -1)
            .map(signal => signal.conversationTurn!));
  }
}
