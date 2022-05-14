/**
 * An chip for the input bar, supporting clicks and typing and other
 * interactions.
 */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, QueryList, SimpleChanges, ViewChild, ViewChildren} from '@angular/core';
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
  @Input() supportsCut: boolean = false;
  @Input() focused: boolean = false;
  @Output() cutClicked: EventEmitter<Event> = new EventEmitter();
  @Output() textChanged: EventEmitter<{text: string}> = new EventEmitter();

  @ViewChild('inputBox') inputBox!: ElementRef<HTMLInputElement>;
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
    this.inputBox.nativeElement.value = this.text;
    this.updateInputBoxSize();
  }

  ngOnDestroy() {
    this.buttonSubscription?.unsubscribe();
    updateButtonBoxesToEmpty(this.instanceId);
  }

  onInputBoxKeyUp(event: Event) {
    this.updateInputBoxSize();
    this.text = this.inputBox.nativeElement.value;
    // TODO(cais): add unit test.
    this.textChanged.emit({text: this.text});
  }

  private updateInputBoxSize(): void {
    this.inputBox.nativeElement.style.width = `${this.text.length + 1}ch`;
    updateButtonBoxesForElements(this.instanceId, this.buttons);
  }

  onMainButtonClicked(event: Event) {
    // TODO(cais): Add unit test.
    this.inputBox.nativeElement.select();
    this.inputBox.nativeElement.focus({preventScroll: true});
    // this.inputBox.nativeElement.textContent
  }

  onCutButtonClicked(event: Event) {
    this.cutClicked.emit(event);
  }
}
