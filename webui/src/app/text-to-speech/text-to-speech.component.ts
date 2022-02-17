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
        const {volume_gain_db} = event.inAppTextToSpeechAudioConfig;
        if (volume_gain_db !== undefined && volume_gain_db !== 0) {
          // TODO(#49): Support volume control.
          throw new Error('Volume gain adjustment is not implemented yet.');
        }
        this.sendTextToSpeechRequest(event.text);
      } else {
        this.doLocalTextToSpeech(event.text);
      }
    });
  }

  /**
   * Send server call for speech synthesis and then play the synthesized audio.
   */
  private sendTextToSpeechRequest(text: string) {
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
    // NOTE: volume is between 0 and 1.
    const volume = getAppSettings().ttsVolume;
    if (volume === 'QUIET') {
      utterance.volume = 0.2;
    } else if (volume === 'MEDIUM') {
      utterance.volume = 0.5;
    } else {
      utterance.volume = 1.0;
    }
    window.speechSynthesis.speak(utterance);
  }

  private setListenersState(state: TextToSpeechState, errorMessage?: string) {
    TextToSpeechComponent.listeners.forEach(listener => {
      listener({state, errorMessage: this.errorMessage || ''});
    });
  }
}
