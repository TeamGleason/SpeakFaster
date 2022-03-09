/** The help component. */
import {Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, QueryList, ViewChild} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

@Component({
  selector: 'app-help-component',
  templateUrl: './help.component.html',
})
export class HelpComponent implements OnDestroy {
  private static readonly _NAME = 'HelpComponent';
  private readonly instanceId = HelpComponent._NAME + '_' + createUuid();

  @ViewChild('clickableButton')
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
}
