/** A phrase option for user selection. */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, QueryList, ViewChildren} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

@Component({
  selector: 'app-phrase-component',
  templateUrl: './phrase.component.html',
})
export class PhraseComponent implements AfterViewInit, OnDestroy {
  private static readonly _NAME = 'PhraseComponent';

  private readonly instanceId = PhraseComponent._NAME + '_' + createUuid();
  @Input() color: string = '#093F3A';
  @Input() phraseText!: string;
  @Input() phraseIndex!: number;
  @Input() showFavoriteButton: boolean = false;
  @Output()
  speakButtonClicked: EventEmitter<{phraseText: string, phraseIndex: number}> =
      new EventEmitter();
  @Output()
  injectButtonClicked: EventEmitter<{phraseText: string, phraseIndex: number}> =
      new EventEmitter();
  @Output()
  favoriteButtonClicked:
      EventEmitter<{phraseText: string, phraseIndex: number}> =
          new EventEmitter();

  public updateButtonBoxesWithContainerRect(containerRect: DOMRect) {
    updateButtonBoxesForElements(
        this.instanceId, this.clickableButtons, containerRect);
  }

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onSpeakButtonClicked(event: Event) {
    this.speakButtonClicked.emit(
        {phraseText: this.phraseText, phraseIndex: this.phraseIndex});
  }

  onInjectButtonClicked(event: Event) {
    this.injectButtonClicked.emit(
        {phraseText: this.phraseText, phraseIndex: this.phraseIndex});
  }

  onFavoriteButtonClicked(event: Event) {
    this.favoriteButtonClicked.emit(
        {phraseText: this.phraseText, phraseIndex: this.phraseIndex});
  }
}
