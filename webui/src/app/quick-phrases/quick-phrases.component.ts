/** Quick phrase list for direct selection. */
import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, QueryList, SimpleChanges, ViewChild, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {injectKeys, injectTextAsKeys, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {AppComponent} from '../app.component';
import {getContextualPhraseStats, HttpEventLogger} from '../event-logger/event-logger-impl';
import {VIRTUAL_KEY} from '../external/external-events.component';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
import {PhraseComponent} from '../phrase/phrase.component';
import {SpeakFasterService, TextPredictionResponse} from '../speakfaster-service';
import {getQuickPhraseSubTag, setQuickPhrasesSubTag} from '../types/app-state';
import {ContextualPhrase} from '../types/contextual_phrase';
import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

export enum State {
  RETRIEVING_PHRASES = 'RETRIEVING_PHRASES',
  RETRIEVED_PHRASES = 'RETRIEVED_PHRASES',
  ERROR = 'ERROR',
  CHOOSING_PHRASE_TO_EDIT = 'CHOOSING_PHRASE_TO_EDIT',
  // Editing an existing phrase.
  EDITING_PHRASE = 'EDITING_PHRASE',
}

@Component({
  selector: 'app-quick-phrases-component',
  templateUrl: './quick-phrases.component.html',
})
export class QuickPhrasesComponent implements AfterViewInit, OnInit, OnChanges,
                                              OnDestroy {
  private static readonly _NAME = 'QuickPhrasesComponent';

  private readonly instanceId =
      QuickPhrasesComponent._NAME + '_' + createUuid();
  readonly SCROLL_STEP_PX = 225;
  state = State.RETRIEVING_PHRASES;

  // Tags used for filtering the quick phrases (contextual phrases) during
  // server call.
  @Input() userId!: string;
  @Input() allowedTag!: string;
  @Input() showDeleteButtons: boolean = false;
  @Input() showExpandButtons: boolean = false;
  @Input() textEntryBeginSubject!: Subject<TextEntryBeginEvent>;
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input() inputBarControlSubject?: Subject<InputBarControlEvent>;
  @Input() color: string = 'gray';
  @Input() filterPrefix: string = '';
  @Input() allowsEditing: boolean = true;
  // Optional limit on the number of phrases displayed at a time.
  // TODO(cais): Add unit test.
  @Input() maxNumPhrases: number|null = null;
  readonly phrases: ContextualPhrase[] = [];
  errorMessage: string|null = null;

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('phraseOption') phraseOptions!: QueryList<PhraseComponent>;
  @ViewChild('quickPhrasesContainer')
  quickPhrasesContainer!: ElementRef<HTMLDivElement>;

  // The ID of the phrase being editted. Applies only to the 'EDITING_PHRASE'
  // state.
  private _editedPhraseId: string|null = null;

  constructor(
      public speakFasterService: SpeakFasterService,
      private eventLogger: HttpEventLogger, private cdr: ChangeDetectorRef) {}

  private retrievePhrases(): void {
    // Using empty text prefix and empty conversation turns means retrieving
    // contextual phrases ("quick phrases").
    this.state = State.RETRIEVING_PHRASES;
    this.speakFasterService
        .textPrediction({
          userId: this.userId,
          contextTurns: [],
          textPrefix: '',
          timestamp: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          allowedTags: [this.effectiveAllowedTag],
        })
        .subscribe(
            (data: TextPredictionResponse) => {
              this.state = State.RETRIEVED_PHRASES;
              this.phrases.splice(0);
              if (data.contextualPhrases) {
                for (const phrase of data.contextualPhrases) {
                  if (this.phrases.some(
                          existingPhrase =>
                              existingPhrase.text.toLocaleLowerCase() ===
                              phrase.text.toLocaleLowerCase())) {
                    continue;
                  }
                  this.phrases.push(phrase);
                }
                this.phrases.sort(
                    (a: ContextualPhrase, b: ContextualPhrase) => {
                      // Sorting is done by tiers:
                      // 1. Last-usage timestamp or in the absence of it,
                      //    creation timestamp.
                      // 2. In case of a tie in the timestamp, sort by
                      //    lexicographical order.
                      const dateA: number = a.lastUsedTimestamp ?
                          new Date(a.lastUsedTimestamp).getTime() :
                          (a.createdTimestamp ?
                               new Date(a.createdTimestamp).getTime() :
                               0);
                      const dateB: number = b.lastUsedTimestamp ?
                          new Date(b.lastUsedTimestamp).getTime() :
                          (b.createdTimestamp ?
                               new Date(b.createdTimestamp).getTime() :
                               0);
                      if (dateA > dateB) {
                        return -1;
                      }
                      if (dateA < dateB) {
                        return 1;
                      }
                      const textA = a.text.trim().toLocaleLowerCase();
                      const textB = b.text.trim().toLocaleLowerCase();
                      if (textA > textB) {
                        return 1;
                      } else if (textA < textB) {
                        return -1;
                      } else {
                        return 0;
                      }
                    });
                if (this.maxNumPhrases !== null &&
                    this.phrases.length > this.maxNumPhrases) {
                  this.phrases.splice(this.maxNumPhrases);
                }
              }
              this.errorMessage = null;
              setTimeout(
                  () => this.updatePhraseButtonBoxesWithContainerRect(), 0);
              this.cdr.detectChanges();
            },
            error => {
              this.errorMessage =
                  `Failed to get quick phrases for tag: ${this.allowedTag}`;
              this.state = State.ERROR;
              setTimeout(
                  () => this.updatePhraseButtonBoxesWithContainerRect(), 0);
              this.cdr.detectChanges();
            });

    this.inputBarControlSubject?.next({
      contextualPhraseTags: [this.effectiveAllowedTag],
    })
  }

  get effectiveAllowedTag(): string {
    if (this.showExpandButtons) {
      const subTag = getQuickPhraseSubTag();
      return subTag === null ? this.allowedTag : this.allowedTag + ':' + subTag;
    } else {
      return this.allowedTag;
    }
  }

  ngOnInit() {
    this.inputBarControlSubject?.subscribe((event: InputBarControlEvent) => {
      if (event.refreshContextualPhrases) {
        this.retrievePhrases();
      }
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
    if (!changes.allowedTag && !changes.filterPrefix) {
      return;
    }
    if (changes.filterPrefix &&
        changes.filterPrefix.previousValue !==
            changes.filterPrefix.currentValue) {
      setTimeout(() => this.updatePhraseButtonBoxesWithContainerRect(), 0);
    }
    if (changes.allowedTag) {
      if (changes.allowedTag.previousValue &&
          changes.allowedTag.previousValue ===
              changes.allowedTag.currentValue) {
        return;
      }
      this.retrievePhrases();
    }
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onInjectionOptionButtonClicked(event: {
    phraseText: string; phraseIndex: number
  }) {
    if (this.inputBarControlSubject === undefined) {
      return;
    }
    // TODO(cais): Add unit test.
    this.inputBarControlSubject.next({
      appendText: event.phraseText,
    });
  }

  onSpeakOptionButtonClicked(event: {phraseText: string, phraseIndex: number}) {
    this.selectPhrase(
        event.phraseIndex, /* toInjectKeys= */ false,
        /* toTriggerInAppTextToSpeech= */ true);
  }

  onExpandButtonClicked(event: {phraseText: string, phraseIndex: number}) {
    setQuickPhrasesSubTag(event.phraseText.trim());
    this.filteredPhrases.splice(0);
    this.retrievePhrases();
    setTimeout(() => {
      updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    }, 10);
  }

  onScrollButtonClicked(event: {direction: 'up'|'down'}) {
    this.updatePhraseButtonBoxesWithContainerRect();
  }

  onCloseSubTagButtonClicked(event: Event) {
    setQuickPhrasesSubTag(null);
    this.filteredPhrases.splice(0);
    this.retrievePhrases();
  }

  onEditModeButtonClicked(event: Event) {
    if (this.state === State.EDITING_PHRASE) {
      if (this.inputBarControlSubject) {
        this.inputBarControlSubject.next({hide: false});
      }
      this.retrievePhrases();
    } else if (this.state === State.RETRIEVED_PHRASES) {
      this.state = State.CHOOSING_PHRASE_TO_EDIT;
    } else if (this.state === State.CHOOSING_PHRASE_TO_EDIT) {
      this.state = State.RETRIEVED_PHRASES;
    }
  }

  onPhraseEditButtonClicked(event: {phraseId: string}) {
    this.state = State.EDITING_PHRASE;
    this._editedPhraseId = event.phraseId;
    if (this.inputBarControlSubject) {
      this.inputBarControlSubject.next({hide: true});
    }
  }

  onPhraseSaved(event: {phraseId: string}) {
    this.retrievePhrases();
    if (this.inputBarControlSubject) {
      this.inputBarControlSubject.next({hide: false});
    }
  }

  get isChoosingPhraseToEdit(): boolean {
    return this.state === State.CHOOSING_PHRASE_TO_EDIT;
  }

  getEditButtonImageSrc(): string {
    if (this.state === State.CHOOSING_PHRASE_TO_EDIT) {
      return '/assets/images/edit_off.png';
    } else if (this.state === State.EDITING_PHRASE) {
      return '/assets/images/back.png';
    } else {
      return '/assets/images/edit.png';
    }
  }

  get filteredPhrases(): ContextualPhrase[] {
    if (!this.filterPrefix) {
      return this.phrases;
    }
    return this.phrases.filter(phrase => {
      return this.textMatchesFilter(phrase.text) ||
          (phrase.displayText && this.textMatchesFilter(phrase.displayText));
    });
  }

  private textMatchesFilter(text: string): boolean {
    const filter = this.filterPrefix.toLowerCase();
    return text.toLocaleLowerCase().indexOf(filter) !== -1;
  }

  get hasSubTag(): boolean {
    return this.showExpandButtons && getQuickPhraseSubTag() !== null;
  }

  get subTag(): string|null {
    return this.showExpandButtons ? getQuickPhraseSubTag() : null;
  }

  get editedPhrase(): ContextualPhrase|null {
    if (this._editedPhraseId === null) {
      return null;
    }
    return this.phrases.filter(
        (phrase) => phrase.phraseId === this._editedPhraseId)[0];
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

  private selectPhrase(
      index: number, toInjectKeys: boolean,
      toTriggerInAppTextToSpeech: boolean = false) {
    let numKeypresses = 1;
    const phrase = this.filteredPhrases[index].text.trim();
    numKeypresses += phrase.length;
    this.textEntryBeginSubject.next({timestampMillis: Date.now()});
    this.textEntryEndSubject.next({
      text: phrase,
      // TODO(cais): Dehack or depend on dwell time.
      timestampMillis: Date.now() + 1000,
      isFinal: true,
      numKeypresses,
      numHumanKeypresses: 1,
      inAppTextToSpeechAudioConfig: toTriggerInAppTextToSpeech ? {} : undefined,
    });
    if (toInjectKeys) {
      const injectedKeys: Array<string|VIRTUAL_KEY> = [];
      // TODO(cais): Properly handle punctuation (if any).
      injectedKeys.push(...phrase.split(''));
      injectedKeys.push(VIRTUAL_KEY.SPACE);  // Append a space at the end.
      injectTextAsKeys(phrase.trim());
    }
    this.eventLogger.logContextualPhraseSelection(
        getContextualPhraseStats(this.phrases[index]),
        toTriggerInAppTextToSpeech ? 'TTS' : 'INJECTION');
  }

  private appResizeCallback() {
    if (this.clickableButtons.length > 0) {
      updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    }
  }
}
