/** Quick phrase list for direct selection. */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {expand, throttleTime} from 'rxjs/operators';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
import {SpeakFasterService, TextPredictionResponse} from '../speakfaster-service';

const MAX_NUM_PREDICTIONS = 4;

const THROTTLE_TIME_MILLIS = 100;

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
  @Output() expandButtonClicked: EventEmitter<Event> = new EventEmitter();
  @Output() spellButtonClicked: EventEmitter<Event> = new EventEmitter();
  @Output() abortButtonClicked: EventEmitter<Event> = new EventEmitter();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  // TODO(cais): Move the Expand button here as well.

  readonly _predictions: string[] = [];

  private readonly textPredictionTriggers: Subject<string> = new Subject;
  private latestCompletedRequestTimestamp: number = -1;

  constructor(
      private speakFasterService: SpeakFasterService,
      private eventLogger: HttpEventLogger) {}

  ngOnInit() {
    // TODO(cais): Resolve interaction with keyboard word prediction.
    // this.textPredictionTriggers.pipe(throttleTime(THROTTLE_TIME_MILLIS))
    this.textPredictionTriggers.subscribe(textPrefix => {
      this.getTextPredictions(textPrefix);
    });
  }

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
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
    // TODO(cais): Unit test for upper cases.
    const textPrefix = changes.inputString.currentValue.toLocaleLowerCase();
    this.textPredictionTriggers.next(textPrefix);
  }

  private getTextPredictions(textPrefix: string) {
    // TODO(cais): Add event logging.
    const t = new Date().getTime();
    this.speakFasterService
        .textPrediction({
          userId: this.userId,
          contextTurns: [],  // TODO(cais):
          textPrefix,
        })
        .subscribe(
            (data: TextPredictionResponse) => {
              if (t <= this.latestCompletedRequestTimestamp) {
                // Out-of-order responses.
                return;
              }
              if (!data.outputs) {
                return;
              }
              this._predictions.splice(0);
              this._predictions.push(
                  ...data.outputs.slice(0, MAX_NUM_PREDICTIONS));
              this.latestCompletedRequestTimestamp = t;
            },
            error => {
              console.error('*** Text prediction error:', error);
              this._predictions.splice(0);
            });
  }

  onPredictionButtonClicked(event: Event, index: number) {
    // TODO(cais): Add event logging.
    const suggestionSelection = this.predictions[index] + ' ';
    this.inputBarControlSubject.next({suggestionSelection});
    this.reset();
  }

  /** Resets state, including empties the predictions. */
  private reset() {
    this._predictions.splice(0);
  }

  public get predictions(): string[] {
    return this._predictions.slice(0);
  }

  onExpandButtonClicked(event?: Event) {
    // TODO(cais): Add unit test.
    this.expandButtonClicked.emit(event);
  }

  onSpellButtonClicked(event?: Event) {
    // TODO(cais): Add unit test.
    this.spellButtonClicked.emit(event);
  }

  onAbortButtonClicked(event?: Event) {
    // TODO(cais): Add unit test.
    this.abortButtonClicked.emit(event);
  }
}
