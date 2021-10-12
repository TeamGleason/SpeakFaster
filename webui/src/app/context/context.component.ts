import {Component, EventEmitter, HostListener, OnInit, Output} from '@angular/core';

import {secondsBeforeNow} from '../../utils/datetime-utils';

import {ConversationTurn} from './context';

@Component({
  selector: 'app-context-component',
  templateUrl: './context.component.html',
  providers: [],
})
export class ContextComponent implements OnInit {
  // TODO(cais): Do not hardcode this.
  conversationTurns: ConversationTurn[] = [
    {
      startTime: secondsBeforeNow(10),
      speaker: null,
      content: 'Hi Sean',
    },
    {
      startTime: secondsBeforeNow(5),
      speaker: 'Tim',
      content: 'Where is the dog'
    }
  ];

  @Output()
  contextTurnSelected: EventEmitter<ConversationTurn> = new EventEmitter();

  private focusTurnIndex: number = -1;

  constructor() {}

  ngOnInit() {
    this.focusTurnIndex = this.conversationTurns.length - 1;
    this.contextTurnSelected.emit(this.conversationTurns[this.focusTurnIndex]);
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
    if (!event.altKey) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const keyIndex = Number.parseInt(event.key) - 1;
    if (keyIndex >= 0 && keyIndex < this.conversationTurns.length) {
      this.focusTurnIndex = keyIndex;
      event.preventDefault();
    }
  }
}
