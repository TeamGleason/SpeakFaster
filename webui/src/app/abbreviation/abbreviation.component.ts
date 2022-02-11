import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnDestroy, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject, Subscription} from 'rxjs';
import {keySequenceEndsWith, limitStringLength} from 'src/utils/text-utils';
import {createUuid} from 'src/utils/uuid';

import {injectKeys, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from '../../utils/cefsharp';
import {RefinementResult, RefinementType} from '../abbreviation-refinement/abbreviation-refinement.component';
import {ExternalEventsComponent, KeypressListener, repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
import {InputBarChipsEvent} from '../input-bar/input-bar.component';
import {FillMaskRequest, FillMaskResponse, SpeakFasterService} from '../speakfaster-service';
import {AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {TextEntryEndEvent} from '../types/text-entry';

export enum State {
  PRE_CHOOSING_EXPANSION = 'PRE_CHOOSING_EXPANSION',
  REQUEST_ONGIONG = 'REQUEST_ONGOING',
  CHOOSING_EXPANSION = 'CHOOSING_EXPANSION',
  SPELLING = 'SPELLING',
  REFINING_EXPANSION = 'REFINING_EXPANSION',
}

// Abbreviation expansion can be triggered by entering the abbreviation followed
// by typing two consecutive spaces in the external app.
// TODO(#49): This can be generalized and made configurable.
// TODO(#49): Explore continuous AE without explicit trigger, perhaps
// added by heuristics for detecting abbreviations vs. words.
export const ABBRVIATION_EXPANSION_TRIGGER_COMBO_KEY: string[] =
    [VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE];

@Component({
  selector: 'app-abbreviation-component',
  templateUrl: './abbreviation.component.html',
  providers: [SpeakFasterService],
})
export class AbbreviationComponent implements OnDestroy, OnInit, AfterViewInit {
  private static readonly _NAME = 'AbbreviationComponent';
  private static readonly _POST_SELECTION_DELAY_MILLIS = 500;
  private static readonly _MAX_NUM_REPLACEMENT_TOKENS =
      6;  // TODO(cais): Make use.
  private readonly instanceId =
      AbbreviationComponent._NAME + '_' + createUuid();
  private keypressListener: KeypressListener = this.listenToKeypress.bind(this);
  @Input() contextStrings!: string[];
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input()
  abbreviationExpansionTriggers!: Subject<InputAbbreviationChangedEvent>;
  @Input() fillMaskTriggers!: Subject<FillMaskRequest>;
  @Input() inputBarChipsSubject!: Subject<InputBarChipsEvent>;

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  @ViewChildren('abbreviationOption')
  abbreviationOptionElements!: QueryList<ElementRef<HTMLElement>>;

  @ViewChildren('tokenInput')
  tokenInputElements!: QueryList<ElementRef<HTMLElement>>;

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
    ExternalEventsComponent.registerKeypressListener(this.keypressListener);
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
        // console.log('Calling ')
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

  ngOnDestroy() {
    ExternalEventsComponent.unregisterKeypressListener(this.keypressListener);
    if (this.abbreviationExpansionTriggersSubscription) {
      this.abbreviationExpansionTriggersSubscription.unsubscribe();
    }
    if (this.fillMaskRequestTriggersSubscription) {
      this.fillMaskRequestTriggersSubscription.unsubscribe();
    }
    updateButtonBoxesToEmpty(this.instanceId);
  }

  public listenToKeypress(keySequence: string[], reconstructedText: string):
      void {
    this.reconstructedText = reconstructedText;
    if (this.state === State.PRE_CHOOSING_EXPANSION) {
      if (keySequenceEndsWith(
              keySequence, ABBRVIATION_EXPANSION_TRIGGER_COMBO_KEY) &&
          reconstructedText.trim().length > 0) {
        let spaceIndex = reconstructedText.length - 1;
        while (reconstructedText[spaceIndex] === ' ' && spaceIndex >= 0) {
          spaceIndex--;
        }
        while (reconstructedText[spaceIndex] !== ' ' && spaceIndex >= 0) {
          spaceIndex--;
        }
        let text = reconstructedText.slice(spaceIndex + 1);
        let precedingText: string|undefined = spaceIndex > 0 ?
            reconstructedText.slice(0, spaceIndex).trim() :
            undefined;
        if (precedingText === '') {
          precedingText = undefined;
        }
        const eraserLength = text.length;
        text = text.trim();
        text = text.replace(/\n/g, '');
        if (text.length > 0) {
          // An abbreviation expansion has been triggered.
          // TODO(#49): Support keywords in abbreviation (e.g.,
          // "this event is going very well" --> "this e igvw")
          const abbreviationSpec: AbbreviationSpec = {
            tokens: text.split('').map(char => ({
                                         value: char,
                                         isKeyword: false,
                                       })),
            readableString: text,
            eraserSequence:
                repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, eraserLength),
            precedingText,
            lineageId: createUuid(),
          };
          console.log('Abbreviation expansion triggered:', abbreviationSpec);
          this.abbreviationExpansionTriggers.next(
              {abbreviationSpec, requestExpansion: true});
          return;
        }
      }
    } else if (this.state === State.CHOOSING_EXPANSION) {
      // TODO(cais): Add unit test.
      // TODO(cais): Guard against irrelevant keys.
      this.state = State.SPELLING;
    }
  }

  onTryAgainButtonClicked(event: Event) {
    this.expandAbbreviation();
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
        this.state == State.SPELLING) {
      this.selectExpansionOption(event.phraseIndex, /* toInjectKeys= */ true);
    }
  }

  onTextClicked(event: {phraseText: string; phraseIndex: number}) {
    this.inputBarChipsSubject.next(this.phraseToChips(event.phraseText));
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

  private phraseToChips(phraseText: string): InputBarChipsEvent {
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
    this.inputBarChipsSubject.next(this.phraseToChips(refinementResult.phrase));
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
      inAppTextToSpeechAudioConfig:
          toTriggerInAppTextToSpeech ? {volume_gain_db: 0} : undefined,
    });
    // TODO(cais): Prevent selection in gap state.
    setTimeout(
        () => this.resetState(),
        AbbreviationComponent._POST_SELECTION_DELAY_MILLIS);
  }

  private resetState() {
    this.abbreviation = null;
    this.responseError = null;
    if (this.abbreviationOptions.length > 0) {
      this.abbreviationOptions.splice(0);
    }
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
                this.abbreviationOptions.push(...data.exactMatches);
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
