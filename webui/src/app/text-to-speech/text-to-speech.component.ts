/** Component for in-app text-to-speech audio output. */
import {HttpErrorResponse} from '@angular/common/http';
import {ChangeDetectorRef, Component, ElementRef, Input, OnInit, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';

import {AppSettings, getAppSettings} from '../settings/settings';
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

export function getCloudTextToSpeechVolumeGainDb(appSettings: AppSettings):
    number {
  // Unit: dB. Default is 0.
  const volume = appSettings.ttsVolume;
  switch (volume) {
    case 'QUIET':
      return -10.0;
    case 'MEDIUM':
      return 0.0;
    case 'LOUD':
      return 16.0;
  }
}

export function getLocalTextToSpeechVolume(appSettings: AppSettings): number {
  const volume = appSettings.ttsVolume;
  switch (volume) {
    case 'QUIET':
      return 0.2;
    case 'MEDIUM':
      return 0.5;
    case 'LOUD':
      return 1.0;
  }
}

@Component({
  selector: 'app-text-to-speech-component',
  templateUrl: './text-to-speech.component.html',
  providers: [TextToSpeechService],
})
export class TextToSpeechComponent implements OnInit {
  private static readonly listeners: TextToSpeechListener[] = [];

  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input() accessToken!: string;

  @ViewChildren('ttsAudio')
  ttsAudioElements!: QueryList<ElementRef<HTMLAudioElement>>;
  private _audioPlayCallCount: number = 0;
  private audioPlayDisabledForTest = false;

  constructor(
      public textToSpeechService: TextToSpeechService,
      private cdr: ChangeDetectorRef) {}

  public static registerTextToSpeechListener(listener: TextToSpeechListener) {
    if (TextToSpeechComponent.listeners.indexOf(listener) !== -1) {
      return;
    }
    TextToSpeechComponent.listeners.push(listener);
  }

  public static unregisterTextToSpeechListener(listener: TextToSpeechListener) {
    const index = TextToSpeechComponent.listeners.indexOf(listener);
    if (index === -1) {
      return;
    }
    TextToSpeechComponent.listeners.splice(index, 1);
  }

  public static clearTextToSpeechListener() {
    TextToSpeechComponent.listeners.splice(0);
  }

  ngOnInit() {
    this.textEntryEndSubject.subscribe(async event => {
      if (!event.isFinal || event.inAppTextToSpeechAudioConfig === undefined) {
        return;
      }
      const appSettings = await getAppSettings();
      const ttsVoiceType = appSettings.ttsVoiceType;
      if (ttsVoiceType === 'PERSONALIZED') {
        this.doCloudTextToSpeech(event.text, appSettings);
      } else {
        this.doLocalTextToSpeech(event.text, appSettings);
      }
    });
  }

  /**
   * Send Cloud call for speech synthesis and then play the synthesized audio.
   */
  private doCloudTextToSpeech(text: string, appSettings: AppSettings) {
    if (this.accessToken.length === 0) {
      TextToSpeechComponent.listeners.forEach(listener => {
        listener({state: 'ERROR', errorMessage: 'No access token'});
      });
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
            volume_gain_db: getCloudTextToSpeechVolumeGainDb(appSettings),
          },
          access_token: this.accessToken,
        })
        .subscribe(
            data => {
              const ttsAudioElement =
                  this.ttsAudioElements.first.nativeElement as HTMLAudioElement;
              if (!ttsAudioElement.onplay) {
                ttsAudioElement.onplay = () => {
                  this.setListenersState('PLAY');
                };
                ttsAudioElement.onended = () => {
                  this.setListenersState('END');
                };
              }
              if (!data.audio_content) {
                TextToSpeechComponent.listeners.forEach(listener => {
                  listener({state: 'ERROR', errorMessage: 'Audio is empty'});
                });
                ;
                return;
              }
              ttsAudioElement.src =
                  'data:audio/wav;base64,' + data.audio_content;
              if (!this.audioPlayDisabledForTest) {
                ttsAudioElement.play();
              }
              this._audioPlayCallCount++;
              this.cdr.detectChanges();
            },
            (error: HttpErrorResponse) => {
              let errorMessage = '';
              if (error.error &&
                  (error.error as TextToSpeechErrorResponse).error_message) {
                errorMessage =
                    (error.error as TextToSpeechErrorResponse).error_message;
              } else {
                errorMessage = `${error.statusText}`;
              }
              TextToSpeechComponent.listeners.forEach(listener => {
                listener({state: 'ERROR', errorMessage});
              });
              this.cdr.detectChanges();
            });
  }

  /** Use local WebSpeech API to perform text-to-speech output. */
  private doLocalTextToSpeech(text: string, appSettings: AppSettings) {
    const utterance = new SpeechSynthesisUtterance(text.trim());
    this.setListenersState('REQUESTING');
    utterance.onstart = () => {
      this.setListenersState('PLAY');
    };
    utterance.onend = () => {
      this.setListenersState('END');
    };
    utterance.volume = getLocalTextToSpeechVolume(appSettings);
    window.speechSynthesis.speak(utterance);
  }

  private setListenersState(state: TextToSpeechState, errorMessage?: string) {
    TextToSpeechComponent.listeners.forEach(listener => {
      listener({state, errorMessage});
    });
  }

  public disableAudioElementPlayForTest() {
    this.audioPlayDisabledForTest = true;
  }

  get audioPlayCallCount(): number {
    return this._audioPlayCallCount;
  }
}
