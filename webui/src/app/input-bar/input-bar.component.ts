/** An input bar, with related functional buttons. */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';
import {updateButtonBoxesForElements} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {ExternalEventsComponent} from '../external/external-events.component';
import {TextEntryEndEvent} from '../types/text-entry';

@Component({
  selector: 'app-input-bar-component',
  templateUrl: './input-bar.component.html',
})
export class InputBarComponent implements OnInit, AfterViewInit {
  private static readonly _NAME = 'InputBarComponent';
  private readonly instanceId = InputBarComponent._NAME + '_' + createUuid();

  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  inputString: string = '';

  ngOnInit() {
    this.textEntryEndSubject.subscribe((textInjection: TextEntryEndEvent) => {
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
    if (!this.inputString.trim()) {
      return;
    }
    const text = this.inputString.trim();
    this.textEntryEndSubject.next({
      text,
      timestampMillis: Date.now(),
      isFinal: true,
      inAppTextToSpeechAudioConfig: {
        volume_gain_db: 0,
      }
    });
  }

  onFavoriteButtonClicked(event: Event) {
    if (!this.inputString.trim()) {
      return;
    }
    // TODO(cais): Implement favoriting phrases.
  }

  private resetState() {
    this.inputString = '';
  }
}
