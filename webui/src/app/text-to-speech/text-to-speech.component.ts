/** Component for in-app text-to-speech audio output. */
import {HttpErrorResponse} from '@angular/common/http';
import {ChangeDetectorRef, Component, ElementRef, Input, OnInit, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';

import {getAppSettings} from '../settings/settings';
import {TextToSpeechErrorResponse, TextToSpeechService} from '../text-to-speech-service';
import {TextEntryEndEvent} from '../types/text-entry';

const DEFAULT_LANGUAGE_CODE = 'en-US';
const DEFAULT_AUDIO_ENCODING = 'LINEAR16';

export type TextToSpeechState = 'REQUESTING'|'PLAY'|'END'|'ERROR';

export interface TextToSpeechEvent {
  state: TextToSpeechState;

  errorMessage?: string;
}

export type TextToSpeechListener = (event: TextToSpeechEvent) => void;

@Component({
  selector: 'app-text-to-speech-component',
  templateUrl: './text-to-speech.component.html',
  providers: [TextToSpeechService],
})
export class TextToSpeechComponent implements OnInit {
  private static readonly listeners: TextToSpeechListener[] = [];

  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  // @Input() textToSpeechEventSubject!: Subject<TextToSpeechEvent>;
  @Input() accessToken!: string;

  @ViewChildren('ttsAudio')
  ttsAudioElements!: QueryList<ElementRef<HTMLAudioElement>>;

  errorMessage?: string|null = null;

  constructor(
      public textToSpeechService: TextToSpeechService,
      private cdr: ChangeDetectorRef) {}

  public static registerTextToSpeechListener(listener: TextToSpeechListener) {
    if (TextToSpeechComponent.listeners.indexOf(listener) !== -1) {
      return;
    }
    TextToSpeechComponent.listeners.push(listener);
    // TODO(cais): Add unit test.
  }

  public static unregisterTextToSpeechListener(listener: TextToSpeechListener) {
    const index = TextToSpeechComponent.listeners.indexOf(listener);
    if (index === -1) {
      return;
    }
    TextToSpeechComponent.listeners.splice(index, 1);
    // TODO(cais): Add unit test.
  }

  ngOnInit() {
    this.textEntryEndSubject.subscribe(event => {
      // TODO(cais): Add unit test.
      if (!event.isFinal || event.inAppTextToSpeechAudioConfig === undefined) {
        return;
      }
      const ttsVoiceType = getAppSettings().ttsVoiceType;
      if (ttsVoiceType === 'PERSONALIZED') {
        this.doCloudTextToSpeech(event.text);
      } else {
        this.doLocalTextToSpeech(event.text);
      }
    });
  }

  /**
   * Send Cloud call for speech synthesis and then play the synthesized audio.
   */
  private doCloudTextToSpeech(text: string) {
    if (this.accessToken.length === 0) {
      this.errorMessage = 'no access token';
      TextToSpeechComponent.listeners.forEach(listener => {
        listener({state: 'ERROR', errorMessage: this.errorMessage || ''});
      });
      // TODO(cais): Add unit test.
      return;
    }
    this.setListenersState('REQUESTING');
    this.textToSpeechService
        .synthesizeSpeech({
          text,
          language: DEFAULT_LANGUAGE_CODE,
          audio_config: {
            audio_encoding: DEFAULT_AUDIO_ENCODING,
            speaking_rate: 1.0,
            volume_gain_db: this.getCloudTextToSpeechVolumeGainDb(),
          },
          access_token: this.accessToken,
        })
        .subscribe(
            data => {
              this.errorMessage = null;
              const ttsAudioElement = this.ttsAudioElements.first.nativeElement;
              if (!ttsAudioElement.onplay) {
                ttsAudioElement.onplay = () => {
                  this.setListenersState('PLAY');
                  // TODO(cais): Add unit tests.
                };
                ttsAudioElement.onended = () => {
                  this.setListenersState('END');
                  // TODO(cais): Add unit tests.
                };
              }
              if (!data.audio_content) {
                this.errorMessage = 'audio is empty';
                return;
              }
              ttsAudioElement.src =
                  'data:audio/wav;base64,' + data.audio_content;
              ttsAudioElement.play();
              this.cdr.detectChanges();
            },
            (error: HttpErrorResponse) => {
              if (error.error &&
                  (error.error as TextToSpeechErrorResponse).error_message) {
                this.errorMessage =
                    (error.error as TextToSpeechErrorResponse).error_message;
              } else {
                this.errorMessage = `${error.statusText}`;
              }
              TextToSpeechComponent.listeners.forEach(listener => {
                listener(
                    {state: 'ERROR', errorMessage: this.errorMessage || ''});
              });
              this.cdr.detectChanges();
            });
  }



  /** Use local WebSpeech API to perform text-to-speech output. */
  private doLocalTextToSpeech(text: string) {
    const utterance = new SpeechSynthesisUtterance(text.trim());
    this.setListenersState('REQUESTING');
    utterance.onstart = () => {
      this.setListenersState('PLAY');
    };
    utterance.onend = () => {
      this.setListenersState('END');
    };
    utterance.volume = this.getLocalTextToSpeechVolume();
    window.speechSynthesis.speak(utterance);
  }

  /** Get volume_gain_db for cloud text-to-speech. */
  private getCloudTextToSpeechVolumeGainDb(): number {
    // Unit: dB. Default is 0.
    const volume = getAppSettings().ttsVolume;
    switch (volume) {
      case 'QUIET':
        return -20.0;
      case 'MEDIUM':
        return 0.0;
      case 'LOUD':
        return 16.0;
    }
  }

  private getLocalTextToSpeechVolume(): number {
    const volume = getAppSettings().ttsVolume;
    switch (volume) {
      case 'QUIET':
        return 0.2;
      case 'MEDIUM':
        return 0.5;
      case 'LOUD':
        return 1.0;
    }
  }

  private setListenersState(state: TextToSpeechState, errorMessage?: string) {
    TextToSpeechComponent.listeners.forEach(listener => {
      listener({state, errorMessage: this.errorMessage || ''});
    });
  }
}
