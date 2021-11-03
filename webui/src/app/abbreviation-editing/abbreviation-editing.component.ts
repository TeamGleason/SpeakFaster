import {Component, EventEmitter, HostListener, Input, Output} from '@angular/core';
import {isTextContentKey} from 'src/utils/keyboard-utils';

@Component({
  selector: 'app-abbreviation-editing-component',
  templateUrl: './abbreviation-editing.component.html',
})
export class AbbreviationEditingComponent {
  @Output() inputStringChanged: EventEmitter<string> = new EventEmitter();

  inputAbbreviation: string = '';

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.ctrlKey && event.key.toLocaleLowerCase() == 'x') {
      // Ctrl X clears the input box.
      this.inputAbbreviation = '';
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.altKey || event.metaKey || event.shiftKey || event.ctrlKey) {
      return;
    } else if (event.key === 'Backspace') {
      if (this.inputAbbreviation.length > 0) {
        this.inputAbbreviation = this.inputAbbreviation.substring(
            0, this.inputAbbreviation.length - 1);
        this.inputStringChanged.emit(this.inputAbbreviation);
        event.preventDefault();
        event.stopPropagation();
      }
    } else if (isTextContentKey(event)) {
      this.inputAbbreviation += event.key;
      this.inputStringChanged.emit(this.inputAbbreviation);
      event.preventDefault();
      event.stopPropagation();
    } else if (isTextContentKey(event)) {
      this.inputAbbreviation += event.key;
      this.inputStringChanged.emit(this.inputAbbreviation);
      event.preventDefault();
      event.stopPropagation();
    }
  }
}
