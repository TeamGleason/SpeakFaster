import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, Output, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {Subject, Subscription} from 'rxjs';
import {allItemsEqual, limitStringLength} from 'src/utils/text-utils';
import {createUuid} from 'src/utils/uuid';

import {injectKeys, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from '../../utils/cefsharp';
import {RefinementResult, RefinementType} from '../abbreviation-refinement/abbreviation-refinement.component';
import {VIRTUAL_KEY} from '../external/external-events.component';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
import {PersonalNamesComponent} from '../personal-names/personal-names.component';
import {FillMaskRequest, SpeakFasterService, TextPredictionResponse} from '../speakfaster-service';
import {AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {ContextualPhrase} from '../types/contextual_phrase';
import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

export enum State {
  PRE_CHOOSING_EXPANSION = 'PRE_CHOOSING_EXPANSION',
  REQUEST_ONGIONG = 'REQUEST_ONGOING',
  CHOOSING_EXPANSION = 'CHOOSING_EXPANSION',
  SPELLING = 'SPELLING',
  REFINING_EXPANSION = 'REFINING_EXPANSION',
  POST_CHOOSING_EXPANSION = 'POST_CHOOSING_EXPANSION',
}

@Component({
  selector: 'app-abbreviation-component',
  templateUrl: './abbreviation.component.html',
  providers: [SpeakFasterService],
})
export class AbbreviationComponent implements OnDestroy, OnInit, OnChanges,
                                              AfterViewInit {
  private static readonly _NAME = 'AbbreviationComponent';
  private static readonly CONTEXTUAL_PHRASES_TAGS: string[] = ['temporal'];

  private readonly instanceId =
      AbbreviationComponent._NAME + '_' + createUuid();
  @Input() userId!: string;
  @Input() contextStrings!: string[];
  @Input() textEntryBeginSubject!: Subject<TextEntryBeginEvent>;
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input()
  abbreviationExpansionTriggers!: Subject<InputAbbreviationChangedEvent>;
  @Input() fillMaskTriggers!: Subject<FillMaskRequest>;
  @Input() inputBarControlSubject!: Subject<InputBarControlEvent>;

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  @ViewChildren('abbreviationOption')
  abbreviationOptionElements!: QueryList<ElementRef<HTMLElement>>;

  @ViewChildren('tokenInput')
  tokenInputElements!: QueryList<ElementRef<HTMLElement>>;

  // Typing-free phrase predictions, which gets populated without AE.
  readonly textPredictions: string[] = [];

  reconstructedText: string = '';
  state = State.PRE_CHOOSING_EXPANSION;
  private pendingRefinementType: RefinementType = 'REPLACE_TOKEN';
  editedExpansionText: string|null = null;
  readonly editTokens: string[] = [];
  readonly replacementTokens: string[] = [];
  selectedTokenIndex: number|null = null;
  manualTokenString: string = '';
  fillMaskRequest: FillMaskRequest|null = null;

  abbreviation: AbbreviationSpec|null = null;
  responseError: string|null = null;
  abbreviationOptions: string[] = [];
  receivedEmptyOptions: boolean = false;
  private _selectedAbbreviationIndex: number = -1;
  private abbreviationExpansionTriggersSubscription?: Subscription;
  private fillMaskRequestTriggersSubscription?: Subscription;

  constructor(
      public speakFasterService: SpeakFasterService,
      private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.abbreviationExpansionTriggersSubscription =
        this.abbreviationExpansionTriggers.subscribe(
            (event: InputAbbreviationChangedEvent) => {
              if (!event.requestExpansion) {
                return;
              }
              this.abbreviation = event.abbreviationSpec;
              this.expandAbbreviation();
            });
    this.fillMaskRequestTriggersSubscription =
        this.fillMaskTriggers.subscribe((request: FillMaskRequest) => {
          this.fillMaskRequest = request;
          this.state = State.REFINING_EXPANSION;
          this.cdr.detectChanges();
        });
    this.textEntryEndSubject.subscribe(event => {
      if (event.isFinal) {
        this.resetState();  // TODO(cais): Add unit test.
      }
    });
  }

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnChanges(changes: SimpleChanges) {
    // TODO(cais): Add unit tests.
    if (!changes.contextStrings) {
      return;
    }
    if (changes.contextStrings.previousValue != null &&
        allItemsEqual(
            changes.contextStrings.previousValue,
            changes.contextStrings.currentValue)) {
      return;
    }
    if (!changes.contextStrings.currentValue ||
        !changes.contextStrings.currentValue[0]) {
      return;
    }
    this.speakFasterService
        .textPrediction({
          contextTurns: changes.contextStrings.currentValue,
          textPrefix: '',
          timestamp: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        })
        .subscribe((data: TextPredictionResponse) => {
          if (!data.outputs) {
            return;
          }
          this.textPredictions.splice(0);
          data.outputs.forEach(output => {
            const text = output.trim();
            if (!text || text.match(/^[\s,;\.\!\?\_]+$/) ||
                output.toLocaleLowerCase().indexOf('speaker') !== -1) {
              return;
            }
            this.textPredictions.push(output);
          });
          this.cdr.detectChanges();
        });
  }

  ngOnDestroy() {
    if (this.abbreviationExpansionTriggersSubscription) {
      this.abbreviationExpansionTriggersSubscription.unsubscribe();
    }
    if (this.fillMaskRequestTriggersSubscription) {
      this.fillMaskRequestTriggersSubscription.unsubscribe();
    }
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onTryAgainButtonClicked(event: Event) {
    this.expandAbbreviation();
  }

  onTextPredictionButtonClicked(event: Event, index: number) {
    // NOTE: blur() call prevents future space keys from inadvertently clicking
    // the button again.
    // TODO(cais): Add unit test.
    (event.target as HTMLButtonElement).blur();
    this.inputBarControlSubject.next({
      chips: [{
        text: this.textPredictions[index],
      }],
    });
  }

  get isInputAbbreviationEmpty() {
    return this.reconstructedText.trim().length === 0;
  }

  get selectedAbbreviationIndex() {
    return this._selectedAbbreviationIndex;
  }

  onExpansionOptionButtonClicked(event: {
    phraseText: string; phraseIndex: number
  }) {
    if (this.state === State.CHOOSING_EXPANSION ||
        this.state === State.SPELLING) {
      this.selectExpansionOption(event.phraseIndex, /* toInjectKeys= */ true);
    }
  }

  onTextClicked(event: {phraseText: string; phraseIndex: number}) {
    this.inputBarControlSubject.next(this.phraseToChips(event.phraseText));
  }

  onSpeakOptionButtonClicked(event: {phraseText: string, phraseIndex: number}) {
    if (this.state !== State.CHOOSING_EXPANSION &&
        this.state !== State.SPELLING) {
      return;
    }
    this.selectExpansionOption(
        event.phraseIndex, /* toInjectKeys= */ false,
        /* toTriggerInAppTextToSpeech= */ true);
  }

  onRepeatButtonClicked(event: Event) {
    this.state = State.CHOOSING_EXPANSION;
    this.cdr.detectChanges();
  }

  private phraseToChips(phraseText: string): InputBarControlEvent {
    const words: string[] =
        phraseText.trim().split(' ').filter(word => word.length > 0);
    return {
      chips: words.map(word => ({text: word})),
    };
  }

  private enterRefineState(text: string) {
    this.state = State.REFINING_EXPANSION;
    this.editedExpansionText = text;
    this.cdr.detectChanges();
  }

  onNewAbbreviationSpec(abbreviationSpec: AbbreviationSpec) {
    this.abbreviationExpansionTriggers.next(
        {abbreviationSpec, requestExpansion: true});
  }

  onRefinementResult(refinementResult: RefinementResult) {
    if (!refinementResult.isAbort) {
      this.abbreviationOptions.splice(0);
      this.abbreviationOptions.push(refinementResult.phrase);
    }
    this.inputBarControlSubject.next(
        this.phraseToChips(refinementResult.phrase));
    this.state = State.CHOOSING_EXPANSION;
  }

  private selectExpansionOption(
      index: number, toInjectKeys: boolean,
      toTriggerInAppTextToSpeech: boolean = false) {
    if (this._selectedAbbreviationIndex === index || !this.abbreviation) {
      return;
    }
    this._selectedAbbreviationIndex = index;
    let numKeypresses = 0;
    numKeypresses = this.abbreviation.readableString.length + 1;
    if (this.abbreviation.triggerKeys != null) {
      numKeypresses += this.abbreviation.triggerKeys.length;
    }
    const text = this.abbreviationOptions[this._selectedAbbreviationIndex];
    if (toInjectKeys) {
      const injectedKeys: Array<string|VIRTUAL_KEY> =
          this.abbreviation!.eraserSequence || [];
      injectedKeys.push(...text.split(''));
      injectedKeys.push(VIRTUAL_KEY.SPACE);  // Append a space at the end.
      injectKeys(injectedKeys);
    }
    this.textEntryEndSubject.next({
      text,
      timestampMillis: Date.now(),
      isFinal: true,
      numKeypresses,
      numHumanKeypresses: numKeypresses,
      inAppTextToSpeechAudioConfig: toTriggerInAppTextToSpeech ? {} : undefined,
    });
    this.state = State.POST_CHOOSING_EXPANSION;
  }

  private resetState() {
    this.responseError = null;
    this._selectedAbbreviationIndex = -1;
    this.editTokens.splice(0);
    this.replacementTokens.splice(0);
    this.manualTokenString = '';
    this.reconstructedText = '';
    this.state = State.PRE_CHOOSING_EXPANSION;
    this.cdr.detectChanges();
  }

  private expandAbbreviation() {
    if (this.abbreviation === null) {
      this.responseError = 'Cannot expand abbreviation: empty abbreviation';
      return;
    }
    this.abbreviationOptions = [];
    this.state = State.REQUEST_ONGIONG;
    this.responseError = null;
    this.receivedEmptyOptions = false;
    const usedContextStrings = this.usedContextStrings;
    const numSamples = this.getNumSamples(this.abbreviation);
    const usedContextString = usedContextStrings.join('|');
    console.log(
        `Calling expandAbbreviation() (numSamples=${numSamples}):` +
        `context='${usedContextString}'; ` +
        `abbreviation=${JSON.stringify(this.abbreviation)}`);
    this.speakFasterService
        .expandAbbreviation(
            usedContextString, this.abbreviation, numSamples,
            this.abbreviation.precedingText)
        .subscribe(
            data => {
              if (data.exactMatches != null) {
                data.exactMatches.forEach(exactMatch => {
                  const replaced =
                      PersonalNamesComponent.replacePersonNamesWithKnownValues(
                          exactMatch);
                  if (this.abbreviationOptions.indexOf(replaced) === -1) {
                    this.abbreviationOptions.push(replaced);
                  }
                });
                // this.abbreviationOptions.push(...data.exactMatches);
              }
              this.state = State.CHOOSING_EXPANSION;
              this.receivedEmptyOptions = this.abbreviationOptions.length === 0;
              this.cdr.detectChanges();
            },
            error => {
              this.state = State.CHOOSING_EXPANSION;
              this.receivedEmptyOptions = false;
              this.responseError = error.message;
              this.cdr.detectChanges();
            });
    this.cdr.detectChanges();
  }

  get phraseBackgroundColor(): string {
    return '#0687BE';
  }

  get usedContextStrings(): string[] {
    // TODO(#49): Limit by token length?
    const LIMIT_TURNS = 2;
    const LIMIT_CONTEXT_TURN_LENGTH = 60;
    const strings = [...this.contextStrings.map(
        contextString =>
            limitStringLength(contextString, LIMIT_CONTEXT_TURN_LENGTH))];
    if (strings.length > LIMIT_TURNS) {
      strings.splice(0, strings.length - LIMIT_TURNS);
    }
    return strings;
  }

  /** Heuristics about the num_samples to use when requesting AE from server. */
  private getNumSamples(abbreviationSpec: AbbreviationSpec|null) {
    if (abbreviationSpec === null) {
      return 128;
    }
    let maxAbbrevLength = 0;
    for (const token of abbreviationSpec.tokens) {
      if (!token.isKeyword && token.value.length > maxAbbrevLength) {
        maxAbbrevLength = token.value.length;
      }
    }
    return maxAbbrevLength > 5 ? 256 : 128;
  }

  get refinementType(): RefinementType {
    return this.pendingRefinementType;
  }

}
