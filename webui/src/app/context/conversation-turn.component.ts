import {Component, Input} from '@angular/core';

import {getAgoString} from '../../utils/datetime-utils';
import {ConversationTurn} from '../speakfaster-service';

@Component({
  selector: 'app-conversation-turn-component',
  templateUrl: './conversation-turn.component.html',
  providers: [],
})
export class ConversationTurnComponent {
  @Input() turn!: ConversationTurn;
  @Input() isFocus: boolean = false;
  private now = new Date();

  constructor() {}

  get agoString(): string {
    return getAgoString(new Date(this.turn.startTimestamp!), this.now);
  }
}
