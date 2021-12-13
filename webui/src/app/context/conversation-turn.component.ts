import {AfterViewInit, Component, ElementRef, Input, QueryList, ViewChild, ViewChildren} from '@angular/core';

import {updateButtonBoxForHtmlElements} from '../../utils/cefsharp';
import {getAgoString} from '../../utils/datetime-utils';
import {limitStringLength} from '../../utils/text-utils';
import {ConversationTurn} from '../speakfaster-service';

@Component({
  selector: 'app-conversation-turn-component',
  templateUrl: './conversation-turn.component.html',
  providers: [],
})
export class ConversationTurnComponent implements AfterViewInit {
  private static readonly _NAME = 'ConversationTurnComponent';

  private static readonly CONTENT_STRING_MAX_LENGTH = 50;
  private static readonly BASE_FONT_SIZE_PX = 24;
  private static readonly FONT_SCALING_LENGTH_THRESHOLD = 45;

  @Input() turn!: ConversationTurn;
  @Input() isFocus: boolean = false;
  @ViewChildren('button') buttons!: QueryList<ElementRef<HTMLButtonElement>>;
  @ViewChild('turnContent') turnContentElement!: ElementRef;

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

  ngAfterViewInit() {
    const contentElement: HTMLDivElement =
        this.turnContentElement.nativeElement;
    let fontSizePx = ConversationTurnComponent.BASE_FONT_SIZE_PX;
    if (this.turn.speechContent.length >
        ConversationTurnComponent.FONT_SCALING_LENGTH_THRESHOLD) {
      fontSizePx /= Math.pow(
          (this.turn.speechContent.length /
           ConversationTurnComponent.FONT_SCALING_LENGTH_THRESHOLD),
          0.45);
    }
    contentElement.style.fontSize = `${fontSizePx.toFixed(1)}px`;
    setTimeout(() => {
      console.log('Calling updateButtonBoxForHtmlElements()');  // DEBUG
      // TODO(cais): Address the issue of multiple instances.
      updateButtonBoxForHtmlElements(
          ConversationTurnComponent._NAME, this.buttons);
    }, 20);
  }

  // Returns left, top, right, bottom.
  // getBox(): [number, number, number, number] {
  //   // console.log('button viewButton:', this.viewButton)
  //   const rect = this.viewButton.nativeElement.getBoundingClientRect();
  //   return [rect.left, rect.top, rect.right, rect.bottom];
  // }
}
