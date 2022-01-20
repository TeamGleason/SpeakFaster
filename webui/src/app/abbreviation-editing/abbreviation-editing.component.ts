import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {updateButtonBoxesForElements} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {isTextContentKey} from '../../utils/keyboard-utils';
import {ExternalEventsComponent} from '../external/external-events.component';
import {AbbreviationSpec, AbbreviationToken, InputAbbreviationChangedEvent, StartSpellingEvent} from '../types/abbreviation';
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
    ExternalEventsComponent.registerKeypressListener(
        this.listenToKeypress.bind(this));
  }

  ngAfterViewInit() {
    this.buttons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          updateButtonBoxesForElements(
              AbbreviationEditingComponent._NAME + this.instanceId, queryList);
        });
  }

  public listenToKeypress(keySequence: string[], reconstructedText: string):
      void {
    this.inputAbbreviation = reconstructedText;
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
      lineageId: createUuid(),
    };
    this.inputAbbreviationChanged.emit(
        {abbreviationSpec, requestExpansion: true});
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

  private resetState() {
    this.inputAbbreviation = '';
    this.isSpellingTaskIsNew = true;
    this.state = State.ENTERING_ABBREVIATION;
    this.inputAbbreviationChanged.emit({
      abbreviationSpec: {
        tokens: [],
        readableString: '',
        lineageId: createUuid(),
      },
      requestExpansion: false,
    });
  }

  private setInputString(event: Event) {
    const abbreviationToken:
        AbbreviationToken = {value: this.inputAbbreviation, isKeyword: false};
    const abbreviationSpec: AbbreviationSpec = {
      tokens: [abbreviationToken],
      readableString: abbreviationToken.value,
      lineageId: createUuid(),
    };
    this.inputAbbreviationChanged.emit(
        {abbreviationSpec, requestExpansion: false});
    event.preventDefault();
    event.stopPropagation();
  }
}
