import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {updateButtonBoxesForElements} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {isTextContentKey} from '../../utils/keyboard-utils';
import {KeyboardComponent} from '../keyboard/keyboard.component';
import {AbbreviationSpec, AbbreviationToken, InputAbbreviationChangedEvent, StartSpellingEvent} from '../types/abbreviations';
import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

enum State {
  ENTERING_ABBREVIATION = 'ENTERING_ABBREVIATION',
  SPELLING = 'SPELLING',
  EDITING_TOKEN = 'EDITING_TOKEN',
}

@Component({
  selector: 'app-abbreviation-editing-component',
  templateUrl: './abbreviation-editing.component.html',
})
export class AbbreviationEditingComponent implements OnInit, AfterViewInit {
  private static readonly _NAME = 'AbbreviationEditingComponent';

  private readonly instanceId = createUuid();
  @Input() textInjectionSubject!: Subject<TextEntryEndEvent>;
  @Input() textEntryBeginSubject!: Subject<TextEntryBeginEvent>;
  @Output()
  inputAbbreviationChanged: EventEmitter<InputAbbreviationChangedEvent> =
      new EventEmitter();
  @Output()
  spellingStateChanged: EventEmitter<'START'|'END'> = new EventEmitter();

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  state: State = State.ENTERING_ABBREVIATION;

  inputAbbreviation: string = '';

  startSpellingSubject: Subject<StartSpellingEvent> = new Subject();
  private isSpellingTaskIsNew = true;

  ngOnInit() {
    this.textInjectionSubject.subscribe((textInjection: TextEntryEndEvent) => {
      if (textInjection.isFinal) {
        this.resetState();
      } else {
        this.inputAbbreviation = textInjection.text;
      }
    });
    KeyboardComponent.registerCallback(
        AbbreviationEditingComponent._NAME,
        this.handleKeyboardEvent.bind(this));
  }

  ngAfterViewInit() {
    this.buttons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          updateButtonBoxesForElements(
              AbbreviationEditingComponent._NAME + this.instanceId, queryList);
        });
  }

  handleKeyboardEvent(event: KeyboardEvent): boolean {
    if (this.state !== State.ENTERING_ABBREVIATION) {
      return false;
    }
    if (event.ctrlKey && event.key.toLocaleLowerCase() == 'x') {
      // Ctrl X clears the input box.
      this.resetState();
      return true;
    }
    if (event.ctrlKey && event.key.toLocaleLowerCase() == 's') {
      // Ctrl S opens the spelling UI.
      this.startSpelling();
      return true;
    }
    if (event.altKey || event.metaKey || event.shiftKey || event.ctrlKey) {
      return false;
    } else if (event.key === 'Backspace') {
      if (this.inputAbbreviation.length > 0) {
        this.inputAbbreviation = this.inputAbbreviation.substring(
            0, this.inputAbbreviation.length - 1);
        this.setInputString(event);
      }
      return true;
    } else if (isTextContentKey(event)) {
      if (this.inputAbbreviation === '') {
        this.textEntryBeginSubject.next({
          timestampMillis: Date.now(),
        });
      }
      this.inputAbbreviation += event.key;
      this.setInputString(event);
      return true;
    }
    return false;
  }

  private startSpelling() {
    if (this.state != State.ENTERING_ABBREVIATION ||
        this.inputAbbreviation.length === 0) {
      return;
    }
    this.state = State.SPELLING;
    this.spellingStateChanged.emit('START');
    this.startSpellingSubject.next({
      originalAbbreviationChars: this.inputAbbreviation.split(''),
      isNewSpellingTask: this.isSpellingTaskIsNew,
    });
    this.isSpellingTaskIsNew = false;
  }

  private startAbbreviationExpansionEditing() {
    this.state = State.EDITING_TOKEN;
  }

  onExpandAbbreviationButtonClicked(event: Event) {
    if (this.state != State.ENTERING_ABBREVIATION ||
        this.inputAbbreviation.indexOf(' ') !== -1) {
      return;
    }
    const abbreviationSpec: AbbreviationSpec = {
      tokens: [{
        value: this.inputAbbreviation,
        isKeyword: false,
      }],
      readableString: this.inputAbbreviation,
    };
    this.inputAbbreviationChanged.emit(
        {abbreviationSpec, triggerExpansion: true});
  }

  onSpellButtonClicked(event: Event) {
    this.startSpelling();
  }

  onEnterAsIsButtonClicked(event: Event) {
    const text = this.inputAbbreviation.trim();
    this.textInjectionSubject.next({
      text,
      timestampMillis: Date.now(),
      isFinal: true,
    });
  }

  onEditButtonClicked(event: Event) {
    this.startAbbreviationExpansionEditing();
  }

  onNewAbbreviationSpec(abbreviationSpec: AbbreviationSpec) {
    this.inputAbbreviation = abbreviationSpec.readableString;
    this.state = State.ENTERING_ABBREVIATION;
    this.spellingStateChanged.emit('END');
    this.inputAbbreviationChanged.emit(
        {abbreviationSpec, triggerExpansion: true});
  }

  private resetState() {
    this.inputAbbreviation = '';
    this.isSpellingTaskIsNew = true;
    this.state = State.ENTERING_ABBREVIATION;
    this.inputAbbreviationChanged.emit({
      abbreviationSpec: {
        tokens: [],
        readableString: '',
      },
      triggerExpansion: false,
    });
  }

  private setInputString(event: Event) {
    const abbreviationToken:
        AbbreviationToken = {value: this.inputAbbreviation, isKeyword: false};
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