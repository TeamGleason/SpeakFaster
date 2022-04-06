/** A phrase option for user selection. */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, QueryList, ViewChild, ViewChildren} from '@angular/core';
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
export class PhraseComponent implements AfterViewInit, OnDestroy {
  private static readonly _NAME = 'PhraseComponent';

  private readonly instanceId = PhraseComponent._NAME + '_' + createUuid();
  private static readonly BASE_FONT_SIZE_PX = 22;
  private static readonly FONT_SCALING_LENGTH_THRESHOLD = 32;
  private static readonly MIN_FONT_SIZE_PX = 16;
  @Input() userId!: string;
  @Input() phraseText!: string;
  @Input() phraseDisplayText?: string;
  @Input() phraseIndex!: number;
  @Input() phraseId?: string;
  @Input() tags?: string[];
  @Input() color: string = '#093F3A';
  @Input() showFavoriteButton: boolean = false;
  @Input() showExpandButton: boolean = false;
  @Input() scaleFontSize = false;
  @Input() isTextClickable: boolean = false;
  @Input() isEditing: boolean = false;
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

  ngAfterViewInit() {
    let fontSizePx = PhraseComponent.BASE_FONT_SIZE_PX;
    const displayTextLength = this.getDisplayedText().length;
    // TODO(cais): Add unit test.
    if (this.scaleFontSize &&
        displayTextLength > PhraseComponent.FONT_SCALING_LENGTH_THRESHOLD) {
      fontSizePx /= Math.pow(
          (displayTextLength / PhraseComponent.FONT_SCALING_LENGTH_THRESHOLD),
          1.1);
      if (fontSizePx < PhraseComponent.MIN_FONT_SIZE_PX) {
        fontSizePx = PhraseComponent.MIN_FONT_SIZE_PX;
      }
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

  getDisplayedText(): string {
    // TODO(cais): Show different color fonts depending on whether this is
    // displayText or text.
    return this.phraseDisplayText || this.phraseText;
  }

  getIsDisplayTextAvailable(): boolean {
    return Boolean(this.phraseDisplayText);
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
