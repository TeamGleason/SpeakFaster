import {Component, ElementRef, Input, ViewChild} from '@angular/core';

import {getAgoString} from '../../utils/datetime-utils';
import {limitStringLength} from '../../utils/text-utils';
import {ConversationTurn} from '../speakfaster-service';

@Component({
  selector: 'app-conversation-turn-component',
  templateUrl: './conversation-turn.component.html',
  providers: [],
})
export class ConversationTurnComponent {
  private static readonly _NAME = 'ConversationTurnComponent';

  private static readonly CONTENT_STRING_MAX_LENGTH = 50;

  @Input() turn!: ConversationTurn;
  @Input() isFocus: boolean = false;
  @ViewChild('button') viewButton!: ElementRef;

  constructor() {}

  get agoString(): string {
    return getAgoString(new Date(this.turn.startTimestamp!), new Date());
  }

  get contentString(): string {
    const length = this.turn.speechContent.length;
    if (length < ConversationTurnComponent.CONTENT_STRING_MAX_LENGTH) {
      return this.turn.speechContent;
    } else {
      return '...' +
          limitStringLength(
                 this.turn.speechContent,
                 ConversationTurnComponent.CONTENT_STRING_MAX_LENGTH);
    }
  }

  // Returns left, top, right, bottom.
  getBox(): [number, number, number, number] {
    // console.log('button viewButton:', this.viewButton)
    const rect = this.viewButton.nativeElement.getBoundingClientRect();
    return [rect.left, rect.top, rect.right, rect.bottom];
  }
}
