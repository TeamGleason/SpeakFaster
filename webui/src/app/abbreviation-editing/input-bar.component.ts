import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {updateButtonBoxesForElements} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {ExternalEventsComponent} from '../external/external-events.component';
import {AbbreviationSpec, AbbreviationToken, InputAbbreviationChangedEvent, StartSpellingEvent} from '../types/abbreviation';
import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

enum State {
  ENTERING_ABBREVIATION = 'ENTERING_ABBREVIATION',
  SPELLING = 'SPELLING',
  EDITING_TOKEN = 'EDITING_TOKEN',
}

@Component({
  selector: 'app-input-bar-component',
  templateUrl: './input-bar.component.html',
})
export class InputBarComponent implements OnInit, AfterViewInit {
  private static readonly _NAME = 'InputBarComponent';

  private readonly instanceId = createUuid();
  @Input() textInjectionSubject!: Subject<TextEntryEndEvent>;
  @Input() textEntryBeginSubject!: Subject<TextEntryBeginEvent>;
  @Output()
  spellingStateChanged: EventEmitter<'START'|'END'> = new EventEmitter();

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  state: State = State.ENTERING_ABBREVIATION;

  inputString: string = '';

  startSpellingSubject: Subject<StartSpellingEvent> = new Subject();
  private isSpellingTaskIsNew = true;

  ngOnInit() {
    this.textInjectionSubject.subscribe((textInjection: TextEntryEndEvent) => {
      if (textInjection.isFinal) {
        this.resetState();
      } else {
        this.inputString = textInjection.text;
      }
    });
    ExternalEventsComponent.registerKeypressListener(
        this.listenToKeypress.bind(this));
  }

  ngAfterViewInit() {
    this.buttons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          updateButtonBoxesForElements(
              InputBarComponent._NAME + this.instanceId, queryList);
        });
  }

  public listenToKeypress(keySequence: string[], reconstructedText: string):
      void {
    this.inputString = reconstructedText;
  }

  private startAbbreviationExpansionEditing() {
    this.state = State.EDITING_TOKEN;
  }

  onEnterAsIsButtonClicked(event: Event) {
    const text = this.inputString.trim();
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
    this.inputString = '';
    this.isSpellingTaskIsNew = true;
    this.state = State.ENTERING_ABBREVIATION;
  }
}
