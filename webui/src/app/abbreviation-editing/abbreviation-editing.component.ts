import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {updateButtonBoxForHtmlElements} from 'src/utils/cefsharp';

import {isTextContentKey} from '../../utils/keyboard-utils';
import {KeyboardComponent} from '../keyboard/keyboard.component';
import {AbbreviationSpec, AbbreviationToken, InputAbbreviationChangedEvent, StartSpellingEvent} from '../types/abbreviations';
import {TextInjection} from '../types/text-injection';

enum AbbreviationEditingState {
  ENTERING_ABBREVIATION = 'ENTERING_ABBREVIATION',
  SPELLING = 'SPELLING',
  EDITING_TOKEN = 'EDITING_TOKEN',  // TODO(cais): Clean up.
}

@Component({
  selector: 'app-abbreviation-editing-component',
  templateUrl: './abbreviation-editing.component.html',
})
export class AbbreviationEditingComponent implements OnInit, AfterViewInit {
  private static readonly _NAME = 'AbbreviationEditingComponent';

  @Input() textInjectionSubject!: Subject<TextInjection>;
  @Output()
  inputAbbreviationChanged: EventEmitter<InputAbbreviationChangedEvent> =
      new EventEmitter();
  @Output()
  spellingStateChanged: EventEmitter<'START'|'END'> = new EventEmitter();

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;


  state: AbbreviationEditingState =
      AbbreviationEditingState.ENTERING_ABBREVIATION;

  inputAbbreviation: string = '';
  hasAbbreviationExpansionOptions = true;  // TODO(cais): Fix logic.

  startSpellingSubject: Subject<StartSpellingEvent> = new Subject();
  private isSpellingTaskIsNew = true;

  ngOnInit() {
    this.textInjectionSubject.subscribe((textInjection: TextInjection) => {
      this.state = AbbreviationEditingState.ENTERING_ABBREVIATION;
      this.inputAbbreviation = '';
      this.isSpellingTaskIsNew = true;
    });
    KeyboardComponent.registerCallback(
        AbbreviationEditingComponent._NAME,
        this.handleKeyboardEvent.bind(this));
  }

  ngAfterViewInit() {
    this.buttons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          setTimeout(
              () => updateButtonBoxForHtmlElements(
                  AbbreviationEditingComponent._NAME, queryList),
              20);
        });
  }

  handleKeyboardEvent(event: KeyboardEvent) {
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
      // Ctrl S opens the spelling UI.
      event.preventDefault();
      event.stopPropagation();
      this.startSpelling();
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

  private startSpelling() {
    if (this.state != AbbreviationEditingState.ENTERING_ABBREVIATION ||
        this.inputAbbreviation.length === 0) {
      return;
    }
    this.state = AbbreviationEditingState.SPELLING;
    this.spellingStateChanged.emit('START');
    this.startSpellingSubject.next({
      originalAbbreviationChars: this.inputAbbreviation.split(''),
      isNewSpellingTask: this.isSpellingTaskIsNew,
    });
    this.isSpellingTaskIsNew = false;
  }

  private startAbbreviationExpansionEditing() {
    this.state = AbbreviationEditingState.EDITING_TOKEN;
  }

  onSpellButtonClicked(event: Event) {
    this.startSpelling();
  }

  onEditButtonClicked(event: Event) {
    this.startAbbreviationExpansionEditing();
  }

  onNewAbbreviationSpec(abbreviationSpec: AbbreviationSpec) {
    this.inputAbbreviation = abbreviationSpec.readableString;
    this.state = AbbreviationEditingState.ENTERING_ABBREVIATION;
    this.spellingStateChanged.emit('END');
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
