/** An input bar, with related functional buttons. */
import {AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {Subject, Subscription} from 'rxjs';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {ExternalEventsComponent, repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
import {FillMaskRequest, SpeakFasterService} from '../speakfaster-service';
import {AbbreviationSpec, AbbreviationToken, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {AddContextualPhraseResponse} from '../types/contextual_phrase';
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
}

/** An event that updates the clickable chips in the input bar. */
export interface InputBarChipsEvent {
  chips: InputBarChipSpec[];
}

@Component({
  selector: 'app-input-bar-component',
  templateUrl: './input-bar.component.html',
})
export class InputBarComponent implements OnInit, AfterViewInit, OnDestroy {
  private static readonly _NAME = 'InputBarComponent';
  private readonly instanceId = InputBarComponent._NAME + '_' + createUuid();
  private static readonly STATE_REST_DELAY_MILLIS = 2000;

  @Input() userId!: string;
  @Input() contextStrings!: string[];
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input()
  abbreviationExpansionTriggers!: Subject<InputAbbreviationChangedEvent>;
  @Input() fillMaskTriggers!: Subject<FillMaskRequest>;
  @Input() inputBarChipsSubject!: Subject<InputBarChipsEvent>;

  private readonly _chips: InputBarChipSpec[] = [];
  private _focusChipIndex: number|null = null;
  private _chipTypedText: Array<string|null>|null = null;

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  state = State.ENTERING_BASE_TEXT;
  inputString: string = '';
  private latestReconstructedString = '';
  private baseReconstructedText: string = '';

  private textEntryEndSubjectSubscription?: Subscription;
  private inputBarChipsSubscription?: Subscription;
  private abbreviationExpansionTriggersSubscription?: Subscription;
  private keypressListener = this.listenToKeypress.bind(this);

  constructor(public speakFasterService: SpeakFasterService) {}

  ngOnInit() {
    this.textEntryEndSubjectSubscription = this.textEntryEndSubject.subscribe(
        (textInjection: TextEntryEndEvent) => {
          if (textInjection.isFinal) {
            this.resetState();
          } else {
            this.updateInputString(textInjection.text);
          }
        });
    ExternalEventsComponent.registerKeypressListener(this.keypressListener);
    this.inputBarChipsSubscription =
        this.inputBarChipsSubject.subscribe((event: InputBarChipsEvent) => {
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
          }
        });
    this.abbreviationExpansionTriggersSubscription =
        this.abbreviationExpansionTriggers.subscribe(event => {
          this.state = State.CHOOSING_PHRASES;
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
    updateButtonBoxesToEmpty(this.instanceId);
    ExternalEventsComponent.unregisterKeypressListener(this.keypressListener);
  }

  public listenToKeypress(keySequence: string[], reconstructedText: string):
      void {
    this.latestReconstructedString = reconstructedText;
    if (this.state === State.ENTERING_BASE_TEXT) {
      this.updateInputString(reconstructedText);
    } else if (this.state === State.FOCUSED_ON_LETTER_CHIP) {
      if (this._chipTypedText === null) {
        this._chipTypedText = Array(this._chips.length).fill(null);
      }
      this._chipTypedText[this._focusChipIndex!] =
          reconstructedText.slice(this.baseReconstructedText.length);
    } else if (this.state === State.FOCUSED_ON_WORD_CHIP) {
      if (this._chipTypedText === null) {
        this._chipTypedText = Array(this._chips.length).fill(null);
      }
      this._chipTypedText[this._focusChipIndex!] =
          reconstructedText.slice(this.baseReconstructedText.length);
    }
  }

  onExpandButtonClicked(event: Event) {
    const precedingText = '';
    const text = this.inputString.trim();
    const eraserLength = text.length;
    let abbreviationSpec: AbbreviationSpec = {
      tokens: text.split('').map(char => ({
                                   value: char,
                                   isKeyword: false,
                                 })),
      readableString: text,
      eraserSequence: repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, eraserLength),
      precedingText,
      lineageId: createUuid(),
    };
    if (this.state === State.FOCUSED_ON_LETTER_CHIP) {
      const tokens: AbbreviationToken[] = [];
      let pendingChars: string = '';
      for (let i = 0; i < this._chips.length; ++i) {
        const isSpelled =
            this._chipTypedText !== null && this._chipTypedText[i] !== null;
        if (isSpelled) {
          // Word is spelled out.
          if (pendingChars) {
            tokens.push({
              value: pendingChars,
              isKeyword: false,
            });
            pendingChars = '';
          }
          tokens.push({
            value: this._chipTypedText![i]!,
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
        readableString: tokens.map(token => token.value).join(' '),
        precedingText,
        eraserSequence: repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, eraserLength),
        lineageId: createUuid(),  // TODO(cais): Is this correct?
      };
    }
    console.log('Abbreviation expansion triggered:', abbreviationSpec);
    this.abbreviationExpansionTriggers.next(
        {abbreviationSpec, requestExpansion: true});
    return;
  }

  onSpellButtonClicked(event: Event) {
    const abbreviation = this.inputString.trim();
    this.inputBarChipsSubject.next({
      chips: abbreviation.split('').map(char => ({text: char})),
    });
    this.state = State.CHOOSING_LETTER_CHIP;
  }

  onChipClicked(index: number) {
    this._focusChipIndex = index;
    this.baseReconstructedText = this.latestReconstructedString;
    if (this.state === State.CHOOSING_LETTER_CHIP) {
      // TODO(cais): Add unit tests.
      this.state = State.FOCUSED_ON_LETTER_CHIP;
    } else if (this.state === State.CHOOSING_WORD_CHIP) {
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
      this.fillMaskTriggers.next({
        speechContent: this.contextStrings.join('|'),
        phraseWithMask,
        maskInitial,
      });
      this.state = State.FOCUSED_ON_WORD_CHIP;
    }
  }

  onClearButtonClicked(event: Event) {
    if (this.state === State.ENTERING_BASE_TEXT ||
        this.state === State.CHOOSING_PHRASES) {
      this.textEntryEndSubject.next({
        text: '',
        timestampMillis: new Date().getTime(),
        isFinal: true,
        isAborted: true,
      });
    } else if (
        this.state === State.CHOOSING_WORD_CHIP ||
        this.state === State.FOCUSED_ON_WORD_CHIP) {
      this.state = State.ENTERING_BASE_TEXT;
    }
  }

  private reCreatedTextMaybeFromChips(): string {
    let text: string = '';
    if (this.state === State.CHOOSING_WORD_CHIP ||
        this.state === State.FOCUSED_ON_WORD_CHIP) {
      const words: string[] = this._chips.map(chip => chip.text);
      if (this._focusChipIndex && this._chipTypedText !== null) {
        for (let i = 0; i < this._chipTypedText.length; ++i) {
          if (this._chipTypedText[i] !== null) {
            words[i] = this._chipTypedText[i]!;
          }
        }
      }
      return words.join(' ');
    } else if (this.state === State.ENTERING_BASE_TEXT) {
      return this.inputString.trim();
    }
    text = text.trim();
    return text;
  }

  onSpeakAsIsButtonClicked(event: Event) {
    const text = this.reCreatedTextMaybeFromChips();
    if (!text) {
      return;
    }
    this.textEntryEndSubject.next({
      text,
      timestampMillis: Date.now(),
      isFinal: true,
      inAppTextToSpeechAudioConfig: {
        volume_gain_db: 0,
      }
    });
  }

  onFavoriteButtonClicked(event: Event) {
    const text = this.reCreatedTextMaybeFromChips();
    if (!text) {
      return;
    }
    this.state = State.ADD_CONTEXTUAL_PHRASE_PENDING;
    this.speakFasterService
        .addContextualPhrase({
          userId: this.userId,
          contextualPhrase: {
            phraseId: '',  // For AddContextualPhraseRequest, this is ignored.
            text,
            tags: ['favorite'],  // TODO(cais): Do not hardcode this tag
          }
        })
        .subscribe(
            (data: AddContextualPhraseResponse) => {
              this.state = State.ADD_CONTEXTUAL_PHRASE_SUCCESS;
              setTimeout(() => {
                this.textEntryEndSubject.next({
                  text: '',
                  timestampMillis: new Date().getTime(),
                  isFinal: true,
                  isAborted: true,
                });
                this.resetState();
              }, InputBarComponent.STATE_REST_DELAY_MILLIS);
            },
            error => {
              setTimeout(
                  () => this.resetState(false),
                  InputBarComponent.STATE_REST_DELAY_MILLIS);
            });
  }

  private resetState(cleanText: boolean = true) {
    this.state = State.ENTERING_BASE_TEXT;
    this._focusChipIndex = null;
    this._chipTypedText = null;
    if (cleanText) {
      this.updateInputString('');
    }
  }

  private updateInputString(newStringValue: string) {
    this.inputString = newStringValue;
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

  get inputStringNonEmpty(): boolean {
    return this.inputString.trim().length > 0;
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
    // TODO(cais): Implement favoriting phrases.
  }
}
