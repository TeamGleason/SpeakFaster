/** An input bar, with related functional buttons. */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, QueryList, ViewChild, ViewChildren} from '@angular/core';
import {Subject, Subscription} from 'rxjs';
import {debounceTime} from 'rxjs/operators';
import {injectKeys, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {endsWithSentenceEndPunctuation, keySequenceEndsWith} from 'src/utils/text-utils';
import {createUuid} from 'src/utils/uuid';

import {getPhraseStats, HttpEventLogger} from '../event-logger/event-logger-impl';
import {ExternalEventsComponent, repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
import {LexiconComponent, LoadLexiconRequest} from '../lexicon/lexicon.component';
import {FillMaskRequest, SpeakFasterService} from '../speakfaster-service';
import {AbbreviationSpec, AbbreviationToken, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {TextEntryEndEvent} from '../types/text-entry';

export enum State {
  ENTERING_BASE_TEXT = 'ENTERING_BASE_TEXT',
  CHOOSING_LETTER_CHIP = 'CHOOSING_LETTER_CHIP',
  FOCUSED_ON_LETTER_CHIP = 'FOCUSED_ON_LETTER_CHIP',
  CHOOSING_PHRASES = 'CHOOSING_PHRASES',
  CHOOSING_WORD_CHIP = 'CHOOSING_WORD_CHIP',
  FOCUSED_ON_WORD_CHIP = 'FOCUSED_ON_WORD_CHIP',
  AFTER_CUT = 'AFTER_CUT',
  ADD_CONTEXTUAL_PHRASE_PENDING = 'ADD_CONTEXTUAL_PHRASE_PENDING',
  ADD_CONTEXTUAL_PHRASE_SUCCESS = 'ADD_CONTEXTUAL_PHRASE_SUCCESS',
  ADD_CONTEXTUAL_PHRASE_ERROR = 'ADD_CONTEXTUAL_PHRASE_ERROR',
}

/** Specs for a clickable chip inside the input bar. */
export interface InputBarChipSpec {
  // Text content of the chip.
  text: string;
}

/** An event that updates the clickable chips in the input bar. */
export interface InputBarControlEvent {
  chips?: InputBarChipSpec[];

  // Clear all text and chips.
  clearAll?: boolean;
}

function removePeriods(str: string) {
  return str.replace(/\./g, '');
}

// Abbreviation expansion can be triggered by entering any of the the
// abbreviation following key sequences.
// TODO(#49): This can be generalized and made configurable.
// TODO(#49): Explore continuous AE without explicit trigger, perhaps
// added by heuristics for detecting abbreviations vs. words.
export const ABBRVIATION_EXPANSION_TRIGGER_KEY_SEQUENCES: Array<string[]> =
    [[VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE], [VIRTUAL_KEY.ENTER]];

const INPUT_TEXT_BASE_FONT_SIZE = 30;
const INPUT_TEXT_FONT_SIZE_SCALING_FACTORS = [1.0, 1 / 1.3, 1 / 1.6, 1 / 1.8];
const INPUT_TEXT_FONT_SIZE_SCALING_LENGTH_TICKS = [0, 50, 120, 280];

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
  private static readonly ABBREVIATION_MAX_PROPER_LENGTH = 10;
  // Maximum number of allowed leading (head) keywords.
  private static readonly ABBREVIATION_MAX_HEAD_KEYWORDS = 4;
  // Maximum allowed length of the entire abbreviation, including the leading
  // keywords.
  private static readonly ABBREVIATION_MAX_TOTAL_LENGTH = 50;
  private static readonly IN_FLIGHT_AE_TRIGGER_DEBOUNCE_MILLIS = 600;

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
  @Output() inputStringChanged: EventEmitter<string> = new EventEmitter();

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
  private keypressListener = this.listenToKeypress.bind(this);
  private readonly inFlightAbbreviationExpansionTriggers:
      Subject<InputAbbreviationChangedEvent> = new Subject();

  constructor(
      public speakFasterService: SpeakFasterService,
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
    ExternalEventsComponent.registerKeypressListener(this.keypressListener);
    this.inputBarChipsSubscription =
        this.inputBarControlSubject.subscribe((event: InputBarControlEvent) => {
          if (event.clearAll) {
            this.baseReconstructedText = this.latestReconstructedString;
            this.resetState(/* cleanText= */ true, /* resetBase= */ false);
          } else if (event.chips !== undefined) {
            this._focusChipIndex = null;
            this._chips.splice(0);
            this._chips.push(...event.chips);
            if (this._chipTypedText !== null) {
              for (let i = 0; i < this._chipTypedText.length; ++i) {
                if (this._chipTypedText[i] !== null) {
                  this._chips[i].text = this._chipTypedText[i]!;
                }
              }
            }
            if (this._chips.length > 0) {
              this.state = State.CHOOSING_WORD_CHIP;
              this.eventLogger.logAbbreviationExpansionStartWordRefinementMode(
                  getPhraseStats(this._chips.map(chip => chip.text).join(' ')));
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
  }

  public listenToKeypress(keySequence: string[], reconstructedText: string):
      void {
    const lastKey = keySequence[keySequence.length - 1];
    this.latestReconstructedString = reconstructedText;
    if (this.state === State.ENTERING_BASE_TEXT ||
        this.state === State.CHOOSING_PHRASES ||
        this.state === State.AFTER_CUT) {
      if (this.state === State.AFTER_CUT) {
        this.updateInputString(
            this.cutText +
            reconstructedText.slice(this.baseReconstructedText.length));
      } else {
        this.updateInputString(
            reconstructedText.slice(this.baseReconstructedText.length));
      }
      if (this.inputStringIsCompatibleWithAbbreviationExpansion &&
          ABBRVIATION_EXPANSION_TRIGGER_KEY_SEQUENCES.some(
              triggerKeySeqwuence =>
                  keySequenceEndsWith(keySequence, triggerKeySeqwuence))) {
        this.triggerAbbreviationExpansion();
      }
    } else if (this.state === State.CHOOSING_WORD_CHIP) {
      this.cutText = this._chips.map(chip => chip.text).join(' ') + ' ';
      this.inputString = this.cutText + lastKey;
      this._chips.splice(0);
      this.state = State.AFTER_CUT;
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
        injectKeys([VIRTUAL_KEY.SPACE]);
        this.baseReconstructedText = this.latestReconstructedString.slice(
            0, this.latestReconstructedString.length - 1);
        this._focusChipIndex = matchingChipIndices[0];
        if (this._chipTypedText === null) {
          this._chipTypedText = Array(this._chips.length).fill(null);
        }
        this._chipTypedText[this._focusChipIndex] = typedLetter;
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
            value: removePeriods(this._chipTypedText![i]!),
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
        readableString:
            tokens.map(token => removePeriods(token.value)).join(' '),
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
        value: removePeriods(keyword),
        isKeyword: true,
      });
      readableString += removePeriods(keyword) + ' ';
    });
    readableString += abbrevText;
    tokens.push({
      value: abbrevText,
      isKeyword: false,
    })
    return {
      tokens, readableString, precedingText: '',
          eraserSequence: repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, eraserLength),
          lineageId: createUuid(),
    }
  }

  onSpellButtonClicked(event: Event) {
    const abbreviation = this.inputString.trim();
    this.inputBarControlSubject.next({
      chips: abbreviation.split('').map(char => ({text: char})),
    });
    this.state = State.CHOOSING_LETTER_CHIP;
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
      // Signal to soft keyboard a word boundary. TODO(cais): Decide.
      injectKeys([VIRTUAL_KEY.SPACE]);
      const firstLetter = this._chips[index].text[0];
      this.loadPrefixedLexiconRequestSubject.next({
        prefix: firstLetter,
      });
    } else if (
        this.state === State.CHOOSING_WORD_CHIP ||
        this.state === State.FOCUSED_ON_WORD_CHIP) {
      // TODO(cais): Add unit tests.
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
    if (this.state === State.FOCUSED_ON_WORD_CHIP) {
      this.cutText =
          this._chips.slice(0, index + 1).map(chip => chip.text).join(' ') +
          ' ';
      this.inputString = this.cutText;
      this.state = State.AFTER_CUT;
      this.baseReconstructedText = this.latestReconstructedString;
    }
  }

  onAbortButtonClicked(event: Event) {
    if (this.state === State.ENTERING_BASE_TEXT ||
        this.state === State.CHOOSING_PHRASES ||
        this.state === State.AFTER_CUT) {
      this.textEntryEndSubject.next({
        text: '',
        timestampMillis: new Date().getTime(),
        isFinal: true,
        isAborted: true,
      });
    } else if (
        this.state === State.CHOOSING_WORD_CHIP ||
        this.state === State.FOCUSED_ON_WORD_CHIP ||
        this.state === State.CHOOSING_LETTER_CHIP ||
        this.state === State.FOCUSED_ON_LETTER_CHIP) {
      this.state = State.ENTERING_BASE_TEXT;
    }
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
      console.log('*** words =', words);  // DEBUG
      return words.join(' ');
    } else if (
        this.state === State.ENTERING_BASE_TEXT ||
        this.state === State.AFTER_CUT) {
      return this.inputString;
    }
    text = text.trim();
    return text;
  }

  onSpeakAsIsButtonClicked(event?: Event) {
    const text = this.effectivePhrase;
    if (!text) {
      return;
    }
    this.eventLogger.logInputBarSpeakButtonClick(getPhraseStats(text));
    this.textEntryEndSubject.next({
      text,
      timestampMillis: Date.now(),
      isFinal: true,
      inAppTextToSpeechAudioConfig: {}
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
    injectKeys(injectedKeys);
    this.textEntryEndSubject.next({
      text,
      timestampMillis: Date.now(),
      isFinal: true,
      injectedKeys,
    });
  }

  private resetState(clearText: boolean = true, resetBase: boolean = true) {
    this.state = State.ENTERING_BASE_TEXT;
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

  get inputStringIsNotEmpty(): boolean {
    const trimmedLength = this.inputString.trim().length;
    return trimmedLength > 0;
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
        lastTokenLength > InputBarComponent.ABBREVIATION_MAX_PROPER_LENGTH;
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
}
