/** Component for in-app text-to-speech audio output. */
import {HttpErrorResponse} from '@angular/common/http';
import {ChangeDetectorRef, Component, ElementRef, Input, OnInit, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';

import {AppSettings, getAppSettings, setTtsVoiceType} from '../settings/settings';
import {TextToSpeechErrorResponse, TextToSpeechService} from '../text-to-speech-service';
import {setUtteranceVoice} from '../tts-voice-selection/tts-voice-selection.component';
import {TextEntryEndEvent} from '../types/text-entry';

export const DEFAULT_LANGUAGE_CODE = 'en-US';
const DEFAULT_AUDIO_ENCODING = 'LINEAR16';

export type TextToSpeechState = 'REQUESTING'|'PLAY'|'END'|'ERROR';

export interface TextToSpeechEvent {
  state: TextToSpeechState;

  errorMessage?: string;
}

export type TextToSpeechListener = (event: TextToSpeechEvent) => void;

export const VOLUME_STEP_DB = 3;

export function getCloudTextToSpeechVolumeGainDb(appSettings: AppSettings):
    number {
  // Unit: dB. Default is 0.
  const volume = appSettings.ttsVolume;
  switch (volume) {
    case 'QUIET':
      return -2 * VOLUME_STEP_DB;
    case 'MEDIUM_QUIET':
      return -VOLUME_STEP_DB;
    case 'MEDIUM':
      return 0.0;
    case 'MEDIUM_LOUD':
      return VOLUME_STEP_DB;
    case 'LOUD':
      return 2 * VOLUME_STEP_DB;
  }
}

export function getLocalTextToSpeechVolume(appSettings: AppSettings): number {
  const volume = appSettings.ttsVolume;
  switch (volume) {
    case 'QUIET':
      return 1.0 / Math.pow(10, 4 * VOLUME_STEP_DB / 20);
    case 'MEDIUM_QUIET':
      return 1.0 / Math.pow(10, 3 * VOLUME_STEP_DB / 20);
    case 'MEDIUM':
      return 1.0 / Math.pow(10, 2 * VOLUME_STEP_DB / 20);
    case 'MEDIUM_LOUD':
      return 1.0 / Math.pow(10, VOLUME_STEP_DB / 20);
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
  private lastNonEmptySpokenText: string|null = null;

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
    // NOTE: Reference getVoice() at the beginning because the voices are
    // populated lazily in some browsers and WebViews.
    if (this.getSpeechSynthesis()) {
      this.getSpeechSynthesis()!.getVoices();
    } else {
      console.warn(
          'window.speechSynthesis is unavailable; ' +
          'automatically falling back to cloud TTS');
      // When window.speechSynthesis is unavailable (in certain browsers such as
      // Opera Android), automatically go to the cloud TTS option.
      setTtsVoiceType('PERSONALIZED');
    }

    this.textEntryEndSubject.subscribe(async event => {
      if (!event.isFinal) {
        return;
      }
      let text = event.text.trim();
      if (text === '') {
        if (event.repeatLastNonEmpty && this.lastNonEmptySpokenText !== null) {
          text = this.lastNonEmptySpokenText;
        } else {
          return;
        }
      } else {
        this.lastNonEmptySpokenText = text;
      }
      if (!event.inAppTextToSpeechAudioConfig) {
        return;
      }
      const appSettings = await getAppSettings();
      const ttsVoiceType = appSettings.ttsVoiceType;
      if (ttsVoiceType === 'PERSONALIZED') {
        this.doCloudTextToSpeech(text, appSettings);
      } else {
        await this.doLocalTextToSpeech(text, appSettings);
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
            speaking_rate: appSettings.ttsSpeakingRate || 1.0,
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
  private async doLocalTextToSpeech(text: string, appSettings: AppSettings) {
    const utterance = new SpeechSynthesisUtterance(text.trim());
    await setUtteranceVoice(utterance);
    this.setListenersState('REQUESTING');
    utterance.onstart = () => {
      this.setListenersState('PLAY');
    };
    utterance.onend = () => {
      this.setListenersState('END');
    };
    utterance.volume = getLocalTextToSpeechVolume(appSettings);
    utterance.rate = appSettings.ttsSpeakingRate || 1.0;
    if (!this.audioPlayDisabledForTest) {
      this.getSpeechSynthesis()!.speak(utterance);
    }
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

  getSpeechSynthesis(): SpeechSynthesis|undefined {
    return window.speechSynthesis;
  }
}
