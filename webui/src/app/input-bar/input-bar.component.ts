/** An input bar, with related functional buttons. */
import {AfterViewInit, Component, ElementRef, Input, OnChanges, OnInit, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {updateButtonBoxesForElements} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {ExternalEventsComponent, repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
import {SpeakFasterService} from '../speakfaster-service';
import {AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {AddContextualPhraseResponse} from '../types/contextual_phrase';
import {TextEntryEndEvent} from '../types/text-entry';

export enum State {
  READY = 'READY',
  ADD_CONTEXTUAL_PHRASE_PENDING = 'ADD_CONTEXTUAL_PHRASE_PENDING',
  ADD_CONTEXTUAL_PHRASE_SUCCESS = 'ADD_CONTEXTUAL_PHRASE_SUCCESS',
  ADD_CONTEXTUAL_PHRASE_ERROR = 'ADD_CONTEXTUAL_PHRASE_ERROR',
}

@Component({
  selector: 'app-input-bar-component',
  templateUrl: './input-bar.component.html',
})
export class InputBarComponent implements OnInit, AfterViewInit {
  private static readonly _NAME = 'InputBarComponent';
  private readonly instanceId = InputBarComponent._NAME + '_' + createUuid();
  private static readonly STATE_REST_DELAY_MILLIS = 2000;

  @Input() userId!: string;
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input()
  abbreviationExpansionTriggers!: Subject<InputAbbreviationChangedEvent>;

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  state = State.READY;
  inputString: string = '';

  constructor(public speakFasterService: SpeakFasterService) {}

  ngOnInit() {
    this.textEntryEndSubject.subscribe((textInjection: TextEntryEndEvent) => {
      if (textInjection.isFinal) {
        this.resetState();
      } else {
        this.updateInputString(textInjection.text);
      }
    });
    ExternalEventsComponent.registerKeypressListener(
        this.listenToKeypress.bind(this));
  }

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.buttons);
    this.buttons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
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

  onClearButtonClicked(event: Event) {
    this.textEntryEndSubject.next({
      text: '',
      timestampMillis: new Date().getTime(),
      isFinal: true,
      isAborted: true,
    });
  }

  onSpeakAsIsButtonClicked(event: Event) {
    if (!this.inputString.trim()) {
      return;
    }
    const text = this.inputString.trim();
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
    this.state = State.READY;
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
