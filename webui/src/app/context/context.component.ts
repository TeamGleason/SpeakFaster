/** Component that displays the contextual signals relevant for text entry. */

import {ChangeDetectorRef, Component, EventEmitter, Input, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';

import {ConversationTurnComponent} from '../conversation-turn/conversation-turn.component';
import {ConversationTurnContextSignal, getConversationTurnContextSignal} from '../types/context';
import {TextEntryEndEvent} from '../types/text-entry';

@Component({
  selector: 'app-context-component',
  templateUrl: './context.component.html',
  providers: [],
})
export class ContextComponent implements OnInit {
  private static readonly _NAME = 'ContextComponent';
  // TODO(cais): Do not hardcode this user ID.
  private userId = 'testuser';
  private static readonly MAX_DISPLAYED_CONTEXT_COUNT = 4;
  private static readonly MAX_FOCUS_CONTEXT_SIGNALS = 2;

  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;

  readonly contextSignals: ConversationTurnContextSignal[] = [];
  contextRetrievalError: string|null = null;

  @Output() contextStringsSelected: EventEmitter<string[]> = new EventEmitter();

  @ViewChildren('contextItem')
  viewButtons!: QueryList<ConversationTurnComponent>;

  private readonly focusContextIds: string[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.focusContextIds.splice(0);
    this.textEntryEndSubject.subscribe((textInjection: TextEntryEndEvent) => {
      if (!textInjection.isFinal) {
        return;
      }
      const timestamp = new Date(textInjection.timestampMillis);
      this.appendTextInjectionToContext(getConversationTurnContextSignal(
          '',  // TODO(cais): Populate proper user ID.
          {
            speakerId: this.userId,
            speechContent: textInjection.text,
            startTimestamp: timestamp,
            isTts: true,
            isHardcoded: false,
          }));
    });
  }

  // TODO(cais): Add retrieval of context signal from server.

  isContextInFocus(contextId: string): boolean {
    return this.focusContextIds.indexOf(contextId) !== -1;
  }

  private appendTextInjectionToContext(turnSignal:
                                           ConversationTurnContextSignal) {
    // Also add the latest user entered text.
    this.contextSignals.push(turnSignal);
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
    this.cleanUpAndSortFocusContextIds();
    this.cdr.detectChanges();
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
}
