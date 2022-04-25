/** Component that displays the contextual signals relevant for text entry. */

import {AfterViewInit, ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject, Subscription, timer} from 'rxjs';

import {ConversationTurnComponent} from '../conversation-turn/conversation-turn.component';
import {getPhraseStats, HttpEventLogger} from '../event-logger/event-logger-impl';
import {SpeakFasterService} from '../speakfaster-service';
import {ConversationTurnContextSignal, getConversationTurnContextSignal} from '../types/context';
import {ConversationTurn} from '../types/conversation';
import {TextEntryEndEvent} from '../types/text-entry';

import {DEFAULT_CONTEXT_SIGNALS} from './default-context';
import {maybeHandleRemoteControlCommands} from './remote-control';

@Component({
  selector: 'app-context-component',
  templateUrl: './context.component.html',
  providers: [],
})
export class ContextComponent implements OnInit, AfterViewInit {
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

  constructor(
      private speakFasterService: SpeakFasterService,
      private eventLogger: HttpEventLogger, private cdr: ChangeDetectorRef) {}

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
    });
  }

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

  private retrieveContext() {
    this.speakFasterService.retrieveContext(this.userId)
        .subscribe(
            data => {
              if (data.errorMessage != null) {
                if (data.result !== 'ERROR_INVALID_USER_ID') {
                  this.contextRetrievalError = 'Context retrieval error';
                }
                this.populateConversationTurnWithDefault();
                return;
              }
              if (data.contextSignals == null ||
                  data.contextSignals.length === 0) {
                this.populateConversationTurnWithDefault();
                this.contextStringsUpdated.next([]);
                return;
              }
              this.cleanUpContextSignals();
              for (let contextSignal of data.contextSignals) {
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
                this.contextSignals.push(
                    (contextSignal as ConversationTurnContextSignal));
                const speechContent =
                    (contextSignal as ConversationTurnContextSignal)
                        .conversationTurn.speechContent;
                this.eventLogger.logIncomingContextualTurn(
                    getPhraseStats(speechContent));
                maybeHandleRemoteControlCommands(speechContent);
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
