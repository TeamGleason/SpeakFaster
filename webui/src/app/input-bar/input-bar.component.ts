/** An input bar, with related functional buttons. */
import {AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {Subject, Subscription} from 'rxjs';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {ExternalEventsComponent, repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
import {FillMaskRequest, SpeakFasterService} from '../speakfaster-service';
import {AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {AddContextualPhraseResponse} from '../types/contextual_phrase';
import {TextEntryEndEvent} from '../types/text-entry';

export enum State {
  ENTERING_BASE_TEXT = 'ENTERING_BASE_TEXT',
  SHOWING_WORD_CHIPS = 'SHOWING_WORD_CHIPS',
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

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  state = State.ENTERING_BASE_TEXT;
  inputString: string = '';

  private textEntryEndSubjectSubscription?: Subscription;
  private inputBarChipsSubscription?: Subscription;

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
    ExternalEventsComponent.registerKeypressListener(
        this.listenToKeypress.bind(this));
    this.inputBarChipsSubject.subscribe((event: InputBarChipsEvent) => {
      this._focusChipIndex = null;
      this._chips.splice(0);
      this._chips.push(...event.chips);
      if (this._chips.length > 0) {
        this.state = State.SHOWING_WORD_CHIPS;
      }
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
    updateButtonBoxesToEmpty(this.instanceId);
  }

  public listenToKeypress(keySequence: string[], reconstructedText: string):
      void {
    this.updateInputString(reconstructedText);
  }

  onExpandButtonClicked(event: Event) {
    const precedingText = '';
    const text = this.inputString.trim();
    const eraserLength = text.length;
    const abbreviationSpec: AbbreviationSpec = {
      tokens: text.split('').map(char => ({
                                   value: char,
                                   isKeyword: false,
                                 })),
      readableString: text,
      eraserSequence: repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, eraserLength),
      precedingText,
      lineageId: createUuid(),
    };
    console.log('Abbreviation expansion triggered:', abbreviationSpec);
    this.abbreviationExpansionTriggers.next(
        {abbreviationSpec, requestExpansion: true});
    return;
  }

  onChipClicked(index: number) {
    this._focusChipIndex = index;
    const tokens: string[] = this._chips.map(chip => chip.text);
    tokens[index] = '_';
    const phraseWithMask = tokens.join(' ');
    const maskInitial = this._chips[index].text[0];
    this.fillMaskTriggers.next({
      speechContent: this.contextStrings.join('|'),
      phraseWithMask,
      maskInitial,
    });
  }

  onClearButtonClicked(event: Event) {
    if (this.state === State.ENTERING_BASE_TEXT) {
      this.textEntryEndSubject.next({
        text: '',
        timestampMillis: new Date().getTime(),
        isFinal: true,
        isAborted: true,
      });
    } else if (this.state === State.SHOWING_WORD_CHIPS) {
      this.state = State.ENTERING_BASE_TEXT;
    }
  }

  onSpeakAsIsButtonClicked(event: Event) {
    let text: string = '';
    if (this.state === State.SHOWING_WORD_CHIPS) {
      text = this._chips.map(chip => chip.text).join(' ');
    } else if (this.state === State.ENTERING_BASE_TEXT) {
      if (!this.inputString.trim()) {
        return;
      }
      text = this.inputString.trim();
    }
    if (text) {
      this.textEntryEndSubject.next({
        text,
        timestampMillis: Date.now(),
        isFinal: true,
        inAppTextToSpeechAudioConfig: {
          volume_gain_db: 0,
        }
      });
    }
  }

  onFavoriteButtonClicked(event: Event) {
    if (!this.inputString.trim()) {
      return;
    }
    this.state = State.ADD_CONTEXTUAL_PHRASE_PENDING;
    this.speakFasterService
        .addContextualPhrase({
          userId: this.userId,
          contextualPhrase: {
            phraseId: '',  // For AddContextualPhraseRequest, this is ignored.
            text: this.inputString.trim(),
            tags: ['favorite'],  // TODO(cais): Do not hardcode this.
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
    if (cleanText) {
      this.updateInputString('');
    }
  }

  private updateInputString(newStringValue: string) {
    this.inputString = newStringValue;
    updateButtonBoxesForElements(this.instanceId, this.buttons);
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
