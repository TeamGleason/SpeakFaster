/** Quick phrase list for direct selection. */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {throttleTime} from 'rxjs/operators';
import {LONG_DWELL_ATTRIBUTE_KEY, LONG_DWELL_ATTRIBUTE_VALUE, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {endsWithPunctuation} from 'src/utils/text-utils';
import {createUuid} from 'src/utils/uuid';

import {getPhraseStats, HttpEventLogger} from '../event-logger/event-logger-impl';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
import {getAppSettings} from '../settings/settings';
import {SpeakFasterService, TextPredictionResponse} from '../speakfaster-service';

// The default value for the number of word suggestions, used when the value is
// unavailable from app settings.
const DEFAULT_NUM_WORD_SUGGESTIONS = 4;

const THROTTLE_TIME_MILLIS = 50;

@Component({
  selector: 'input-text-predictions-component',
  templateUrl: './input-text-predictions.component.html',
})
export class InputTextPredictionsComponent implements AfterViewInit, OnInit,
                                                      OnChanges, OnDestroy {
  private static readonly _NAME = 'InputTextPredictionsComponent';

  private readonly instanceId =
      InputTextPredictionsComponent._NAME + '_' + createUuid();

  @Input() userId!: string;
  @Input() contextStrings!: string[];
  @Input() inputString!: string;
  @Input() inputBarControlSubject!: Subject<InputBarControlEvent>;
  @Input() showExpandButton!: boolean;
  @Input() showSpellButton!: boolean;
  @Input() showAbortButton!: boolean;
  @Output() expandButtonClicked: EventEmitter<Event> = new EventEmitter();
  @Output() spellButtonClicked: EventEmitter<Event> = new EventEmitter();
  @Output() abortButtonClicked: EventEmitter<Event> = new EventEmitter();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  readonly _predictions: string[] = [];
  private numWordSuggestions = DEFAULT_NUM_WORD_SUGGESTIONS;

  private readonly textPredictionTriggers: Subject<string> = new Subject;
  private latestCompletedRequestTimestamp: number = -1;

  constructor(
      private speakFasterService: SpeakFasterService,
      private eventLogger: HttpEventLogger) {}

  ngOnInit() {
    // TODO(cais): Resolve interaction with keyboard word prediction.
    this.textPredictionTriggers.pipe(throttleTime(THROTTLE_TIME_MILLIS))
        .subscribe(textPrefix => {
          this.getTextPredictions(textPrefix);
        });
  }

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          this.updateButtonBoxes();
        });
    this.updateButtonBoxes();
  }

  private updateButtonBoxes() {
    const visibleList: QueryList<ElementRef<HTMLElement>> = new QueryList();
    const visibleElementRefs: Array<ElementRef<HTMLElement>> = [];
    this.clickableButtons.forEach(elementRef => {
      const element = elementRef.nativeElement;
      if (element.classList.contains('prediction-button')) {
        element.setAttribute(
            LONG_DWELL_ATTRIBUTE_KEY, LONG_DWELL_ATTRIBUTE_VALUE);
      }
      if (!element.classList.contains('invisible')) {
        visibleElementRefs.push(elementRef);
      }
    });
    visibleList.reset(visibleElementRefs);
    updateButtonBoxesForElements(this.instanceId, visibleList);
  }

  ngOnDestroy(): void {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes.inputString) {
      return;
    }
    if (!changes.inputString.currentValue) {
      this.reset();
      return;
    }
    const textPrefix = changes.inputString.currentValue.toLocaleLowerCase();
    this.textPredictionTriggers.next(textPrefix);
  }

  private getTextPredictions(textPrefix: string) {
    // TODO(cais): Add event logging.
    const t = new Date().getTime();
    // Find the last punctuation character in the prefix.
    let i = textPrefix.length - 1;
    for (; i >= 0; --i) {
      if (endsWithPunctuation(textPrefix.substring(0, i + 1))) {
        break;
      }
    }
    // If the last non-alphanumeric char is not followed by a whitespace, add a
    // space after it. This ensures that a prefix such as "hi," will trigger
    // next-word prediction, instead of word completion. It also ensures that a
    // prefix such as "hi,t" will trigger word completion with "hi, " as the
    // preceding sequence of words.
    if (i >= 0 &&
        (i === textPrefix.length - 1 || !textPrefix[i + 1].match(/\s/))) {
      textPrefix =
          textPrefix.substring(0, i + 1) + ' ' + textPrefix.substring(i + 1);
    }
    this.speakFasterService
        .textPrediction({
          userId: this.userId,
          // TODO(cais): Add more context to inputs for text prediction.
          contextTurns: [],
          textPrefix,
        })
        .subscribe(
            async (data: TextPredictionResponse) => {
              if (t <= this.latestCompletedRequestTimestamp) {
                // Out-of-order responses.
                return;
              }
              if (!data.outputs) {
                return;
              }
              this._predictions.splice(0);
              if (!this.inputString) {
                return;
              }
              const numWordSuggestions =
                  await this.getNumWordSuggestionsFromSettings();
              this._predictions.push(
                  ...data.outputs.slice(0, numWordSuggestions));
              this.latestCompletedRequestTimestamp = t;
            },
            error => {
              console.error('Text prediction error:', error);
              this._predictions.splice(0);
            });
  }

  onPredictionButtonClicked(event: Event, index: number) {
    const suggestionSelection = this.predictions[index] + ' ';
    this.eventLogger.logTextPredictionSelection(
        getPhraseStats(suggestionSelection), index);
    this.inputBarControlSubject.next({suggestionSelection});
    this.reset();
  }

  /** Resets state, including empties the predictions. */
  private reset() {
    this._predictions.splice(0);
  }

  private async getNumWordSuggestionsFromSettings(): Promise<number> {
    const appSettings = await getAppSettings();
    if (!appSettings || !appSettings.numWordSuggestions) {
      return DEFAULT_NUM_WORD_SUGGESTIONS;
    }
    return appSettings.numWordSuggestions;
  }

  public get predictions(): string[] {
    return this._predictions.slice(0);
  }

  onExpandButtonClicked(event?: Event) {
    this.expandButtonClicked.emit(event);
  }

  onSpellButtonClicked(event?: Event) {
    this.spellButtonClicked.emit(event);
  }

  onAbortButtonClicked(event?: Event) {
    this.abortButtonClicked.emit(event);
  }
}
