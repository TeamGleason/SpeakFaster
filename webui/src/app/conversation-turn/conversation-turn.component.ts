import {AfterViewInit, Component, ElementRef, Input, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {createUuid} from 'src/utils/uuid';

import {updateButtonBoxesForElements} from '../../utils/cefsharp';
import {limitStringLength} from '../../utils/text-utils';
import {ConversationTurn} from '../types/conversation';

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

  private readonly instanceId = createUuid();
  @Input() turn!: ConversationTurn;
  @ViewChildren('button') buttons!: QueryList<ElementRef<HTMLButtonElement>>;
  @ViewChild('turnContent') turnContentElement!: ElementRef;

  constructor() {}

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
    updateButtonBoxesForElements(
        ConversationTurnComponent._NAME + this.instanceId, this.buttons);
  }
}
