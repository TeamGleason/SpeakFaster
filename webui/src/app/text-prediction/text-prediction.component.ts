import {AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, QueryList, SimpleChange, SimpleChanges, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {injectKeys, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {SpeakFasterService} from '../speakfaster-service';
import {TextEntryEndEvent} from '../types/text-entry';

@Component({
  selector: 'app-text-prediction-component',
  templateUrl: './text-prediction.component.html',
})
export class TextPredictionComponent implements AfterViewInit, OnChanges, OnDestroy {
  private static readonly _NAME = 'TextPredictionComponent';

  private readonly instanceId =
      TextPredictionComponent._NAME + '_' + createUuid();
  @Input() endpoint!: string;
  @Input() accessToken!: string;
  @Input() contextStrings!: string[];
  @Input() textPrefix!: string;
  @Input() textInjectionSubject!: Subject<TextEntryEndEvent>;

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  // TODO(#59): Use service endpoint to get contextual predictions instead of
  // hardcoding.
  readonly predictions: string[] = ['Hello', 'Thank you!'];

  constructor(private speakFasterService: SpeakFasterService) {}

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.buttons);
    this.buttons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.buttons != null) {
      // NOTE: This is necessary if other components affect the layout and
      // cause position shift in this item.
      updateButtonBoxesForElements(this.instanceId, this.buttons);
    }
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

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onPredictionButtonClicked(event: Event, index: number) {
    const chars: string[] = this.predictions[index].split('');
    injectKeys(chars);
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
