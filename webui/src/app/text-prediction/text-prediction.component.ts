import {AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {injectKeys, updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

@Component({
  selector: 'app-text-prediction-component',
  templateUrl: './text-prediction.component.html',
})
export class TextPredictionComponent implements AfterViewInit, OnChanges, OnDestroy {
  private static readonly _NAME = 'TextPredictionComponent';

  private readonly instanceId =
      TextPredictionComponent._NAME + '_' + createUuid();

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  // TODO(#59): Use service endpoint to get contextual predictions instead of
  // hardcoding.
  readonly predictions: string[] = ['Hello', 'Thank you!'];

  constructor() {}

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
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onPredictionButtonClicked(event: Event, index: number) {
    const chars: string[] = this.predictions[index].split('');
    injectKeys(chars);
    // TODO(#59): Support backspace injection.
  }
}
