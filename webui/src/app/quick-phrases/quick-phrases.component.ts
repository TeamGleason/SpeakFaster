/** Quick phrase list for direct selection. */
import {AfterContentChecked, AfterViewChecked, AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, QueryList, SimpleChanges, ViewChild, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {injectKeys, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {allItemsEqual} from 'src/utils/text-utils';
import {createUuid} from 'src/utils/uuid';

import {AppComponent} from '../app.component';
import {VIRTUAL_KEY} from '../external/external-events.component';
import {PhraseComponent} from '../phrase/phrase.component';
import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

@Component({
  selector: 'app-quick-phrases-component',
  templateUrl: './quick-phrases.component.html',
})
export class QuickPhrasesComponent implements AfterViewInit, OnChanges,
                                              OnDestroy {
  private static readonly _NAME = 'QuickPhrasesComponent';

  private readonly instanceId =
      QuickPhrasesComponent._NAME + '_' + createUuid();
  private readonly SCROLL_STEP = 75;

  @Input() textEntryBeginSubject!: Subject<TextEntryBeginEvent>;
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input() phrases: string[] = [];
  @Input() color: string = 'gray';

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('phraseOption') phraseOptions!: QueryList<PhraseComponent>;
  @ViewChild('quickPhrasesContainer')
  quickPhrasesContainer!: ElementRef<HTMLDivElement>;

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
    AppComponent.registerAppResizeCallback(this.appResizeCallback.bind(this));
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes.phrases) {
      return;
    }
    if (changes.phrases.previousValue && allItemsEqual(
            changes.phrases.previousValue, changes.phrases.currentValue)) {
      return;
    }
    setTimeout(() => this.updatePhraseButtonBoxesWithContainerRect(), 0);
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onInjectionOptionButtonClicked(event: {
    phraseText: string; phraseIndex: number
  }) {
    this.selectPhrase(
        event.phraseIndex, /* toInjectKeys= */ true,
        /* toTriggerInAppTextToSpeech= */ false);
  }

  onSpeakOptionButtonClicked(event: {phraseText: string, phraseIndex: number}) {
    this.selectPhrase(
        event.phraseIndex, /* toInjectKeys= */ true,
        /* toTriggerInAppTextToSpeech= */ true);
  }

  checkPhraseOverflow(): boolean {
    if (!this.quickPhrasesContainer) {
      return false;
    }
    const phrasesContainer = this.quickPhrasesContainer.nativeElement;
    return phrasesContainer.scrollHeight > phrasesContainer.clientHeight;
  }

  // TODO(cais): Register button boxes.
  onScrollButtonClicked(event: Event, direction: 'up'|'down') {
    const phrasesContainer = this.quickPhrasesContainer.nativeElement;
    if (direction === 'down') {
      const maxScrollY =
          phrasesContainer.scrollHeight - phrasesContainer.clientHeight;
      phrasesContainer.scrollTop =
          Math.min(maxScrollY, phrasesContainer.scrollTop + this.SCROLL_STEP);
    } else {
      const minScrollY = 0;
      phrasesContainer.scrollTop =
          Math.max(minScrollY, phrasesContainer.scrollTop - this.SCROLL_STEP);
    }
    this.updatePhraseButtonBoxesWithContainerRect();
  }

  /**
   * Force all children PhraseComponents to update their button boxes while
   * taking into account the view port and scroll state of the container div.
   */
  private updatePhraseButtonBoxesWithContainerRect(): void {
    if (!this.quickPhrasesContainer) {
      return;
    }
    const phrasesContainer = this.quickPhrasesContainer.nativeElement;
    const containerRect = phrasesContainer.getBoundingClientRect();
    this.phraseOptions.forEach(phraseOption => {
      phraseOption.updateButtonBoxesWithContainerRect(containerRect);
    });
  }

  isScrollButtonDisabled(direction: 'up'|'down'): boolean {
    const phrasesContainer = this.quickPhrasesContainer.nativeElement;
    if (direction === 'up') {
      return phrasesContainer.scrollTop <= 0;
    } else {
      return phrasesContainer.scrollTop >=
          phrasesContainer.scrollHeight - phrasesContainer.clientHeight;
    }
  }

  private selectPhrase(
      index: number, toInjectKeys: boolean,
      toTriggerInAppTextToSpeech: boolean = false) {
    let numKeypresses = 1;
    const phrase = this.phrases[index].trim();
    numKeypresses += phrase.length;
    this.textEntryBeginSubject.next({timestampMillis: Date.now()});
    this.textEntryEndSubject.next({
      text: phrase,
      // TODO(cais): Dehack or depend on dwell time.
      timestampMillis: Date.now() + 1000,
      isFinal: true,
      numKeypresses,
      numHumanKeypresses: 1,
      inAppTextToSpeechAudioConfig:
          toTriggerInAppTextToSpeech ? {volume_gain_db: 0} : undefined,
    });
    if (toInjectKeys) {
      const injectedKeys: Array<string|VIRTUAL_KEY> = [];
      // TODO(cais): Properly handle punctuation (if any).
      injectedKeys.push(...phrase.split(''));
      injectedKeys.push(VIRTUAL_KEY.SPACE);  // Append a space at the end.
      injectKeys(injectedKeys);
    }
  }

  private appResizeCallback() {
    if (this.clickableButtons.length > 0) {
      updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    }
  }

  // TODO(cais): Add unit tests.
}
