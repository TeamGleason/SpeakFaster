import {AfterViewInit, Component, ElementRef, Input, OnChanges, QueryList, SimpleChange, SimpleChanges, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {injectKeys, updateButtonBoxesForElements} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {SpeakFasterService} from '../speakfaster-service';
import {TextEntryEndEvent} from '../types/text-entry';

@Component({
  selector: 'app-text-prediction-component',
  templateUrl: './text-prediction.component.html',
})
export class TextPredictionComponent implements AfterViewInit, OnChanges {
  private static readonly _NAME = 'TextPredictionComponent';

  private readonly instanceId = createUuid();
  @Input() endpoint!: string;
  @Input() accessToken!: string;
  @Input() contextStrings!: string[];
  @Input() textPrefix!: string;
  @Input() textInjectionSubject!: Subject<TextEntryEndEvent>;

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  // TODO(#59): Use service endpoint to get contextual predictions instead of
  // hardcoding.
  readonly predictions: string[] = ['Hello', 'Thank you'];

  constructor(private speakFasterService: SpeakFasterService) {}

  ngOnInit() {}

  ngAfterViewInit() {
    this.buttons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          updateButtonBoxesForElements(
              TextPredictionComponent._NAME + this.instanceId, queryList);
        });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['textPrefix']) {
      return;
    }
    const textPrefixChange: SimpleChange = changes['textPrefix'];
    const textPrefix = textPrefixChange.currentValue;
    if (textPrefix[textPrefix.length - 1] !== ' ') {
      return;
    }
    this.speakFasterService
        .textPrediction(
            this.endpoint, this.accessToken, this.contextStrings,
            textPrefix.trim())
        .subscribe(
            data => {
              this.predictions.splice(0);
              this.predictions.push(...data.outputs);
            },
            error => {
              this.predictions.splice(0);
              // TODO(cais): UI for indicating error.
            });
  }

  onPredictionButtonClicked(event: Event, index: number) {
    const chars: string[] = this.predictions[index].split('');
    injectKeys(chars);  // TODO(cais): Add unit test.
    // TODO(cais): Support backspace injection.
    const text = this.textPrefix.trim() + ' ' + this.predictions[index].trim();
    this.textInjectionSubject.next({
      text,
      timestampMillis: Date.now(),
      isFinal: false,
    });
    this.predictions.splice(0);
  }
}
