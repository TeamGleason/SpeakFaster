/** An input bar, with related functional buttons. */
import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {Subject, Subscription} from 'rxjs';
import {debounceTime} from 'rxjs/operators';
import {injectKeys, requestSoftKeyboardReset, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {endsWithSentenceEndPunctuation, isAlphanumericChar, keySequenceEndsWith} from 'src/utils/text-utils';
import {createUuid} from 'src/utils/uuid';

import {getPhraseStats, HttpEventLogger} from '../event-logger/event-logger-impl';
import {ExternalEventsComponent, IgnoreMachineKeySequenceConfig, repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
import {LexiconComponent, LoadLexiconRequest} from '../lexicon/lexicon.component';
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

  // Clear all text and chips.
  clearAll?: boolean;

  // Signal to refresh quick phrases, e.g., after adding or editing a quick
  // phrase.
  refreshContextualPhrases?: boolean;

  // Specify the tags for the to-be-added contextual phrases.
  contextualPhraseTags?: string[];

  // `true` means hide the input bar. `false` means unhide (show) the input bar.
  hide?: boolean;
}

function removePunctuation(str: string) {
  return str.replace(/[\.\!\?]/g, '');
}

// Abbreviation expansion can be triggered by entering any of the the
// abbreviation following key sequences.
// TODO(#49): This can be generalized and made configurable.
// TODO(#49): Explore continuous AE without explicit trigger, perhaps
// added by heuristics for detecting abbreviations vs. words.
export const ABBRVIATION_EXPANSION_TRIGGER_KEY_SEQUENCES: Array<string[]> =
    [[VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE], [VIRTUAL_KEY.ENTER]];

const INPUT_TEXT_BASE_FONT_SIZE = 30;
const INPUT_TEXT_FONT_SIZE_SCALING_FACTORS =
    [1.0, 1 / 1.35, 1 / 1.6, 1 / 1.8, 1 / 1.95];
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
  private static readonly IN_FLIGHT_AE_TRIGGER_DEBOUNCE_MILLIS = 500;

  // NOTE(https://github.com/TeamGleason/SpeakFaster/issues/217): Some external
  // keyboards attach a space right after a comma, which causes trouble for
  // abbreviations containing commas ("g.hay").
  private static readonly IGNORE_MACHINE_KEY_SEQUENCE:
      IgnoreMachineKeySequenceConfig = {
        keySequence: [VIRTUAL_KEY.COMMA, VIRTUAL_KEY.SPACE],
        ignoreStartIndex: 1,
      }

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
  @Output() inputStringChanged: EventEmitter<string> = new EventEmitter();

  private _studyUserTurnInstr: string|null = null;
  private _studyUserTurnText: string|null = null;
  private _studyDialogEnded: boolean = false;
  private _studyDialogError?: string;

  private _isHidden: boolean = false;
  private readonly _chips: InputBarChipSpec[] = [];
  private _focusChipIndex: number|null = null;
  private _chipTypedText: Array<string|null>|null = null;

  @ViewChild('inputText') inputTextDiv!: ElementRef<HTMLDivElement>;
  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  state = State.ENTERING_BASE_TEXT;
  inputString: string = '';
  private latestReconstructedString = '';
  private baseReconstructedText: string = '';
  private cutText = '';

  private textEntryEndSubjectSubscription?: Subscription;
  private inputBarChipsSubscription?: Subscription;
  private abbreviationExpansionTriggersSubscription?: Subscription;
  private inFlightAbbreviationExpansionTriggerSubscription?: Subscription;
  private studyUserTurnsSubscription?: Subscription;
  private keypressListener = this.listenToKeypress.bind(this);
  private readonly inFlightAbbreviationExpansionTriggers:
      Subject<InputAbbreviationChangedEvent> = new Subject();
  private _contextualPhraseTags: string[] = ['favorite'];

  constructor(
      public speakFasterService: SpeakFasterService,
      private studyManager: StudyManager, private cdr: ChangeDetectorRef,
      private eventLogger: HttpEventLogger) {}

  ngOnInit() {
    this.textEntryEndSubjectSubscription = this.textEntryEndSubject.subscribe(
        (textInjection: TextEntryEndEvent) => {
          if (textInjection.isFinal) {
            this.latestReconstructedString = '';
            this.resetState();
          } else {
            this.updateInputString(textInjection.text);
          }
        });
    ExternalEventsComponent.registerIgnoreKeySequence(
        InputBarComponent.IGNORE_MACHINE_KEY_SEQUENCE);
    ExternalEventsComponent.registerKeypressListener(this.keypressListener);
    this.inputBarChipsSubscription =
        this.inputBarControlSubject.subscribe((event: InputBarControlEvent) => {
          if (event.hide !== undefined) {
            this._isHidden = event.hide;
          } else if (event.clearAll) {
            this.baseReconstructedText = this.latestReconstructedString;
            this.resetState(/* cleanText= */ true, /* resetBase= */ false);
          } else if (event.appendText !== undefined) {
            ExternalEventsComponent.appendString(
                event.appendText, /* isExternal= */ false);
            this.inputString = ExternalEventsComponent.internalText;
            this.state = State.ENTERING_BASE_TEXT;
            this.eventLogger.logContextualPhraseCopying(
                getPhraseStats(event.appendText));
          } else if (event.contextualPhraseTags) {
            this._contextualPhraseTags.splice(0);
            this._contextualPhraseTags.push(...event.contextualPhraseTags);
            console.log(
                'Input bar switched contextual phrase tags to:',
                this.contextualPhraseTags);
          } else if (event.chips !== undefined) {
            let {chips} = event;
            if (this.state === State.ENTERING_BASE_TEXT &&
                chips[0].isTextPrediction) {
              const originalInputString = this.inputString;
              chips[0] = {
                text: this.inputString.trim() + ' ' + chips[0].text,
                isTextPrediction: chips[0].isTextPrediction,
              };
              const appendedString =
                  chips[0].text.substring(originalInputString.length).trim();
              ExternalEventsComponent.appendString(
                  appendedString, /* isExternal= */ false);
              this.baseReconstructedText = this.latestReconstructedString;
            }
            this._focusChipIndex = null;
            this._chips.splice(0);
            this._chips.push(...chips);
            if (this._chipTypedText !== null) {
              for (let i = 0; i < this._chipTypedText.length; ++i) {
                if (this._chipTypedText[i] !== null &&
                    !this._chips[i].preSpelled) {
                  this._chips[i].text = this._chipTypedText[i]!;
                }
              }
            }
            this._chips.forEach((chip, i) => {
              if (chip.preSpelled) {
                this.ensureChipTypedTextCreated();
                this._chipTypedText![i] = chip.text;
              }
            });
            if (this._chips.length > 1) {
              this.state = State.CHOOSING_WORD_CHIP;
              this.eventLogger.logAbbreviationExpansionStartWordRefinementMode(
                  getPhraseStats(this._chips.map(chip => chip.text).join(' ')));
            } else if (
                this._chips.length === 1 && this._chips[0].isTextPrediction) {
              this.cutText =
                  this._chips.map(chip => chip.text.trim()).join(' ') + ' ';
              this.inputString = this.cutText;
              this.latestReconstructedString = '';
              this.baseReconstructedText = '';
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
            .pipe(debounceTime(
                InputBarComponent.IN_FLIGHT_AE_TRIGGER_DEBOUNCE_MILLIS))
            .subscribe((event: InputAbbreviationChangedEvent) => {
              this.abbreviationExpansionTriggers.next(event);
            });
    this.studyUserTurnsSubscription =
        this.studyManager.studyUserTurns.subscribe(turn => {
          this._studyUserTurnInstr =
              turn.isAbbreviation ? 'Enter in abbreviation:' : 'Enter in full:';
          this._studyUserTurnText = turn.text;
          this._studyDialogEnded = turn.isComplete;
          this._studyDialogError = turn.error;
        });
  }

  private ensureChipTypedTextCreated() {
    if (this._chipTypedText === null) {
      this._chipTypedText = Array(this._chips.length).fill(null);
    }
  }

  ngAfterViewInit() {
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
    ExternalEventsComponent.unregisterKeypressListener(this.keypressListener);
    ExternalEventsComponent.unregisterIgnoreKeySequence(
        InputBarComponent.IGNORE_MACHINE_KEY_SEQUENCE);
    if (this.studyUserTurnsSubscription) {
      this.studyUserTurnsSubscription.unsubscribe();
    }
  }

  public listenToKeypress(keySequence: string[], reconstructedText: string):
      void {
    const lastKey = keySequence[keySequence.length - 1];
    this.latestReconstructedString = reconstructedText;
    if (this.state === State.ENTERING_BASE_TEXT ||
        this.state === State.CHOOSING_PHRASES) {
      this.updateInputString(
          reconstructedText.slice(this.baseReconstructedText.length));
      if (this.inputStringIsCompatibleWithAbbreviationExpansion &&
          ABBRVIATION_EXPANSION_TRIGGER_KEY_SEQUENCES.some(
              triggerKeySeqwuence =>
                  keySequenceEndsWith(keySequence, triggerKeySeqwuence))) {
        this.triggerAbbreviationExpansion();
      }
    } else if (this.state === State.CHOOSING_WORD_CHIP) {
      this.baseReconstructedText = this.latestReconstructedString;
      const appendLastChar =
          isAlphanumericChar(keySequence[keySequence.length - 1]);
      this.cutChipsAtIndex(this.chips.length - 1, appendLastChar);
    } else if (this.state === State.CHOOSING_LETTER_CHIP) {
      // If there is a uniquely matching word, then choose it.
      const typedLetter = reconstructedText.slice(reconstructedText.length - 1)
                              .toLocaleLowerCase();
      let matchingChipIndices: number[] = [];
      for (let i = 0; i < this._chips.length; ++i) {
        if (this._chips[i].text.toLocaleLowerCase() === typedLetter) {
          matchingChipIndices.push(i);
        }
      }
      if (matchingChipIndices.length === 1) {
        this.eventLogger.logAbbreviationExpansionSpellingChipSelection(
            this._chips.length, matchingChipIndices[0]);
        this.state = State.FOCUSED_ON_LETTER_CHIP;
        // Signal to soft keyboard a word boundary. TODO(cais): Decide.
        injectKeys([VIRTUAL_KEY.SPACE], null);
        this.baseReconstructedText = this.latestReconstructedString.slice(
            0, this.latestReconstructedString.length - 1);
        this._focusChipIndex = matchingChipIndices[0];
        this.ensureChipTypedTextCreated();
        this._chipTypedText![this._focusChipIndex] = typedLetter;
        this.loadPrefixedLexiconRequestSubject.next({
          prefix: typedLetter,
        });
      }
      updateButtonBoxesForElements(this.instanceId, this.buttons);
    } else if (this.state === State.FOCUSED_ON_LETTER_CHIP) {
      const spelledString =
          reconstructedText.slice(this.baseReconstructedText.length);
      if ((lastKey === VIRTUAL_KEY.ENTER || lastKey === VIRTUAL_KEY.SPACE) &&
          spelledString.trim() !== '') {
        this.triggerAbbreviationExpansion();
      }
      if (this._chipTypedText === null) {
        this._chipTypedText = Array(this._chips.length).fill(null);
      }
      // Word is already being spelled out.
      if (spelledString.length === 0) {
        this.baseReconstructedText = this.latestReconstructedString;
      } else {
        this._chipTypedText[this._focusChipIndex!] = spelledString;
        updateButtonBoxesForElements(this.instanceId, this.buttons);
        if (LexiconComponent.isValidWord(spelledString.trim())) {
          console.log(
              `Spelled string is valid word '${spelledString}': trigger AE`);
          this.triggerAbbreviationExpansion(/* isInFlight= */ true);
        }
      }
    } else if (this.state === State.FOCUSED_ON_WORD_CHIP) {
      if (lastKey === VIRTUAL_KEY.ENTER || lastKey === VIRTUAL_KEY.SPACE) {
        this.onSpeakAsIsButtonClicked();
      }
      if (this._chipTypedText === null) {
        this._chipTypedText = Array(this._chips.length).fill(null);
      }
      this._chipTypedText[this._focusChipIndex!] =
          reconstructedText.slice(this.baseReconstructedText.length);
      updateButtonBoxesForElements(this.instanceId, this.buttons);
    }
    this.scaleInputTextFontSize();
  }

  private scaleInputTextFontSize(): void {
    // TODO(cais): Limit on over all text length.
    // TODO(cais): Add unit tests.
    if (!this.inputTextDiv) {
      return;
    }
    const divElement = this.inputTextDiv.nativeElement;
    const textLength = this.inputString.length;
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
      divElement.style.fontSize = `${fontSize.toFixed(1)}px`;
      divElement.style.lineHeight = `${lineHeight.toFixed(1)}px`;
    } else {
      divElement.style.fontSize = `${INPUT_TEXT_BASE_FONT_SIZE}px`;
      divElement.style.lineHeight = `${INPUT_TEXT_BASE_FONT_SIZE}px`;
    }
  }

  onExpandButtonClicked(event?: Event) {
    this.triggerAbbreviationExpansion();
  }

  private triggerAbbreviationExpansion(isInFlight: boolean = false) {
    const precedingText = '';
    const eraserLength = this.inputString.length;

    let abbreviationSpec = this.getNonSpellingAbbreviationExpansion();
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
  }

  onChipClicked(index: number) {
    this._focusChipIndex = index;
    this.baseReconstructedText = this.latestReconstructedString;
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
      this.eventLogger.logAbbreviatonExpansionWordRefinementRequest(
          getPhraseStats(this._chips.map(chip => chip.text).join(' ')),
          this._focusChipIndex);
      this.fillMaskTriggers.next({
        speechContent: this.contextStrings.join('|'),
        phraseWithMask,
        maskInitial,
      });
      this.state = State.FOCUSED_ON_WORD_CHIP;
    }
  }

  onChipCutClicked(event: Event, index: number) {
    this.cutChipsAtIndex(index);
  }

  private cutChipsAtIndex(index: number, appendLastChar = false) {
    const baseText = ExternalEventsComponent.internalText;
    let text =
        this._chips.slice(0, index + 1).map(chip => chip.text).join(' ').trim();
    if (appendLastChar) {
      const lastChar =
          ExternalEventsComponent
              .internalText[ExternalEventsComponent.internalText.length - 1];
      if (lastChar !== ' ') {
        text += ' ';
      }
      text += lastChar;
    }
    ExternalEventsComponent.appendString(
        text, /* isExternal= */ false,
        /* ensureEndsInSpace= */ !appendLastChar);
    this.inputString =
        ExternalEventsComponent.internalText.slice(baseText.length);
    this.state = State.ENTERING_BASE_TEXT;
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
    } else if (this.state === State.ENTERING_BASE_TEXT) {
      return this.inputString;
    }
    return text.trim();
  }

  get hasOnlyOneTextPredictionChip(): boolean {
    return this._chips !== null && this._chips.length === 1 &&
        this._chips[0].isTextPrediction === true &&
        (this.latestReconstructedString.length ===
         this.baseReconstructedText.length);
  }

  onSpeakAsIsButtonClicked(event?: Event) {
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
    let text = this.effectivePhrase;
    if (!text) {
      return;
    }
    if (!endsWithSentenceEndPunctuation(text)) {
      text += '.';
    }
    text += ' ';
    this.eventLogger.logInputBarInjectButtonClick(getPhraseStats(text));
    const injectedKeys: Array<string|VIRTUAL_KEY> = [];
    injectedKeys.push(...text.split(''));
    injectKeys(injectedKeys, text);
    this.textEntryEndSubject.next({
      text,
      timestampMillis: Date.now(),
      isFinal: true,
      injectedKeys,
    });
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
    this.baseReconstructedText = '';
    this.cutText = '';
  }

  private updateInputString(newStringValue: string) {
    this.inputString = newStringValue;
    this.inputStringChanged.next(this.inputString);
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
}
