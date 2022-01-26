import {AfterViewInit, Component, ElementRef, Input, OnDestroy, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {createUuid} from 'src/utils/uuid';

import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from '../../utils/cefsharp';
import {getAgoString} from '../../utils/datetime-utils';
import {limitStringLength} from '../../utils/text-utils';
import {ConversationTurn} from '../types/conversation';

@Component({
  selector: 'app-conversation-turn-component',
  templateUrl: './conversation-turn.component.html',
  providers: [],
})
export class ConversationTurnComponent implements AfterViewInit, OnDestroy {
  private static readonly _NAME = 'ConversationTurnComponent';
  private readonly instanceId =
      ConversationTurnComponent._NAME + '_' + createUuid();

  private static readonly CONTENT_STRING_MAX_LENGTH = 50;
  private static readonly BASE_FONT_SIZE_PX = 24;
  private static readonly FONT_SCALING_LENGTH_THRESHOLD = 45;

  @Input() turn!: ConversationTurn;
  @Input() isFocus: boolean = false;
  @ViewChildren('button') buttons!: QueryList<ElementRef<HTMLButtonElement>>;
  @ViewChild('turnContent') turnContentElement!: ElementRef;

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
    updateButtonBoxesForElements(this.instanceId, this.buttons);
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }
}
