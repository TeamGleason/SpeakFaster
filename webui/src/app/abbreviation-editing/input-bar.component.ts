import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {updateButtonBoxesForElements} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {ExternalEventsComponent} from '../external/external-events.component';
import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

@Component({
  selector: 'app-input-bar-component',
  templateUrl: './input-bar.component.html',
})
export class InputBarComponent implements OnInit, AfterViewInit {
  private static readonly _NAME = 'InputBarComponent';
  private readonly instanceId = InputBarComponent._NAME + '_' + createUuid();

  @Input() textInjectionSubject!: Subject<TextEntryEndEvent>;
  @Input() textEntryBeginSubject!: Subject<TextEntryBeginEvent>;
  @Output()
  spellingStateChanged: EventEmitter<'START'|'END'> = new EventEmitter();

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  inputString: string = '';

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
    updateButtonBoxesForElements(this.instanceId, this.buttons);
    this.buttons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  public listenToKeypress(keySequence: string[], reconstructedText: string):
      void {
    this.inputString = reconstructedText;
  }

  onSpeakAsIsButtonClicked(event: Event) {
    const text = this.inputString.trim();
    this.textInjectionSubject.next({
      text,
      timestampMillis: Date.now(),
      isFinal: true,
      inAppTextToSpeechAudioConfig: {
        volume_gain_db: 0,
      }
    });
  }

  onFavoriteButtonClicked(event: Event) {
    // TODO(cais): Implement favoriting phrases.
  }

  private resetState() {
    this.inputString = '';
  }
}
