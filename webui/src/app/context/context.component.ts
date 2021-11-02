import {AfterViewInit, Component, EventEmitter, HostListener, Input, OnInit, Output} from '@angular/core';

import {ConversationTurn, SpeakFasterService} from '../speakfaster-service';

@Component({
  selector: 'app-context-component',
  templateUrl: './context.component.html',
  providers: [],
})
export class ContextComponent implements OnInit, AfterViewInit {
  // TODO(cais): Do not hardcode this user ID.
  private userId = 'cais';

  @Input() endpoint!: string;
  @Input() accessToken!: string;

  readonly conversationTurns: ConversationTurn[] = [];
  contextRetrievalError: string|null = null;

  @Output()
  contextTurnSelected: EventEmitter<ConversationTurn> = new EventEmitter();

  private focusTurnIndex: number = -1;

  constructor(private speakFasterService: SpeakFasterService) {}

  ngOnInit() {
    this.focusTurnIndex = this.conversationTurns.length - 1;
    this.contextTurnSelected.emit(this.conversationTurns[this.focusTurnIndex]);
  }

  ngAfterViewInit() {
    setTimeout(() => this.retrieveContext(), 50);
    // TODO(cais): Do not hardcode delay.
    // TODO(cais): Poll for context on a regular basis.
  }

  get focusIndex(): number {
    return this.focusTurnIndex;
  }

  onTurnClicked(event: Event, index: number) {
    this.focusTurnIndex = index;
    this.contextTurnSelected.emit(this.conversationTurns[index]);
  }

  // NOTE: document:keydown can prevent the default tab-switching
  // action of Alt + number keys.
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    // event.stopPropagation();
    if (event.ctrlKey && event.key.toLocaleLowerCase() == 'c') {
      // Ctrl C for polling context.
      this.retrieveContext();
      event.preventDefault();
      event.stopPropagation();
    } else if (!event.altKey) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const keyIndex = Number.parseInt(event.key) - 1;
    if (keyIndex >= 0 && keyIndex < this.conversationTurns.length) {
      this.focusTurnIndex = keyIndex;
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private populateConversationTurnWithDefault() {
    this.conversationTurns.splice(0);
    this.conversationTurns.push({
      startTimestamp: new Date().toISOString(),
      speechContent: "What's up",  // Default context.
    });
    this.conversationTurns.push({
      startTimestamp: new Date().toISOString(),
      speechContent: "What do you need",  // Default context.
    });
    this.focusTurnIndex = this.conversationTurns.length - 1;
    this.contextTurnSelected.emit(
      this.conversationTurns[this.conversationTurns.length - 1]);
  }

  private retrieveContext() {
    this.speakFasterService
        .retrieveContext(this.endpoint, this.accessToken, this.userId)
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
              this.conversationTurns.splice(0);  // Empty the array first.
              for (const contextSignal of data.contextSignals) {
                if (contextSignal.conversationTurn != null) {
                  const turn: ConversationTurn = {
                    ...contextSignal.conversationTurn,
                    startTimestamp: contextSignal.timestamp,
                  };
                  // TODO(cais): Deduplicate.
                  this.conversationTurns.push(turn);
                }
              }
              this.focusTurnIndex = this.conversationTurns.length - 1;
              this.contextTurnSelected.emit(
                  this.conversationTurns[this.conversationTurns.length - 1]);
              this.contextRetrievalError = null;
            },
            error => {
              this.conversationTurns.splice(0);  // Empty the array first.
              this.contextRetrievalError = error;
              this.populateConversationTurnWithDefault();
            });
  }
}
