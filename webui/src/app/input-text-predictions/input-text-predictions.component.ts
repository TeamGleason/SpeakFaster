/** Quick phrase list for direct selection. */
import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, OnInit, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
import {SpeakFasterService, TextPredictionResponse} from '../speakfaster-service';

const MAX_NUM_PREDICTIONS = 3;

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

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  readonly _predictions: string[] = [];

  constructor(
      private speakFasterService: SpeakFasterService,
      private cdr: ChangeDetectorRef, private eventLogger: HttpEventLogger) {}

  ngOnInit() {}

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
    const textPrefix = changes.inputString.currentValue;
    this.getTextPredictions(textPrefix);
  }

  private getTextPredictions(textPrefix: string) {
    // TODO(cais): Add throttling.
    console.log('*** Calling textPrediction():', textPrefix);
    this.speakFasterService
        .textPrediction({
          userId: this.userId,
          contextTurns: [],  // TODO(cais):
          textPrefix,
        })
        .subscribe(
            (data: TextPredictionResponse) => {
              if (!data.outputs) {
                return;
              }
              this._predictions.splice(0);
              this._predictions.push(
                  ...data.outputs.slice(0, MAX_NUM_PREDICTIONS));
              this.cdr.detectChanges();
            },
            error => {
              console.error('*** Text prediction error:', error);  // DEBUG
            });
  }

  onPredictionButtonClicked(event: Event, index: number) {
    const suggestionSelection = this.predictions[index] + ' ';
    this.inputBarControlSubject.next({suggestionSelection});
    this.reset();
  }

  /** Resets state, including empties the predictions. */
  private reset() {
    this._predictions.splice(0);
    this.cdr.detectChanges();
  }

  public get predictions(): string[] {
    return this._predictions.slice(0);
  }
}
