/** A phrase option for user selection. */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

export enum State {
  READY = 'READY',
  CONFIRMING_DELETION = 'CONFIRMING_DELETION',
}

@Component({
  selector: 'app-phrase-component',
  templateUrl: './phrase.component.html',
})
export class PhraseComponent implements AfterViewInit, OnDestroy {
  private static readonly _NAME = 'PhraseComponent';

  private readonly instanceId = PhraseComponent._NAME + '_' + createUuid();
  private static readonly BASE_FONT_SIZE_PX = 22;
  private static readonly FONT_SCALING_LENGTH_THRESHOLD = 32;
  @Input() userId!: string;
  @Input() phraseId?: string;
  @Input() color: string = '#093F3A';
  @Input() showFavoriteButton: boolean = false;
  @Input() favoriteButtonPerformsDeletion: boolean = false;
  @Input() phraseText!: string;
  @Input() phraseIndex!: number;
  @Input() scaleFontSize = false;
  @Input() isTextClickable: boolean = false;
  @Output()
  textClicked: EventEmitter<{phraseText: string, phraseIndex: number}> =
      new EventEmitter();
  @Output()
  speakButtonClicked: EventEmitter<{phraseText: string, phraseIndex: number}> =
      new EventEmitter();
  @Output()
  injectButtonClicked: EventEmitter<{phraseText: string, phraseIndex: number}> =
      new EventEmitter();

  @ViewChild('phrase') phraseElement!: ElementRef<HTMLDivElement>;
  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('clickableButton,phrase')
  clickableButtonsAndText!: QueryList<ElementRef<HTMLElement>>;

  public updateButtonBoxesWithContainerRect(containerRect: DOMRect) {
    const clicakbleAreas = this.isTextClickable ? this.clickableButtonsAndText :
                                                  this.clickableButtons;
    updateButtonBoxesForElements(
        this.instanceId, clicakbleAreas, containerRect);
  }

  ngAfterViewInit() {
    let fontSizePx = PhraseComponent.BASE_FONT_SIZE_PX;
    if (this.scaleFontSize &&
        this.phraseText.length >
            PhraseComponent.FONT_SCALING_LENGTH_THRESHOLD) {
      fontSizePx /= Math.pow(
          (this.phraseText.length /
           PhraseComponent.FONT_SCALING_LENGTH_THRESHOLD),
          1.1);
      this.phraseElement.nativeElement.style.fontSize =
          `${fontSizePx.toFixed(1)}px`;
      const lineHeightPx = fontSizePx + 2;
      this.phraseElement.nativeElement.style.lineHeight =
          `${lineHeightPx.toFixed(1)}px`;
    }
    // TODO(cais): Add unit test.
    const clicakbleAreas = this.isTextClickable ? this.clickableButtonsAndText :
                                                  this.clickableButtons;
    updateButtonBoxesForElements(this.instanceId, clicakbleAreas);
    clicakbleAreas.changes.subscribe((queryList: QueryList<ElementRef>) => {
      updateButtonBoxesForElements(this.instanceId, queryList);
    });
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onTextClicked(event: Event) {
    if (!this.isTextClickable) {
      return;
    }
    this.textClicked.emit({
      phraseText: this.phraseText,
      phraseIndex: this.phraseIndex,
    });  // TODO(cais): Add unit test.
  }

  onSpeakButtonClicked(event: Event) {
    this.speakButtonClicked.emit(
        {phraseText: this.phraseText, phraseIndex: this.phraseIndex});
  }

  onInjectButtonClicked(event: Event) {
    this.injectButtonClicked.emit(
        {phraseText: this.phraseText, phraseIndex: this.phraseIndex});
  }

}
