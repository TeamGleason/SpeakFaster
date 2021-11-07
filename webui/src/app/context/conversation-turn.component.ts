import {Component, ElementRef, Input, ViewChild} from '@angular/core';

import {getAgoString} from '../../utils/datetime-utils';
import {ConversationTurn} from '../speakfaster-service';

@Component({
  selector: 'app-conversation-turn-component',
  templateUrl: './conversation-turn.component.html',
  providers: [],
})
export class ConversationTurnComponent {
  private static readonly _NAME = "ConversationTurnComponent";

  @Input() turn!: ConversationTurn;
  @Input() isFocus: boolean = false;
  @ViewChild("button") viewButton!: ElementRef;

  constructor() {}

  get agoString(): string {
    return getAgoString(new Date(this.turn.startTimestamp!), new Date());
  }

  // Returns left, top, right, bottom.
  getBox(): [number, number, number, number] {
    // console.log('button viewButton:', this.viewButton)
    const rect = this.viewButton.nativeElement.getBoundingClientRect();
    return [rect.left, rect.top, rect.right, rect.bottom];
  }
}
