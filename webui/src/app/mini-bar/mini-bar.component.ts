import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, QueryList, ViewChildren} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {AppState} from '../types/app-state';

@Component({
  selector: 'app-mini-bar-component',
  templateUrl: './mini-bar.component.html',
})
export class MiniBarComponent implements AfterViewInit, OnDestroy {
  private static readonly _NAME = 'MiniBarComponent';

  private readonly instanceId = MiniBarComponent._NAME + '_' + createUuid();
  @Input() appState!: AppState;
  @Output() appStateDeminimized: EventEmitter<void> = new EventEmitter();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLElement>>;

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnDestroy() {
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onButtonClicked(event: Event) {
    this.appStateDeminimized.emit();
  }

  get buttonText(): string {
    return this.appState === AppState.MINIBAR ? 'SpeakFaster' : 'Hide';
  }
}
