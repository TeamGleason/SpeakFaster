/** An input bar, with related functional buttons. */
import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {Subject, Subscription} from 'rxjs';
import {sampleTime} from 'rxjs/operators';
import {injectTextAsKeys, requestSoftKeyboardReset, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {endsWithPunctuation, removePunctuation} from 'src/utils/text-utils';
import {createUuid} from 'src/utils/uuid';

import {getPhraseStats, HttpEventLogger} from '../event-logger/event-logger-impl';
import {ExternalEventsComponent, IgnoreMachineKeySequenceConfig, repeatVirtualKey, resetReconStates, VIRTUAL_KEY} from '../external/external-events.component';
import {LexiconComponent, LoadLexiconRequest} from '../lexicon/lexicon.component';
import {getAppSettings} from '../settings/settings';
import {FillMaskRequest, SpeakFasterService} from '../speakfaster-service';
import {StudyManager} from '../study/study-manager';
import {AbbreviationSpec, AbbreviationToken, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {TextEntryEndEvent} from '../types/text-entry';

export enum State {
  ENTERING_BASE_TEXT = 'ENTERING_BASE_TEXT',
  CHOOSING_LETTER_CHIP = 'CHOOSING_LETTER_CHIP',
  FOCUSED_ON_LETTER_CHIP = 'FOCUSED_ON_LETTER_CHIP',
  CHOOSING_PHRASES = 'CHOOSING_PHRASES',
  CHOOSING_WORD_CHIP = 'CHOOSING_WORD_CHIP',
  FOCUSED_ON_WORD_CHIP = 'FOCUSED_ON_WORD_CHIP',
  ADD_CONTEXTUAL_PHRASE_PENDING = 'ADD_CONTEXTUAL_PHRASE_PENDING',
  ADD_CONTEXTUAL_PHRASE_SUCCESS = 'ADD_CONTEXTUAL_PHRASE_SUCCESS',
  ADD_CONTEXTUAL_PHRASE_ERROR = 'ADD_CONTEXTUAL_PHRASE_ERROR',
}

/** Specs for a clickable chip inside the input bar. */
export interface InputBarChipSpec {
  // Text content of the chip.
  text: string;

  // Whether this is a pre-spelled word.
  preSpelled?: boolean;

  // Whether this is a text prediction, could be multi-word.
  isTextPrediction?: boolean;
}

/** An event that updates the clickable chips in the input bar. */
export interface InputBarControlEvent {
  // Add chips to the input bar. This is assumed to replace the existing text
  // in the input bar.
  chips?: InputBarChipSpec[];

  // Append text to the input bar. This does not erase the existing text in the
  // input bar.
  appendText?: string;

  // Indicates a word suggestion has been selected. If the current text ends in
  // whitespace, the string should be appended to the current text. Else, the
  // last word of the current text should be replaced by the selection.
  suggestionSelection?: string;

  // Clear all text and chips.
  clearAll?: boolean;

  // Delete these many characters from the end.
  numCharsToDeleteFromEnd?: number;

  // Signal to refresh quick phrases, e.g., after adding or editing a quick
  // phrase.
  refreshContextualPhrases?: boolean;

  // Specify the tags for the to-be-added contextual phrases.
  contextualPhraseTags?: string[];

  // `true` means hide the input bar. `false` means unhide (show) the input bar.
  hide?: boolean;

  // Request refocus.
  refocus?: boolean;
}

// Abbreviation expansion can be triggered by entering any of the the
// abbreviation following key sequences.
// TODO(#49): This can be generalized and made configurable.
// TODO(#49): Explore continuous AE without explicit trigger, perhaps
// added by heuristics for detecting abbreviations vs. words.
export const ABBRVIATION_EXPANSION_TRIGGER_SUFFIX: string[] = [
  '  ',  // Two Spaces.
  '\n',  // A single Enter.
];

const INPUT_TEXT_BASE_FONT_SIZE = 30;
const INPUT_TEXT_FONT_SIZE_SCALING_FACTORS =
    [1.0, 1 / 1.4, 1 / 1.65, 1 / 1.85, 1 / 2.00];
const INPUT_TEXT_FONT_SIZE_SCALING_LENGTH_TICKS = [0, 50, 100, 150, 250];

export const ABBREVIATION_MAX_PROPER_LENGTH = 12;

@Component({
  selector: 'app-input-bar-component',
  templateUrl: './input-bar.component.html',
})
export class InputBarComponent implements OnInit, AfterViewInit, OnDestroy {
  private static readonly _NAME = 'InputBarComponent';
  private readonly instanceId = InputBarComponent._NAME + '_' + createUuid();
  // Maximum allowed length of the abbreviation (proper) part of the input
  // string. For example, in the abbreviation with leading keywords ("how are
  // yd"), the "yd" part is the abbreviaton proper and it has a length of 2.
  // Maximum number of allowed leading (head) keywords.
  private static readonly ABBREVIATION_MAX_HEAD_KEYWORDS = 4;
  // Maximum allowed length of the entire abbreviation, including the leading
  // keywords.
  private static readonly ABBREVIATION_MAX_TOTAL_LENGTH = 50;
  // TODO(cais): Switch to the wait-and-send mode.
  private static readonly IN_FLIGHT_AE_TRIGGER_DEBOUNCE_MILLIS = 600;

  // NOTE(cais): If abbreviation expansion with mid-sentence comma is
  // prioritized, retsore the following ignore key sequence. This is
  // related to the fact that eye-gaze keyboards often attach as space
  // automatically after a comma.
  // NOTE(https://github.com/TeamGleason/SpeakFaster/issues/217): Some external
  // keyboards attach a space right after a comma, which causes trouble for
  // abbreviations containing commas ("g.hay").
  private static readonly IGNORE_MACHINE_KEY_SEQUENCE?:
      IgnoreMachineKeySequenceConfig = undefined;
  // { keySequence: [VIRTUAL_KEY.COMMA, VIRTUAL_KEY.SPACE], ignoreStartIndex: 1,
  // }

  @Input() userId!: string;
  @Input() contextStrings!: string[];
  @Input() languageCode!: string;
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input() supportsAbbrevationExpansion!: boolean;
  @Input() favoriteButtonSendsUserFeedback: boolean = false;
  @Input()
  abbreviationExpansionTriggers!: Subject<InputAbbreviationChangedEvent>;
  @Input() fillMaskTriggers!: Subject<FillMaskRequest>;
  @Input() inputBarControlSubject!: Subject<InputBarControlEvent>;
  @Input() loadPrefixedLexiconRequestSubject!: Subject<LoadLexiconRequest>;
  @Input() isFocused: boolean = true;
  @Input() notification?: string;
  @Output() inputStringChanged: EventEmitter<string> = new EventEmitter();

  private _studyUserTurnInstr: string|null = null;
  private _studyUserTurnText: string|null = null;
  private _studyDialogEnded: boolean = false;
  private _studyDialogError?: string;

  private _isHidden: boolean = false;
  private readonly _chips: InputBarChipSpec[] = [];
  private _focusChipIndex: number|null = null;
  private _chipTypedText: Array<string|null>|null = null;

  @ViewChild('inputTextArea') inputTextArea!: ElementRef<HTMLTextAreaElement>;
  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  state = State.ENTERING_BASE_TEXT;
  inputString: string = '';
  private static savedInputString: string = '';
  private cutText = '';
  private lastNonEmptyPhrase: string|null = null;

  private textEntryEndSubjectSubscription?: Subscription;
  private inputBarChipsSubscription?: Subscription;
  private abbreviationExpansionTriggersSubscription?: Subscription;
  private inFlightAbbreviationExpansionTriggerSubscription?: Subscription;
  private studyUserTurnsSubscription?: Subscription;
  readonly inFlightAbbreviationExpansionTriggers:
      Subject<InputAbbreviationChangedEvent> = new Subject();
  private _contextualPhraseTags: string[] = ['favorite'];
  private pendingCharDeletions: number = 0;
  private suggestionBasedSpaceIndex: number|null = null;

  constructor(
      public speakFasterService: SpeakFasterService,
      private studyManager: StudyManager, public eventLogger: HttpEventLogger,
      private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.textEntryEndSubjectSubscription = this.textEntryEndSubject.subscribe(
        (textInjection: TextEntryEndEvent) => {
          if (textInjection.isFinal) {
            this.resetState();
          } else {
            this.updateInputString(textInjection.text);
          }
          if (textInjection.isFinal && !textInjection.repeatLastNonEmpty &&
              !textInjection.isAborted && textInjection.text.trim()) {
            this.lastNonEmptyPhrase = textInjection.text.trim();
          }
        });
    if (InputBarComponent.IGNORE_MACHINE_KEY_SEQUENCE) {
      ExternalEventsComponent.registerIgnoreKeySequence(
          InputBarComponent.IGNORE_MACHINE_KEY_SEQUENCE);
    }
    this.inputBarChipsSubscription =
        this.inputBarControlSubject.subscribe((event: InputBarControlEvent) => {
          if (event.hide !== undefined) {
            this._isHidden = event.hide;
          } else if (event.suggestionSelection) {
            // A selection has been made for word completion or word suggestion.
            this.incorporateSuggestion(event.suggestionSelection);
          } else if (event.clearAll) {
            this.resetState(/* cleanText= */ true, /* resetBase= */ true);
          } else if (
              event.numCharsToDeleteFromEnd &&
              event.numCharsToDeleteFromEnd > 0) {
            this.pendingCharDeletions = event.numCharsToDeleteFromEnd;
          } else if (event.appendText !== undefined) {
            ExternalEventsComponent.appendString(
                event.appendText, /* isExternal= */ false);
            this.updateInputString(event.appendText);
            this.state = State.ENTERING_BASE_TEXT;
            this.eventLogger.logContextualPhraseCopying(
                getPhraseStats(event.appendText));
            this.scaleInputTextFontSize();
          } else if (event.contextualPhraseTags) {
            this._contextualPhraseTags.splice(0);
            this._contextualPhraseTags.push(...event.contextualPhraseTags);
            console.log(
                'Input bar switched contextual phrase tags to:',
                this.contextualPhraseTags);
          } else if (event.chips !== undefined) {
            let {chips} = event;
            if (chips[0].isTextPrediction) {
              if (this.state === State.ENTERING_BASE_TEXT) {
                let newString = this.inputString.trim();
                if (newString && !newString.match(/.*\s/)) {
                  newString += ' ';
                }
                newString += chips[0].text + ' ';
                this.updateInputString(newString);
              }
              return;
            }
            this._focusChipIndex = null;
            this._chips.splice(0);
            this._chips.push(...chips);
            this._chipTypedText = null;
            this._chips.forEach((chip, i) => {
              if (chip.preSpelled) {
                this.ensureChipTypedTextCreated();
                this._chipTypedText![i] = chip.text;
              }
            });
            this.saveInputTextAreaState();
            if (this._chips.length > 1) {
              this.state = State.CHOOSING_WORD_CHIP;
              this.eventLogger.logAbbreviationExpansionStartWordRefinementMode(
                  getPhraseStats(this._chips.map(chip => chip.text).join(' ')));
            } else if (
                this._chips.length === 1 && this._chips[0].isTextPrediction) {
              this.cutText =
                  this._chips.map(chip => chip.text.trim()).join(' ') + ' ';
              this.inputString = this.cutText;
            }
          } else if (event.refocus) {
            if (this.inputTextArea) {
              this.focusOnInputTextArea();
            }
          }
        });
    this.abbreviationExpansionTriggersSubscription =
        this.abbreviationExpansionTriggers.subscribe(event => {
          if (this.state === State.FOCUSED_ON_LETTER_CHIP) {
            // TODO(cais): Add unit tests.
          } else {
            this.state = State.CHOOSING_PHRASES;
          }
        });
    this.inFlightAbbreviationExpansionTriggerSubscription =
        this.inFlightAbbreviationExpansionTriggers
            .pipe(sampleTime(
                InputBarComponent.IN_FLIGHT_AE_TRIGGER_DEBOUNCE_MILLIS))
            .subscribe((event: InputAbbreviationChangedEvent) => {
              this.abbreviationExpansionTriggers.next(event);
            });
    this.studyUserTurnsSubscription =
        this.studyManager.studyUserTurns.subscribe(turn => {
          this._studyUserTurnInstr = turn.instruction;
          this._studyUserTurnText = turn.text;
          this._studyDialogEnded = turn.isComplete;
          this._studyDialogError = turn.error;
          setTimeout(() => {this.focusOnInputTextArea()}, 10);
        });
  }

  private focusOnInputTextArea() {
    this.inputTextArea.nativeElement.focus({preventScroll: true});
  }

  private ensureChipTypedTextCreated() {
    if (this._chipTypedText === null) {
      this._chipTypedText = Array(this._chips.length).fill(null);
    }
  }

  ngAfterViewInit() {
    this.focusOnInputTextArea();
    updateButtonBoxesForElements(this.instanceId, this.buttons);
    this.buttons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnDestroy() {
    if (this.textEntryEndSubjectSubscription) {
      this.textEntryEndSubjectSubscription.unsubscribe();
    }
    if (this.inputBarChipsSubscription) {
      this.inputBarChipsSubscription.unsubscribe();
    }
    if (this.abbreviationExpansionTriggersSubscription) {
      this.abbreviationExpansionTriggersSubscription.unsubscribe();
    }
    if (this.inFlightAbbreviationExpansionTriggerSubscription) {
      this.inFlightAbbreviationExpansionTriggerSubscription.unsubscribe();
    }
    updateButtonBoxesToEmpty(this.instanceId);
    if (InputBarComponent.IGNORE_MACHINE_KEY_SEQUENCE) {
      ExternalEventsComponent.unregisterIgnoreKeySequence(
          InputBarComponent.IGNORE_MACHINE_KEY_SEQUENCE);
    }
    if (this.studyUserTurnsSubscription) {
      this.studyUserTurnsSubscription.unsubscribe();
    }
  }

  async onInputTextAreaKeyUp(event: KeyboardEvent) {
    this.inputString = this.inputTextArea.nativeElement.value;
    if (this.inputStringHasOnlyPuncutationAfterSuggestionSpace()) {
      this.updateInputString(
          this.inputString.substring(0, this.suggestionBasedSpaceIndex!) +
          this.inputString.substring(this.suggestionBasedSpaceIndex! + 1));
      this.suggestionBasedSpaceIndex = null;
      return;
    }
    if (this.pendingCharDeletions > 0) {
      this.inputString = this.inputTextArea.nativeElement.value.substring(
          0,
          this.inputTextArea.nativeElement.value.length -
              this.pendingCharDeletions);
      this.pendingCharDeletions = 0;
      this.inputTextArea.nativeElement.value = this.inputString;
    }
    this.inputStringChanged.next(this.inputString);
    this.eventLogger.logKeypress(event as KeyboardEvent, this.inputString);
    this.scaleInputTextFontSize();
    const aeAutoFire = (await getAppSettings()).enableAbbrevExpansionAutoFire;
    // TODO(cais): Add unit test for AE auto fire.
    const suffixOrSettingTriggersAe = aeAutoFire ||
        ABBRVIATION_EXPANSION_TRIGGER_SUFFIX.some(
            suffix => this.inputString.endsWith(suffix))
    if (suffixOrSettingTriggersAe &&
        !(this.studyManager.isStudyOn &&
          !this.studyManager.isAbbreviationMode) &&
        this.inputStringIsCompatibleWithAbbreviationExpansion) {
      // NOTE(#337): Under the full mode of study, AE should not be triggered.
      await this.triggerAbbreviationExpansion();
    }
  }

  inputStringHasOnlyPuncutationAfterSuggestionSpace(): boolean {
    if (this.suggestionBasedSpaceIndex === null) {
      return false;
    }
    if (this.inputString[this.suggestionBasedSpaceIndex] !== ' ') {
      return false;
    }
    if (this.inputString.length <= this.suggestionBasedSpaceIndex) {
      return false;
    }
    const suffix =
        this.inputString.substring(this.suggestionBasedSpaceIndex + 1).trim();
    return suffix.match(/^[\,\;\:\.\!\?]+$/) !== null;
  }

  onMainAreaClicked(event: Event) {
    if (!this.inputTextArea) {
      return;
    }
    this.focusOnInputTextArea();
  }

  private scaleInputTextFontSize(scrollToBottom = false): void {
    // TODO(cais): Limit on over all text length.
    if (!this.inputTextArea) {
      return;
    }
    const element = this.inputTextArea.nativeElement;
    const textLength = this.inputString.length;
    const widthPx = Math.min(textLength * 25, 600);
    element.style.width = `${widthPx}px`;
    let i = INPUT_TEXT_FONT_SIZE_SCALING_LENGTH_TICKS.length - 1;
    for (; i >= 0; --i) {
      if (textLength >= INPUT_TEXT_FONT_SIZE_SCALING_LENGTH_TICKS[i]) {
        break;
      }
    }
    let numSteps = i;
    if (numSteps >= INPUT_TEXT_FONT_SIZE_SCALING_FACTORS.length) {
      numSteps = INPUT_TEXT_FONT_SIZE_SCALING_FACTORS.length - 1;
    }
    const fontSizeScalingFactor =
        INPUT_TEXT_FONT_SIZE_SCALING_FACTORS[numSteps];
    if (numSteps > 0) {
      const fontSize = INPUT_TEXT_BASE_FONT_SIZE * fontSizeScalingFactor;
      const lineHeight = fontSize * 1.1;
      element.style.fontSize = `${fontSize.toFixed(1)}px`;
      element.style.lineHeight = `${lineHeight.toFixed(1)}px`;
    } else {
      element.style.fontSize = `${INPUT_TEXT_BASE_FONT_SIZE}px`;
      element.style.lineHeight = `${INPUT_TEXT_BASE_FONT_SIZE}px`;
    }
    if (scrollToBottom) {
      element.scrollTop = element.scrollHeight;
    }
    updateButtonBoxesForElements(this.instanceId, this.buttons);
  }

  onExpandButtonClicked(event?: Event) {
    this.triggerAbbreviationExpansion();
  }

  private async triggerAbbreviationExpansion(isInFlight: boolean = false) {
    const precedingText = '';
    const eraserLength = this.inputString.length;

    let abbreviationSpec = this.getNonSpellingAbbreviationExpansion();
    const isIncompleteKeyword = (await getAppSettings()).enableInckw;
    if (this.state === State.FOCUSED_ON_LETTER_CHIP) {
      const tokens: AbbreviationToken[] = [];
      let pendingChars: string = '';
      for (let i = 0; i < this._chips.length; ++i) {
        const isSpelled =
            this._chipTypedText !== null && this._chipTypedText[i] !== null;
        if (isSpelled) {
          if (pendingChars) {
            tokens.push({
              value: pendingChars,
              isKeyword: false,
            });
            pendingChars = '';
          }
          tokens.push({
            value: removePunctuation(this._chipTypedText![i]!)
                       .trim()
                       .toLocaleLowerCase(),
            isKeyword: true,
            wordAbbrevMode: isIncompleteKeyword ? 'PREFIX' : undefined,
          });
        } else {
          // The word has *not* been spelled out.
          pendingChars += this._chips[i].text;
        }
      }
      if (pendingChars) {
        tokens.push({
          value: pendingChars,
          isKeyword: false,
        });
      }
      abbreviationSpec = {
        tokens,
        readableString: tokens.map(token => removePunctuation(token.value))
                            .join(' ')
                            .toLocaleLowerCase(),
        precedingText,
        eraserSequence: repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, eraserLength),
        lineageId: createUuid(),
      };
    }
    console.log('Abbreviation expansion triggered:', abbreviationSpec);
    const abbreviationChangeEvent: InputAbbreviationChangedEvent = {
      abbreviationSpec,
      requestExpansion: true
    };
    if (isInFlight) {
      this.inFlightAbbreviationExpansionTriggers.next(abbreviationChangeEvent);
    } else {
      this.abbreviationExpansionTriggers.next(abbreviationChangeEvent);
    }
  }

  private getNonSpellingAbbreviationExpansion(): AbbreviationSpec {
    const textTokens =
        this.inputString.trim().split(' ').filter(token => token.length > 0);
    const headKeywords: string[] = [];
    if (textTokens.length > 1) {
      headKeywords.push(...textTokens.slice(0, textTokens.length - 1));
    }
    const abbrevText = textTokens[textTokens.length - 1];
    const eraserLength = this.inputString.length;
    const tokens: AbbreviationToken[] = [];
    let readableString: string = '';
    headKeywords.forEach(keyword => {
      tokens.push({
        value: removePunctuation(keyword),
        isKeyword: true,
      });
      readableString += removePunctuation(keyword) + ' ';
    });
    readableString += abbrevText;
    tokens.push({
      value: abbrevText.toLocaleLowerCase(),
      isKeyword: false,
    });
    return {
      tokens, readableString: readableString.toLocaleLowerCase(),
          precedingText: '',
          eraserSequence: repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, eraserLength),
          lineageId: createUuid(),
    }
  }

  onSpellButtonClicked(event: Event) {
    let abbreviation: string = this.inputString.trim();
    const tokens = abbreviation.split(' ').filter(token => token.length > 0);
    const newChips: InputBarChipSpec[] = [];
    if (this.cutText) {
      abbreviation = abbreviation.substring(this.cutText.length).trim();
      const cutTextWords =
          this.cutText.trim().split(' ').filter(word => word.length > 0);
      newChips.push(
          ...cutTextWords.map(word => ({text: word, preSpelled: true})));
    } else if (tokens.length > 1) {
      for (let i = 0; i < tokens.length - 1; ++i) {
        newChips.push({
          text: tokens[i].toLowerCase(),
          preSpelled: true,
        });
      }
      abbreviation = tokens[tokens.length - 1];
    }

    newChips.push(...abbreviation.split('').map(char => ({text: char})));
    this.inputBarControlSubject.next({chips: newChips});
    this.state = State.CHOOSING_LETTER_CHIP;
    this.refreshExternalSoftKeyboardState();
    this.eventLogger.logAbbreviationExpansionStartSpellingMode(
        abbreviation.length);
    this.saveInputTextAreaState();
  }

  private saveInputTextAreaState() {
    if (!this.inputTextArea || !this.inputTextArea.nativeElement) {
      return;
    }
    InputBarComponent.savedInputString = this.inputTextArea.nativeElement.value;
  }

  private restoreInputTextAreaState() {
    this.updateInputString(InputBarComponent.savedInputString);
  }

  async onChipTextChanged(event: {text: string}, i: number) {
    this.ensureChipTypedTextCreated();
    const spelledString = event.text.trim();
    this._chipTypedText![i] = spelledString;
    if (this.state === State.FOCUSED_ON_LETTER_CHIP) {
      let isValidWordOrIncompleteKeyword = false;
      if ((await getAppSettings()).enableInckw) {
        isValidWordOrIncompleteKeyword = spelledString.trim().length > 1;
        if (isValidWordOrIncompleteKeyword) {
          console.log(`Spelled string is an incommplete keyword: trigger AE`);
        }
      } else if (this.isValidWord(spelledString.trim())) {
        console.log(
            `Spelled string is valid word '${spelledString}': trigger AE`);
        isValidWordOrIncompleteKeyword = true;
      }
      if (isValidWordOrIncompleteKeyword) {
        await this.triggerAbbreviationExpansion(/* isInFlight= */ true);
      }
    }
    updateButtonBoxesForElements(this.instanceId, this.buttons);
  }

  isValidWord(str: string): boolean {
    return LexiconComponent.isValidWord(str);
  }

  onChipClicked(index: number) {
    this._focusChipIndex = index;
    if (this.state === State.CHOOSING_LETTER_CHIP ||
        this.state === State.FOCUSED_ON_LETTER_CHIP) {
      this.eventLogger.logAbbreviationExpansionSpellingChipSelection(
          this._chips.length, index);
      this.state = State.FOCUSED_ON_LETTER_CHIP;
      const firstLetter = this._chips[index].text[0];
      this.loadPrefixedLexiconRequestSubject.next({
        prefix: firstLetter,
      });
    } else if (
        this.state === State.CHOOSING_WORD_CHIP ||
        this.state === State.FOCUSED_ON_WORD_CHIP) {
      this.refreshExternalSoftKeyboardState();
      const tokens: string[] = this._chips.map(chip => chip.text);
      if (this._chipTypedText !== null) {
        for (let i = 0; i < this._chipTypedText.length; ++i) {
          if (this._chipTypedText[i] !== null) {
            tokens[i] = this._chipTypedText[i]!.trim();
          }
        }
      }
      tokens[index] = '_';
      const phraseWithMask = tokens.join(' ');
      const maskInitial = this._chips[index].text[0];
      const originalChipStrings = this._chips.map(chip => chip.text);
      this.eventLogger.logAbbreviatonExpansionWordRefinementRequest(
          getPhraseStats(originalChipStrings.join(' ')), this._focusChipIndex);
      this.fillMaskTriggers.next({
        speechContent: this.contextStrings.join('|'),
        phraseWithMask,
        maskInitial,
        originalChipStrings,
      });
      this.state = State.FOCUSED_ON_WORD_CHIP;
    }
  }

  onChipCutClicked(event: Event, index: number) {
    this.cutChipsAtIndex(index);
  }

  private cutChipsAtIndex(index: number, appendLastChar = false) {
    this.state = State.ENTERING_BASE_TEXT;
    this.cdr.detectChanges();
    const newString =
        this._chips.slice(0, index + 1).map(chip => chip.text).join(' ') + ' ';
    this.updateInputString(newString);
  }

  onAbortButtonClicked(event: Event) {
    if (this.state === State.ENTERING_BASE_TEXT ||
        this.state === State.CHOOSING_PHRASES) {
      this.textEntryEndSubject.next({
        text: '',
        timestampMillis: new Date().getTime(),
        isFinal: true,
        isAborted: true,
      });
      updateButtonBoxesForElements(this.instanceId, this.buttons);
    } else if (
        this.state === State.CHOOSING_WORD_CHIP ||
        this.state === State.FOCUSED_ON_WORD_CHIP ||
        this.state === State.CHOOSING_LETTER_CHIP ||
        this.state === State.FOCUSED_ON_LETTER_CHIP) {
      this.state = State.ENTERING_BASE_TEXT;
      this.restoreInputTextAreaState();
      updateButtonBoxesForElements(this.instanceId, this.buttons);
    }
  }

  onFavoritePhraseAdded(event: {text: string, success: boolean}) {
    if (event.success) {
      this.textEntryEndSubject.next({
        isFinal: true,
        text: event.text,
        timestampMillis: Date.now(),
      });
    }
  }

  private refreshExternalSoftKeyboardState() {
    requestSoftKeyboardReset();
  }

  get isHidden(): boolean {
    return this._isHidden;
  }

  /**
   * Compute the effective text-to-speech phrase, taking into account the
   * current UI state, such as directly-entered text and chips.
   */
  get effectivePhrase(): string {
    let text: string = '';
    if (this.state === State.CHOOSING_WORD_CHIP ||
        this.state === State.FOCUSED_ON_WORD_CHIP) {
      const words: string[] = this._chips.map(chip => chip.text);
      if (this._focusChipIndex !== null && this._chipTypedText !== null) {
        this._chipTypedText.forEach((chipText, i) => {
          if (chipText !== null) {
            words[i] = chipText;
          }
        });
      }
      return words.join(' ');
    } else if (
        this.state === State.FOCUSED_ON_LETTER_CHIP &&
        this._chips.length === 1 && this._chipTypedText !== null &&
        this._chipTypedText[0] !== null) {
      return this._chipTypedText[0].trim();
    } else if (
        this.state === State.ENTERING_BASE_TEXT ||
        this.state === State.CHOOSING_PHRASES) {
      return this.inputString;
    }
    return text.trim();
  }

  get hasOnlyOneTextPredictionChip(): boolean {
    return this._chips !== null && this._chips.length === 1 &&
        this._chips[0].isTextPrediction === true;
  }

  get hasNotification(): boolean {
    return this.notification !== undefined && this.notification.length > 0;
  }

  onSpeakAsIsButtonClicked(event?: Event) {
    if (this.state === State.CHOOSING_LETTER_CHIP ||
        (this.state === State.FOCUSED_ON_LETTER_CHIP &&
         (this._chips.length > 1 || this._chipTypedText === null ||
          this._chipTypedText[0] === null ||
          this._chipTypedText[0].trim() === ''))) {
      // The Speak button should do nothing when spelling a word, unless there
      // is only one word.
      return;
    }
    const text = this.effectivePhrase;
    const repeatLastNonEmpty = text === '';
    this.eventLogger.logInputBarSpeakButtonClick(getPhraseStats(text));
    this.textEntryEndSubject.next({
      text,
      timestampMillis: Date.now(),
      isFinal: true,
      inAppTextToSpeechAudioConfig: {},
      repeatLastNonEmpty,
    });
  }

  onInjectButtonClicked(event?: Event) {
    let text = this.effectivePhrase || this.lastNonEmptyPhrase;
    if (!text?.trim()) {
      return;
    }
    this.eventLogger.logInputBarInjectButtonClick(getPhraseStats(text));
    const injectedKeys = injectTextAsKeys(text.trim());
    this.textEntryEndSubject.next({
      text,
      timestampMillis: Date.now(),
      isFinal: true,
      injectedKeys,
    });
  }

  /**
   * Incorporates selected suggestion into the current input string.
   *
   * Takes into account of whether the current input string ends in whitespace.
   * If it does, `suggestion` will be used as next-word prediction and be
   * appended to the end of the input string. If it does not, `suggestion` will
   * be used as a completion for the current final word and replace it.
   *
   * @param suggestion Selected word, either for word completion or next-word
   * prediction.
   */
  private incorporateSuggestion(suggestion: string) {
    let breakingIndex = this.inputString.length - 1;
    while (breakingIndex >= 0) {
      if (this.inputString[breakingIndex].match(/\s/) ||
          endsWithPunctuation(
              this.inputString.substring(0, breakingIndex + 1))) {
        break;
      }
      breakingIndex--;
    }
    let newString = this.inputString.substring(0, breakingIndex + 1);
    if (endsWithPunctuation(newString)) {
      newString += ' ';
    }
    newString += suggestion;
    this.updateInputString(newString);
    this.suggestionBasedSpaceIndex =
        suggestion[suggestion.length - 1] ? newString.length - 1 : null;
    this.scaleInputTextFontSize(/* scrollToBottom= */ true);
  }

  private resetState(clearText: boolean = true, resetBase: boolean = true) {
    this.state = State.ENTERING_BASE_TEXT;
    this._chips.splice(0);
    this._focusChipIndex = null;
    this._chipTypedText = null;
    if (clearText) {
      this.updateInputString('');
    }
    if (!resetBase) {
      return;
    }
    this.cutText = '';
    this.focusOnInputTextArea();
    this.pendingCharDeletions = 0;
    this.suggestionBasedSpaceIndex = null;
    resetReconStates();
  }

  private updateInputString(newStringValue: string) {
    this.inputString = newStringValue;
    this.cdr.detectChanges();
    this.inputTextArea.nativeElement.value = this.inputString;
    this.scaleInputTextFontSize();
    this.inputStringChanged.next(this.inputString);
    this.focusOnInputTextArea();
    updateButtonBoxesForElements(this.instanceId, this.buttons);
  }

  getChipText(index: number): string {
    if (this._chipTypedText !== null) {
      if (this._chipTypedText[index] === null) {
        return this._chips[index].text;
      } else {
        return this._chipTypedText[index]!;
      }
    }
    return this._chips[index].text;
  }

  get showTextPredictionBar() {
    return !this.hasNotification && !this.isStudyOn &&
        this.state === State.ENTERING_BASE_TEXT;
  }

  get showExpandButton(): boolean {
    return (this.state === State.ENTERING_BASE_TEXT ||
            this.state === State.CHOOSING_PHRASES ||
            this.state === State.FOCUSED_ON_LETTER_CHIP) &&
        this.inputStringIsCompatibleWithAbbreviationExpansion &&
        this.supportsAbbrevationExpansion;
  }

  get showSpellButton():
      boolean{return((this.state === State.ENTERING_BASE_TEXT) ||
                     (this.state === State.CHOOSING_PHRASES)) &&
              this.inputStringIsCompatibleWithAbbreviationExpansion &&
              this.supportsAbbrevationExpansion &&
              !this.hasOnlyOneTextPredictionChip}

  get hasInputStringOrChips(): boolean {
    return this.inputString.trim().length > 0 || this._chips.length > 0;
  }

  /**
   * Whether the current input text in the input bar is compatible with
   * abbreviation expansion.
   */
  get inputStringIsCompatibleWithAbbreviationExpansion(): boolean {
    return this.inputString.trim().length > 0 &&
        !this.inputStringExceedsAbbreviationExpansionLimit;
  }

  get inputStringExceedsAbbreviationExpansionLimit(): boolean {
    const trimmedLength = this.inputString.trim().length;
    const tokens = this.inputString.trim().split(' ');
    const lastToken = tokens[tokens.length - 1];
    const lastTokenLength = lastToken.length;
    return trimmedLength > InputBarComponent.ABBREVIATION_MAX_TOTAL_LENGTH ||
        tokens.length > InputBarComponent.ABBREVIATION_MAX_HEAD_KEYWORDS + 1 ||
        lastTokenLength > ABBREVIATION_MAX_PROPER_LENGTH;
  }

  get abbreviationExpansionLengthLimitExceededMessage(): string {
    return `AE length limit exceeded.`;
  }

  get chips(): InputBarChipSpec[] {
    return this._chips?.slice(0);
  }

  get focusChipIndex(): number|null {
    return this._focusChipIndex;
  }

  get chipBackgroundColor(): string {
    if (this.state === State.CHOOSING_LETTER_CHIP ||
        this.state === State.FOCUSED_ON_LETTER_CHIP) {
      return '#406647';
    } else {
      return '#0687BE';
    }
  }

  isChipTyped(index: number): boolean {
    if (this._chipTypedText === null) {
      return false;
    }
    return this._chipTypedText[index] !== null;
  }

  get favoriteButtonImageUrl(): string {
    if (this.state === State.ADD_CONTEXTUAL_PHRASE_PENDING) {
      return '/assets/images/hourglass.png';
    } else if (this.state === State.ADD_CONTEXTUAL_PHRASE_SUCCESS) {
      return '/assets/images/success-circle.png';
    } else if (this.state === State.ADD_CONTEXTUAL_PHRASE_ERROR) {
      return '/assets/image/error-circle.png';
    } else {
      return '/assets/images/favorite.png';
    }
  }

  get contextualPhraseTags(): string[] {
    return this._contextualPhraseTags.slice();
  }

  get isStudyOn(): boolean {
    return this.studyManager.isStudyOn;
  }

  get studyUserTurnText(): string|null {
    return this._studyUserTurnText;
  }

  get studyUserTurnInstr(): string|null {
    return this._studyUserTurnInstr;
  }

  get isStudyDialogComplete(): boolean {
    return this._studyDialogEnded;
  }

  get studyDialogError(): string|undefined {
    return this._studyDialogError;
  }

  get hideSpeakButton(): boolean {
    const canOutputTextFromInputBar =
        (this.state === State.CHOOSING_WORD_CHIP ||
         this.state === State.FOCUSED_ON_WORD_CHIP ||
         (this.state === State.FOCUSED_ON_LETTER_CHIP &&
          this._chips.length === 1));
    return this.isStudyOn && this.studyManager.isAbbreviationMode &&
        !canOutputTextFromInputBar;
  }
}
