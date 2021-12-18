/** TODO(cais): Add doc string. */

import {AfterViewInit, Component, EventEmitter, Input, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject, timer} from 'rxjs';

import {createUuid} from '../..//utils/uuid';
import {KeyboardComponent} from '../keyboard/keyboard.component';
import {SpeakFasterService} from '../speakfaster-service';
import {ContextSignal, ConversationTurnContextSignal, getConversationTurnContextSignal} from '../types/context';
import {TextEntryEndEvent} from '../types/text-entry';

import {ConversationTurnComponent} from './conversation-turn.component';
import {DEFAULT_CONTEXT_SIGNALS} from './default-context';

@Component({
  selector: 'app-context-component',
  templateUrl: './context.component.html',
  providers: [],
})
export class ContextComponent implements OnInit, AfterViewInit {
  private static readonly _NAME = 'ContextComponent';
  // TODO(cais): Do not hardcode this user ID.
  private userId = 'cais';
  private static readonly MAX_DISPLAYED_CONTEXT_COUNT = 4;
  private static readonly MAX_FOCUS_CONTEXT_SIGNALS = 2;

  @Input() textInjectionSubject!: Subject<TextEntryEndEvent>;

  private static readonly CONTEXT_POLLING_INTERVAL_MILLIS = 2 * 1000;
  readonly contextSignals: ConversationTurnContextSignal[] = [];
  private readonly textInjectionContextSignals:
      ConversationTurnContextSignal[] = [];
  contextRetrievalError: string|null = null;

  @Output() contextStringsSelected: EventEmitter<string[]> = new EventEmitter();

  @ViewChildren('contextItem')
  viewButtons!: QueryList<ConversationTurnComponent>;

  private readonly focusContextIds: string[] = [];

  constructor(private speakFasterService: SpeakFasterService) {}

  ngOnInit() {
    KeyboardComponent.registerCallback(
        ContextComponent._NAME, this.handleKeyboardEvent.bind(this));
    this.focusContextIds.splice(0);
    this.textInjectionSubject.subscribe((textInjection: TextEntryEndEvent) => {
      if (!textInjection.isFinal) {
        return;
      }
      const timestamp = new Date(textInjection.timestampMillis);
      this.textInjectionContextSignals.push(getConversationTurnContextSignal(
          '',  // TODO(cais): Populate proper user ID.
          {
            speechContent: textInjection.text,
            startTimestamp: timestamp,
            isTts: true,
          }));
      // TODO(cais): Limit length of textInjections?
      this.retrieveContext();
    });
  }

  ngAfterViewInit() {
    timer(50, ContextComponent.CONTEXT_POLLING_INTERVAL_MILLIS)
        .subscribe(() => {
          this.retrieveContext();
        });
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
        getConversationTurnContextSignal(
            '',  // TODO(cais): Enter proper user id.
            {
              speechContent: text,
              startTimestamp: new Date(),
              isTts: false,
            });
    this.contextSignals.push(addedContextSignal);
    this.focusContextIds.splice(0);
    this.focusContextIds.push(addedContextSignal.contextId!);
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
    this.cleanUpContextSignals();
    this.contextSignals.push(...DEFAULT_CONTEXT_SIGNALS);
    this.appendTextInjectionToContext();
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
      if (!this.contextSignals[i].isManuallyAdded) {
        this.contextSignals.splice(i, 1);
      }
    }
  }

  private retrieveContext() {
    this.speakFasterService.retrieveContext(this.userId)
        .subscribe(
            data => {
              if (data.errorMessage != null) {
                this.contextRetrievalError = data.errorMessage;
                return;
              }
              if (data.contextSignals == null ||
                  data.contextSignals.length === 0) {
                this.populateConversationTurnWithDefault();
                return;
              }
              this.cleanUpContextSignals();
              for (const contextSignal of data.contextSignals) {
                if (contextSignal.contextType !== 'ConversationTurn' ||
                    contextSignal.timestamp === undefined) {
                  continue;
                }
                this.contextSignals.push(
                    contextSignal as ConversationTurnContextSignal);
              }
              this.appendTextInjectionToContext();
              this.limitContextItemsCount();
              this.cleanUpAndSortFocusContextIds();
              // TODO(cais): Discard obsolete context IDs.
              if (this.focusContextIds.length === 0 &&
                  this.contextSignals.length > 0) {
                this.focusContextIds.push(
                    this.contextSignals[this.contextSignals.length - 1]
                        .contextId!);
                this.cleanUpAndSortFocusContextIds();
              }
              this.emitContextStringsSelected();
              this.contextRetrievalError = null;
            },
            error => {
              this.cleanUpContextSignals();
              this.contextRetrievalError = JSON.stringify(error);
              this.populateConversationTurnWithDefault();
            });
  }

  private appendTextInjectionToContext() {
    // Also add the latest user entered text.
    this.contextSignals.push(...this.textInjectionContextSignals);
    // Sort context turns in asecnding order of timestamp.
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
        return new Date(turn0.conversationTurn!.startTimestamp!).getTime() -
            new Date(turn1.conversationTurn!.startTimestamp!).getTime();
      }
    });
    this.limitContextItemsCount();
    this.cleanUpAndSortFocusContextIds()
  }

  private limitContextItemsCount() {
    if (this.contextSignals.length >
        ContextComponent.MAX_DISPLAYED_CONTEXT_COUNT) {
      this.contextSignals.splice(
          0,
          this.contextSignals.length -
              ContextComponent.MAX_DISPLAYED_CONTEXT_COUNT);
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
    if (this.contextSignals.length > 1) {
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
      }
    }
  }


  private emitContextStringsSelected() {
    this.contextStringsSelected.emit(
        this.contextSignals
            .filter(
                signal =>
                    this.focusContextIds.indexOf(signal.contextId!) !== -1)
            .map(signal => signal.conversationTurn!.speechContent));
  }
}
