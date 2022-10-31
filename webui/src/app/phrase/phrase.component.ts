/** A phrase option for user selection. */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, QueryList, SimpleChanges, ViewChild, ViewChildren} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {SpeakFasterService} from '../speakfaster-service';

export enum State {
  READY = 'READY',
  CONFIRMING_DELETION = 'CONFIRMING_DELETION',
}

@Component({
  selector: 'app-phrase-component',
  templateUrl: './phrase.component.html',
})
export class PhraseComponent implements AfterViewInit, OnDestroy, OnChanges {
  private static readonly _NAME = 'PhraseComponent';

  private readonly instanceId = PhraseComponent._NAME + '_' + createUuid();
  private static readonly BASE_FONT_SIZE_PX_SMALL = 22;
  private static readonly BASE_FONT_SIZE_PX_LARGE = 28;
  private static readonly FONT_SCALING_LENGTH_THRESHOLD = 32;
  private static readonly MIN_FONT_SIZE_PX_SMALL = 16;
  private static readonly MIN_FONT_SIZE_PX_LARGE = 20;
  @Input() userId!: string;
  @Input() phraseText!: string;
  @Input() phraseDisplayText?: string;
  @Input() phraseIndex!: number;
  @Input() phraseId?: string;
  @Input() tags?: string[];
  @Input() color: string = '#093F3A';
  @Input() showInjectButton: boolean = true;
  @Input() showFavoriteButton: boolean = false;
  @Input() showExpandButton: boolean = false;
  @Input() scaleFontSize = false;
  @Input() isTextClickable: boolean = false;
  @Input() isEditing: boolean = false;
  @Input() hideSpeakButton: boolean = false;
  @Input() emphasizeSpeakButton: boolean = false;
  @Output()
  textClicked: EventEmitter<{phraseText: string, phraseIndex: number}> =
      new EventEmitter();
  @Output()
  speakButtonClicked: EventEmitter<{phraseText: string, phraseIndex: number}> =
      new EventEmitter();
  @Output()
  injectButtonClicked: EventEmitter<{phraseText: string, phraseIndex: number}> =
      new EventEmitter();
  @Output()
  expandButtonClicked: EventEmitter<{phraseText: string, phraseIndex: number}> =
      new EventEmitter();
  @Output()
  editButtonClicked: EventEmitter<{phraseId: string}> = new EventEmitter();

  @ViewChild('phrase') phraseElement!: ElementRef<HTMLDivElement>;
  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('clickableButton,phrase')
  clickableButtonsAndText!: QueryList<ElementRef<HTMLElement>>;

  constructor(private speakFasterService: SpeakFasterService) {}

  public updateButtonBoxesWithContainerRect(containerRect: DOMRect) {
    const clicakbleAreas = this.isTextClickable ? this.clickableButtonsAndText :
                                                  this.clickableButtons;
    updateButtonBoxesForElements(
        this.instanceId, clicakbleAreas, containerRect);
  }

  private updateButtonBoxesWithoutContainerRect() {
    // TODO(cais): Add unit test.
    const clickableAreas = this.isTextClickable ? this.clickableButtonsAndText :
                                                  this.clickableButtons;
    if (clickableAreas == null) {
      // This could happen if the component hasn't been properly initialized
      // yet.
      return;
    }
    updateButtonBoxesForElements(this.instanceId, clickableAreas);
  }

  ngAfterViewInit() {
    this.adjustFontSize();
    const clickableAreas = this.isTextClickable ? this.clickableButtonsAndText :
                                                  this.clickableButtons;
    updateButtonBoxesForElements(this.instanceId, clickableAreas);
    clickableAreas.changes.subscribe((queryList: QueryList<ElementRef>) => {
      updateButtonBoxesForElements(this.instanceId, queryList);
    });
  }

  private adjustFontSize() {
    let fontSizePx = this.baseFontSizePx;
    const displayTextLength = this.getDisplayedText().length;
    if (this.scaleFontSize) {
      if (displayTextLength > PhraseComponent.FONT_SCALING_LENGTH_THRESHOLD) {
        fontSizePx /= Math.pow(
            (displayTextLength / PhraseComponent.FONT_SCALING_LENGTH_THRESHOLD),
            1.1);
      }
      if (fontSizePx < this.minFontSizePx) {
        fontSizePx = this.minFontSizePx;
      }
      this.phraseElement.nativeElement.style.fontSize =
          `${fontSizePx.toFixed(1)}px`;
      const lineHeightPx = fontSizePx + 2;
      this.phraseElement.nativeElement.style.lineHeight =
          `${lineHeightPx.toFixed(1)}px`;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes == null || changes.hideSpeakButton == null) {
      return;
    }
    this.updateButtonBoxesWithoutContainerRect();
  }

  private get baseFontSizePx() {
    return (!this.showInjectButton && !this.showFavoriteButton) ?
        PhraseComponent.BASE_FONT_SIZE_PX_LARGE :
        PhraseComponent.BASE_FONT_SIZE_PX_SMALL;
  }

  private get minFontSizePx() {
    return (!this.showInjectButton && !this.showFavoriteButton) ?
        PhraseComponent.MIN_FONT_SIZE_PX_LARGE :
        PhraseComponent.MIN_FONT_SIZE_PX_SMALL;
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  getDisplayedText(): string {
    // TODO(cais): Show different color fonts depending on whether this is
    // displayText or text.
    return this.phraseDisplayText || this.phraseText;
  }

  get isDisplayTextAvailable(): boolean {
    // TODO(cais): Add unit test.
    return Boolean(this.phraseDisplayText);
  }

  onTextClicked(event: Event) {
    if (!this.isTextClickable) {
      return;
    }
    event.stopPropagation();  // TODO(cais): Add unit test.
    this.textClicked.emit({
      phraseText: this.phraseText,
      phraseIndex: this.phraseIndex,
    });  // TODO(cais): Add unit test.
  }

  onSpeakButtonClicked(event: Event) {
    (event.target as HTMLButtonElement).blur();
    this.speakButtonClicked.emit(
        {phraseText: this.phraseText, phraseIndex: this.phraseIndex});
    this.markContextualPhraseUsage();
  }

  onInjectButtonClicked(event: Event) {
    (event.target as HTMLButtonElement).blur();
    this.injectButtonClicked.emit(
        {phraseText: this.phraseText, phraseIndex: this.phraseIndex});
    this.markContextualPhraseUsage();
  }

  onExpandButtonClicked(event: Event) {
    (event.target as HTMLButtonElement).blur();
    this.expandButtonClicked.emit(
        {phraseText: this.phraseText, phraseIndex: this.phraseIndex});
  }

  onEditButtonClicked(event: Event) {
    if (!this.phraseId) {
      return;
    }
    this.editButtonClicked.emit({phraseId: this.phraseId});
  }

  private markContextualPhraseUsage() {
    if (!this.phraseId) {
      return;
    }
    this.speakFasterService
        .markContextualPhraseUsage({
          userId: this.userId,
          phraseId: this.phraseId,
          lastUsedTimestamp: new Date().toISOString(),
        })
        .subscribe((data) => {});
  }
}
