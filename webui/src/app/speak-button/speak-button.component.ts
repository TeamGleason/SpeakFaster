/**
 * A button for speaking a phrase (TTS output). Supports animation that
 * indicates ongoing TTS output.
 */
import {Component, EventEmitter, Input, OnDestroy, OnInit, Output} from '@angular/core';
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
export class SpeakButtonComponent implements OnInit, OnDestroy {
  private static readonly _NAME = 'SpeakButtonComponent';
  private static readonly ERROR_STATE_DELAY_MILLIS = 2000;

  @Input() phrase!: string;
  @Output() speakButtonClicked: EventEmitter<Event> = new EventEmitter();

  state: State = State.READY;
  private textToSpeechListener: TextToSpeechListener =
      this.onTextToSpeechEvent.bind(this);

  ngOnInit() {
    TextToSpeechComponent.registerTextToSpeechListener(
        this.textToSpeechListener);
  }

  ngOnDestroy() {
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
