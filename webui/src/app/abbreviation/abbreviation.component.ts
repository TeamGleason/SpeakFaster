import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, Output, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {Subject, Subscription} from 'rxjs';
import {allItemsEqual, limitStringLength} from 'src/utils/text-utils';
import {createUuid} from 'src/utils/uuid';

import {injectTextAsKeys, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from '../../utils/cefsharp';
import {RefinementResult, RefinementType} from '../abbreviation-refinement/abbreviation-refinement.component';
import {ContextComponent} from '../context/context.component';
import {getAbbreviationExpansionRequestStats, getAbbreviationExpansionResponseStats, getPhraseStats, HttpEventLogger} from '../event-logger/event-logger-impl';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
import {LexiconComponent} from '../lexicon/lexicon.component';
import {getAppSettings} from '../settings/settings';
import {FillMaskRequest, SpeakFasterService} from '../speakfaster-service';
import {StudyManager} from '../study/study-manager';
import {AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {ConversationTurn} from '../types/conversation';
import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

export enum State {
  PRE_CHOOSING_EXPANSION = 'PRE_CHOOSING_EXPANSION',
  REQUEST_ONGIONG = 'REQUEST_ONGOING',
  CHOOSING_EXPANSION = 'CHOOSING_EXPANSION',
  SPELLING = 'SPELLING',
  REFINING_EXPANSION = 'REFINING_EXPANSION',
  POST_CHOOSING_EXPANSION = 'POST_CHOOSING_EXPANSION',
}

const MAX_NUM_TEXT_PREDICTIONS = 4;

@Component({
  selector: 'app-abbreviation-component',
  templateUrl: './abbreviation.component.html',
})
export class AbbreviationComponent implements OnDestroy, OnInit, OnChanges,
                                              AfterViewInit {
  private static readonly _NAME = 'AbbreviationComponent';
  static readonly PHRASE_BG_COLOR_DEFAULT = '#057bad';
  static readonly PHRASE_BG_COLOR_HIGHLIGHTED = '#006400';

  private readonly instanceId =
      AbbreviationComponent._NAME + '_' + createUuid();
  @Input() userId!: string;
  @Input() conversationTurns!: ConversationTurn[];
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
  readonly abbreviationOptions: string[] = [];
  receivedEmptyOptions: boolean = false;
  private _selectedAbbreviationIndex: number = -1;
  private abbreviationExpansionTriggersSubscription?: Subscription;
  private fillMaskRequestTriggersSubscription?: Subscription;
  private testEntryEndSubscription?: Subscription;
  private highlightedPhraseIndex: number|null = null;

  constructor(
      public speakFasterService: SpeakFasterService,
      private studyManager: StudyManager, private eventLogger: HttpEventLogger,
      private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.abbreviationExpansionTriggersSubscription =
        this.abbreviationExpansionTriggers.subscribe(
            (event: InputAbbreviationChangedEvent) => {
              if (!event.requestExpansion) {
                return;
              }
              this.highlightedPhraseIndex = null;
              this.abbreviation = event.abbreviationSpec;
              this.expandAbbreviation();
            });
    this.fillMaskRequestTriggersSubscription =
        this.fillMaskTriggers.subscribe((request: FillMaskRequest) => {
          this.fillMaskRequest = request;
          this.state = State.REFINING_EXPANSION;
          this.cdr.detectChanges();
        });
    this.testEntryEndSubscription =
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
    if (!changes.conversationTurns) {
      return;
    }
    const currentTurnsSpeech =
        (changes.conversationTurns.currentValue as ConversationTurn[])
            .map(turn => turn.speechContent);
    if (changes.conversationTurns.previousValue != null) {
      const previousTurnsSpeech =
          (changes.conversationTurns.previousValue as ConversationTurn[])
              .map(turn => turn.speechContent);
      if (allItemsEqual(previousTurnsSpeech, currentTurnsSpeech)) {
        return;
      }
    }
    const conversationTurns =
        changes.conversationTurns.currentValue as ConversationTurn[];
    if (!conversationTurns || !conversationTurns[0]) {
      return;
    }
    // Find the last turn that is not from the user.

    let n = conversationTurns.length - 1;
    while (n >= 0) {
      if (conversationTurns[n].speakerId !== this.userId) {
        break;
      }
      n--;
    }
    const textPrefix: string = (n === conversationTurns.length - 1) ?
        '' :
        conversationTurns.slice(n + 1)
                .map(turn => turn.speechContent)
                .join('. ') +
            '. ';
  }

  ngOnDestroy() {
    if (this.abbreviationExpansionTriggersSubscription) {
      this.abbreviationExpansionTriggersSubscription.unsubscribe();
    }
    if (this.fillMaskRequestTriggersSubscription) {
      this.fillMaskRequestTriggersSubscription.unsubscribe();
    }
    if (this.testEntryEndSubscription) {
      this.testEntryEndSubscription.unsubscribe();
    }
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onTryAgainButtonClicked(event: Event) {
    this.expandAbbreviation();
  }

  get isStudyDialogOngoing() {
    return this.studyManager.getDialogId() !== null;
  }

  get isInputAbbreviationEmpty() {
    return this.reconstructedText.trim().length === 0;
  }

  get selectedAbbreviationIndex() {
    return this._selectedAbbreviationIndex;
  }

  onContainerClicked(event: Event) {
    // TODO(cais): Add unit test.
    this.inputBarControlSubject.next({refocus: true});
  }

  onExpansionOptionButtonClicked(event: {
    phraseText: string; phraseIndex: number
  }) {
    if (this.state === State.CHOOSING_EXPANSION ||
        this.state === State.SPELLING) {
      this.selectExpansionOption(event.phraseIndex, /* toInjectKeys= */ true);
    }
  }

  async onTextClicked(event: {phraseText: string; phraseIndex: number}) {
    // NOTE(cais): despite its name, enableAbbrevExpansionAutoFire currently
    // also controls whether entering the word-replacement model requires two
    // clicks. The rationale is that AE auto fire is approprite for the eye-gaze
    // use case, and that eye-gaze users should also need the two-click approach
    // for activating the word replacement mode.
    const twoStepWordReplacement =
        (await getAppSettings()).enableAbbrevExpansionAutoFire;
    const {phraseText, phraseIndex} = event;
    if (twoStepWordReplacement) {
      if (this.highlightedPhraseIndex !== null &&
          this.highlightedPhraseIndex === phraseIndex) {
        this.inputBarControlSubject.next(this.phraseToChips(phraseText));
        this.highlightedPhraseIndex = null;
      } else {
        this.highlightedPhraseIndex = phraseIndex;
      }
    } else {
      this.inputBarControlSubject.next(this.phraseToChips(phraseText));
    }
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
      this.responseError = null;
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
    let text = this.abbreviationOptions[this._selectedAbbreviationIndex];
    if (toInjectKeys) {
      // TODO(cais): Injecting eraser sequence is diabled for now. If it is to
      // be reinstated later, use this.abbreviation!.eraserSequence.
      injectTextAsKeys(text);
    }
    this.textEntryEndSubject.next({
      text,
      timestampMillis: Date.now(),
      isFinal: true,
      numKeypresses,
      numHumanKeypresses: numKeypresses,
      inAppTextToSpeechAudioConfig: toTriggerInAppTextToSpeech ? {} : undefined,
    });
    this.eventLogger.logAbbreviationExpansionSelection(
        getPhraseStats(text), index, this.abbreviationOptions.length,
        toTriggerInAppTextToSpeech ? 'TTS' : 'INJECTION');
    this.state = State.POST_CHOOSING_EXPANSION;
  }

  private resetState() {
    this.responseError = null;
    this._selectedAbbreviationIndex = -1;
    this.editTokens.splice(0);
    this.replacementTokens.splice(0);
    this.manualTokenString = '';
    this.reconstructedText = '';
    this.highlightedPhraseIndex = null;
    this.state = State.PRE_CHOOSING_EXPANSION;
    this.cdr.detectChanges();
  }

  private expandAbbreviation() {
    if (this.abbreviation === null) {
      this.responseError = 'Cannot expand abbreviation: empty abbreviation';
      return;
    }
    this.responseError = null;
    this.abbreviationOptions.splice(0);
    this.state = State.REQUEST_ONGIONG;
    this.responseError = null;
    this.receivedEmptyOptions = false;
    const usedContextStrings = this.usedContextStrings;
    const numSamples = this.getNumSamples(this.abbreviation);
    const usedContextString = usedContextStrings.join('|');
    this.eventLogger.logAbbreviationExpansionRequest(
        getAbbreviationExpansionRequestStats(
            this.abbreviation, usedContextStrings));
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
              this.eventLogger.logAbbreviationExpansionResponse(
                  getAbbreviationExpansionResponseStats(data.exactMatches));
              this.responseError = null;
              this.abbreviationOptions.splice(0);
              if (data.exactMatches != null) {
                // TODO(cais): Add unit test for not replacing words with names
                // when study is on.
                data.exactMatches.forEach(exactMatch => {
                  let replaced: string = exactMatch;
                  if (!this.isStudyOn) {
                    replaced =
                        LexiconComponent.replacePersonNamesWithKnownValues(
                            exactMatch);
                  }
                  if (this.abbreviationOptions.indexOf(replaced) === -1) {
                    this.abbreviationOptions.push(replaced);
                  }
                });
              }
              this.state = State.CHOOSING_EXPANSION;
              this.receivedEmptyOptions = this.abbreviationOptions.length === 0;
              this.cdr.detectChanges();
            },
            error => {
              this.eventLogger.logAbbreviationExpansionResponse(
                  getAbbreviationExpansionResponseStats(undefined, 'error'));
              this.state = State.CHOOSING_EXPANSION;
              this.receivedEmptyOptions = false;
              this.responseError =
                  typeof error === 'string' ? error : error.message;
              this.cdr.detectChanges();
            });
    this.cdr.detectChanges();
  }

  getPhraseBackgroundColor(i: number): string {
    if (this.highlightedPhraseIndex !== null &&
        i === this.highlightedPhraseIndex) {
      return AbbreviationComponent.PHRASE_BG_COLOR_HIGHLIGHTED;
    } else {
      return AbbreviationComponent.PHRASE_BG_COLOR_DEFAULT;
    }
  }

  getPhraseHideSpeakButton(i: number): boolean {
    if (this.highlightedPhraseIndex === null) {
      return false;
    } else {
      return this.highlightedPhraseIndex !== i;
    }
  }

  get usedContextStrings(): string[] {
    // TODO(#49): Limit by token length? Increase length.
    const LIMIT_TURNS = this.isStudyOn ?
        ContextComponent.MAX_USED_CONTEXT_COUNT_DURING_STUDY :
        2;
    const LIMIT_CONTEXT_TURN_LENGTH = 60;
    const strings = [...this.conversationTurns.map(
        turn =>
            limitStringLength(turn.speechContent, LIMIT_CONTEXT_TURN_LENGTH))];
    if (strings.length > LIMIT_TURNS) {
      strings.splice(0, strings.length - LIMIT_TURNS);
    }
    return strings;
  }

  get isStudyOn(): boolean {
    return this.studyManager.isStudyOn;
  }

  /**
   * Heuristics about the num_samples to use when requesting AE from server.
   */
  private getNumSamples(abbreviationSpec: AbbreviationSpec|null) {
    if (abbreviationSpec === null) {
      return 128;
    }
    // Total length of the abbreviation part plus the number of
    let totalAbbrevLength = 0;
    let totalKeywordCount = 0;
    for (const token of abbreviationSpec.tokens) {
      if (token.isKeyword) {
        totalKeywordCount++;
      } else {
        totalAbbrevLength += token.value.length;
      }
    }
    return totalAbbrevLength + totalKeywordCount > 5 ? 256 : 128;
  }

  get refinementType(): RefinementType {
    return this.pendingRefinementType;
  }
}
