/** Quick phrase list for direct selection. */
import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, QueryList, SimpleChanges, ViewChild, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {injectKeys, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {allItemsEqual} from 'src/utils/text-utils';
import {createUuid} from 'src/utils/uuid';

import {AppComponent} from '../app.component';
import {VIRTUAL_KEY} from '../external/external-events.component';
import {PhraseComponent} from '../phrase/phrase.component';
import {SpeakFasterService, TextPredictionResponse} from '../speakfaster-service';
import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

export enum State {
  RETRIEVING_PHRASES = 'RETRIEVING_PHRASES',
  RETRIEVED_PHRASES = 'RETRIEVED_PHRASES',
  ERROR = 'ERROR',
}

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
  state = State.RETRIEVING_PHRASES;

  // Tags used for filtering the quick phrases (contextual phrases) during
  // server call.
  // TODO(cais): Connect with user_id logic from URL parameters.
  @Input() userId: string = 'testuser';
  @Input() allowedTags: string[] = [];
  @Input() textEntryBeginSubject!: Subject<TextEntryBeginEvent>;
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input() color: string = 'gray';
  readonly phrases: string[] = [];
  errorMessage: string|null = null;

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('phraseOption') phraseOptions!: QueryList<PhraseComponent>;
  @ViewChild('quickPhrasesContainer')
  quickPhrasesContainer!: ElementRef<HTMLDivElement>;

  constructor(
      public speakFasterService: SpeakFasterService,
      private cdr: ChangeDetectorRef) {}

  private retrievePhrases(): void {
    // Using empty text prefix and empty conversation turns means retrieving
    // contextual phrases ("quick phrases").
    this.speakFasterService
        .textPrediction({
          contextTurns: [],
          textPrefix: '',
          timestamp: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          allowedTags: this.allowedTags,
        })
        .subscribe(
            (data: TextPredictionResponse) => {
              this.state = State.RETRIEVED_PHRASES;
              this.phrases.splice(0);
              if (data.contextualPhrases) {
                this.phrases.push(...data.contextualPhrases.map(
                    phrase => phrase.text.trim()));
              }
              this.errorMessage = null;
              setTimeout(
                  () => this.updatePhraseButtonBoxesWithContainerRect(), 0);
              this.cdr.detectChanges();
            },
            error => {
              this.errorMessage = `Failed to get quick phrases for tags ${
                  this.allowedTags.join(',')}`;
              this.state = State.ERROR;
              setTimeout(
                  () => this.updatePhraseButtonBoxesWithContainerRect(), 0);
              this.cdr.detectChanges();
            });
  }

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
    AppComponent.registerAppResizeCallback(this.appResizeCallback.bind(this));
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes.allowedTags) {
      return;
    }
    if (changes.allowedTags.previousValue &&
        allItemsEqual(
            changes.allowedTags.previousValue,
            changes.allowedTags.currentValue)) {
      return;
    }
    this.retrievePhrases();
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
        event.phraseIndex, /* toInjectKeys= */ false,
        /* toTriggerInAppTextToSpeech= */ true);
  }

  checkPhraseOverflow(): boolean {
    if (!this.quickPhrasesContainer || this.state !== State.RETRIEVED_PHRASES) {
      return false;
    }
    const phrasesContainer = this.quickPhrasesContainer.nativeElement;
    return phrasesContainer.scrollHeight > phrasesContainer.clientHeight;
  }

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
}
