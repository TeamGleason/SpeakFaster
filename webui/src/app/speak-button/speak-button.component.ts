/**
 * A button for speaking a phrase (TTS output). Supports animation that
 * indicates ongoing TTS output.
 */
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subscription} from 'rxjs';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {TextToSpeechComponent, TextToSpeechEvent, TextToSpeechListener} from '../text-to-speech/text-to-speech.component';

export enum State {
  READY = 'READY',
  PLAYING = 'PLAYING',
  ERROR = 'ERROR',
}

@Component({
  selector: 'app-speak-button-component',
  templateUrl: './speak-button.component.html',
})
export class SpeakButtonComponent implements OnInit, AfterViewInit, OnDestroy {
  private static readonly _NAME = 'SpeakButtonComponent';
  private readonly instanceId = SpeakButtonComponent._NAME + '_' + createUuid();
  private static readonly ERROR_STATE_DELAY_MILLIS = 2000;

  @Input() phrase!: string;
  @Output() speakButtonClicked: EventEmitter<Event> = new EventEmitter();

  @ViewChildren('clickableButton')
  buttons!: QueryList<ElementRef<HTMLButtonElement>>;

  state: State = State.READY;
  private buttonSubscription?: Subscription;
  private textToSpeechListener: TextToSpeechListener =
      this.onTextToSpeechEvent.bind(this);

  ngOnInit() {
    TextToSpeechComponent.registerTextToSpeechListener(
        this.textToSpeechListener);
  }

  ngAfterViewInit() {
    updateButtonBoxesForElements(this.instanceId, this.buttons);
    this.buttonSubscription = this.buttons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnDestroy() {
    if (this.buttonSubscription) {
      this.buttonSubscription.unsubscribe();
    }
    updateButtonBoxesToEmpty(this.instanceId);
    TextToSpeechComponent.unregisterTextToSpeechListener(
        this.textToSpeechListener);
  }

  onTextToSpeechEvent(event: TextToSpeechEvent) {
    if (event.state === 'PLAY') {
      this.state = State.PLAYING;
    } else if (event.state === 'END') {
      this.state = State.READY;
    } else if (event.state === 'ERROR') {
      this.state = State.ERROR;
      setTimeout(() => {
        this.state = State.READY;
      }, SpeakButtonComponent.ERROR_STATE_DELAY_MILLIS);
    }
  }

  onSpeakButtonClicked(event: Event) {
    if (this.state === State.READY) {
      this.speakButtonClicked.emit(event);
      // TODO(cais): Add unit test.
    }
  }
}
