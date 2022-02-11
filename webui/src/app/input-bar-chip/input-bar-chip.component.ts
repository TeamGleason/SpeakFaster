/**
 * An chip for the input bar, supporting clicks and typing and other
 * interactions.
 */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {Subscription} from 'rxjs';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

export enum State {
  SHOWING_TEXT = 'SHOWING_TEXT',
  TYPING_TEXT = 'TYPING_TEXT',
}

@Component({
  selector: 'app-input-bar-chip-component',
  templateUrl: './input-bar-chip.component.html',
})
export class InputBarChipComponent implements OnInit, AfterViewInit, OnDestroy {
  private static readonly _NAME = 'InputBarChipComponent';
  private readonly instanceId =
      InputBarChipComponent._NAME + '_' + createUuid();

  @Input() text!: string;
  @Input() typed!: boolean;
  @Input() focused: boolean = false;
  @Output() click: EventEmitter<number> = new EventEmitter();

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;
  private buttonSubscription?: Subscription;

  state = State.SHOWING_TEXT;

  ngOnInit() {}

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.buttons);
    this.buttonSubscription = this.buttons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnDestroy() {
    this.buttonSubscription?.unsubscribe();
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onClicked(event: Event) {}
}
