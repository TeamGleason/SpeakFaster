import {Component, Input} from '@angular/core';

import {ConversationTurn} from './context';

@Component({
  selector: 'app-conversation-turn-component',
  templateUrl: './conversation-turn.component.html',
  providers: [],
})
export class ConversationTurnComponent {
  @Input() turn!: ConversationTurn;

  constructor() {}
}
