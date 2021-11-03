import {Component, EventEmitter, HostListener, Output} from '@angular/core';
import { Subject } from 'rxjs';

import {isTextContentKey} from '../../utils/keyboard-utils';
import {AbbreviationSpec, AbbreviationToken, InputAbbreviationChangedEvent, StartSpellingEvent} from '../types/abbreviations';

enum AbbreviationEditingState {
  ENTERING_ABBREVIATION = 'ENTERING_ABBREVIATION',
  SPELLING = 'SPELLING',
}

@Component({
  selector: 'app-abbreviation-editing-component',
  templateUrl: './abbreviation-editing.component.html',
})
export class AbbreviationEditingComponent {
  @Output()
  inputAbbreviationChanged: EventEmitter<InputAbbreviationChangedEvent> =
      new EventEmitter();

  state: AbbreviationEditingState =
      AbbreviationEditingState.ENTERING_ABBREVIATION;

  inputAbbreviation: string = '';

  startSpellingSubject: Subject<StartSpellingEvent> = new Subject();

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (this.state !== AbbreviationEditingState.ENTERING_ABBREVIATION) {
      return;
    }
    if (event.ctrlKey && event.key.toLocaleLowerCase() == 'x') {
      // Ctrl X clears the input box.
      this.inputAbbreviation = '';
      this.state = AbbreviationEditingState.ENTERING_ABBREVIATION;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.ctrlKey && event.key.toLocaleLowerCase() == 's') {
      // Ctrl S clears opens the spelling UI.
      event.preventDefault();
      event.stopPropagation();
      this.state = AbbreviationEditingState.SPELLING;
      this.startSpellingSubject.next({
        originalAbbreviationChars: this.inputAbbreviation.split(''),
      });
      return;
    }
    if (event.altKey || event.metaKey || event.shiftKey || event.ctrlKey) {
      return;
    } else if (event.key === 'Backspace') {
      if (this.inputAbbreviation.length > 0) {
        this.inputAbbreviation = this.inputAbbreviation.substring(
            0, this.inputAbbreviation.length - 1);
        this.setInputString(event);
      }
    } else if (isTextContentKey(event)) {
      this.inputAbbreviation += event.key;
      this.setInputString(event);
    } else if (isTextContentKey(event)) {
      this.inputAbbreviation += event.key;
      this.setInputString(event);
    }
  }

  onSpellButtonClicked(event: Event) {
    if (this.state == AbbreviationEditingState.ENTERING_ABBREVIATION &&
        this.inputAbbreviation.length > 0) {
      this.state = AbbreviationEditingState.SPELLING;
    }
  }

  onNewAbbreviationSpec(abbreviationSpec: AbbreviationSpec) {
    this.inputAbbreviation = abbreviationSpec.readableString;
    this.state = AbbreviationEditingState.ENTERING_ABBREVIATION;
    this.inputAbbreviationChanged.emit(
        {abbreviationSpec, triggerExpansion: true});
  }

  private setInputString(event: Event) {
    const abbreviationToken: AbbreviationToken = {
      value: this.inputAbbreviation.trim(),
      isKeyword: false
    };
    const abbreviationSpec: AbbreviationSpec = {
      tokens: [abbreviationToken],
      readableString: abbreviationToken.value
    };
    this.inputAbbreviationChanged.emit(
        {abbreviationSpec, triggerExpansion: false});
    event.preventDefault();
    event.stopPropagation();
  }
}
