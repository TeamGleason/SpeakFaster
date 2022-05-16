/** Component that displays the contextual signals relevant for text entry. */

import {AfterViewInit, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject, Subscription, timer} from 'rxjs';
import {createUuid} from 'src/utils/uuid';

import {ConversationTurnComponent} from '../conversation-turn/conversation-turn.component';
import {getPhraseStats, HttpEventLogger} from '../event-logger/event-logger-impl';
import {SpeakFasterService} from '../speakfaster-service';
import {isCommand, StudyManager} from '../study/study-manager';
import {ConversationTurnContextSignal, getConversationTurnContextSignal} from '../types/context';
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
  // TODO(cais): Do not hardcode this user ID.
  private static readonly MAX_DISPLAYED_CONTEXT_COUNT = 3;
  private static readonly MAX_FOCUS_CONTEXT_SIGNALS = 3;

  @Input() userId!: string;
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input() isDev: boolean = false;

  private static readonly CONTEXT_POLLING_INTERVAL_MILLIS = 3 * 1000;
  private contextRetrievalTimerSubscription: Subscription|null = null;
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
        console.log(
            '*** Calling incrementTurn() with ', textInjection.text);  // DEBUG
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
    this.contextSignals.push(addedContextSignal);
    this.focusContextIds.splice(0);
    this.focusContextIds.push(addedContextSignal.contextId!);
    this.limitContextItemsCount();
    this.emitContextStringsSelected();
  }

  // NOTE: document:keydown can prevent the default tab-switching
  // action of Alt + number keys.
  handleKeyboardEvent(event: KeyboardEvent): boolean {
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

  private async getLastContextTurn(minTimestamp: number): Promise<string|null> {
    return new Promise((resolve, reject) => {
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
                if (data.contextSignals == null ||
                    data.contextSignals.length === 0) {
                  return;
                }
                for (let i = data.contextSignals.length - 1; i >= 0; --i) {
                  const contextSignal = data.contextSignals[i];
                  if ((contextSignal as ConversationTurnContextSignal)
                              .conversationTurn == null ||
                      contextSignal.timestamp === undefined) {
                    continue;
                  }
                  const timestamp = new Date(contextSignal.timestamp).getTime();
                  const speechContent =
                      (contextSignal as ConversationTurnContextSignal)
                          .conversationTurn.speechContent;
                  if (timestamp > minTimestamp) {
                    resolve(speechContent);
                    return;
                  }
                  console.log(
                      '*** timestamp:', timestamp, speechContent);  // DEBUG
                  console.log('*** minTimestamp:', minTimestamp);   // DEBUG
                }
                resolve(null);
              },
              error => {
                reject(error);
              });
    });
    // error => {
    //   this.cleanUpContextSignals();
    //   this.contextRetrievalError = 'Context retrieval error';
    //   // this.populateConversationTurnWithDefault();
    // }
    // }  // TODO(cais): Clean up.
  }

  private retrieveContext() {
    if (this.studyManager.isDialogOngoing()) {
      this.contextSignals.splice(0);
      for (const {text, partnerId, timestamp} of this.studyManager
               .getPreviousDialogTurns()!) {
        if (isCommand(text)) {
          continue;
        }
        this.contextSignals.push({
          contextType: 'ConversationTurn',
          conversationTurn: {
            speakerId: partnerId,
            speechContent: text,
            startTimestamp: timestamp,
          },
          userId: this.userId,
          contextId: createUuid(),
          timestamp,
        });
      }
      this.limitContextItemsCount();
      this.focusContextIds.splice(0);
      this.focusContextIds.push(
          ...this.contextSignals.map(signal => signal.contextId));
      this.contextStringsSelected.next(
          this.contextSignals.map(signal => signal.conversationTurn));
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
                console.log('*** B100');  // DEBUG
                if (data.contextSignals == null ||
                    data.contextSignals.length === 0) {
                  return;
                }
                for (let i = data.contextSignals.length - 1; i >= 0; --i) {
                  const contextSignal = data.contextSignals[i];
                  if ((contextSignal as ConversationTurnContextSignal)
                              .conversationTurn == null ||
                      contextSignal.timestamp === undefined) {
                    continue;
                  }
                  const timestamp = new Date(contextSignal.timestamp).getTime();
                  const speechContent =
                      (contextSignal as ConversationTurnContextSignal)
                          .conversationTurn.speechContent;
                  if (timestamp >
                      this.studyManager.waitingForPartnerTurnAfter) {
                    console.log(
                        '*** Got manual partner turn:', speechContent,
                        timestamp,
                        this.studyManager.waitingForPartnerTurnAfter);  // DEBUG
                    this.studyManager.incrementTurn(speechContent);
                    // TODO(cais): Add unit test.
                    return;
                  }
                }
              } else {
                if (data.contextSignals == null ||
                    data.contextSignals.length === 0) {
                  this.populateConversationTurnWithDefault();
                  this.contextStringsUpdated.next([]);
                  return;
                }
                this.cleanUpContextSignals();
                let isHandledAsCommand = false;
                for (let i = data.contextSignals.length - 1; i >= 0; --i) {
                  const contextSignal = data.contextSignals[i];
                  if ((contextSignal as ConversationTurnContextSignal)
                              .conversationTurn == null ||
                      contextSignal.timestamp === undefined) {
                    continue;
                  }
                  const timestamp = new Date(contextSignal.timestamp).getTime();
                  if (this.handledCommandTimestamps.indexOf(timestamp) !== -1) {
                    continue;
                  }
                  const speechContent =
                      (contextSignal as ConversationTurnContextSignal)
                          .conversationTurn.speechContent;
                  isHandledAsCommand =
                      await this.studyManager.maybeHandleRemoteControlCommand(
                          speechContent);
                  if (isHandledAsCommand) {
                    this.handledCommandTimestamps.push(timestamp);
                    break;
                  }
                }
                for (let contextSignal of (
                         isHandledAsCommand ? [] : data.contextSignals)) {
                  // TOOD(cais): Fix typing.
                  if ((contextSignal as ConversationTurnContextSignal)
                              .conversationTurn == null ||
                      contextSignal.timestamp === undefined) {
                    continue;
                  }
                  if (this.contextSignals.find(
                          signal =>
                              contextSignal.contextId === signal.contextId)) {
                    // Avoid adding duplicate context signals.
                    continue;
                  }
                  const speechContent =
                      (contextSignal as ConversationTurnContextSignal)
                          .conversationTurn.speechContent;
                  if (isHandledAsCommand) {
                    continue;
                  }
                  this.contextSignals.push(
                      (contextSignal as ConversationTurnContextSignal));
                  this.eventLogger.logIncomingContextualTurn(
                      getPhraseStats(speechContent));
                }
                this.limitContextItemsCount();
                this.cleanUpAndSortFocusContextIds();
                if (this.focusContextIds.length === 0 &&
                    this.contextSignals.length > 0) {
                  this.focusContextIds.push(
                      this.contextSignals[this.contextSignals.length - 1]
                          .contextId!);
                  this.cleanUpAndSortFocusContextIds();
                }
                this.emitContextStringsSelected();
                this.contextRetrievalError = null;
                this.contextStringsUpdated.next(
                    this.contextSignals.map(signal => signal.conversationTurn));
              }
            },
            error => {
              this.cleanUpContextSignals();
              this.contextRetrievalError = 'Context retrieval error';
              // this.populateConversationTurnWithDefault();
            });
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
