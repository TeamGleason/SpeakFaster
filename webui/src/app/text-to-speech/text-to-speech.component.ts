/** Component for in-app text-to-speech audio output. */
import {HttpErrorResponse} from '@angular/common/http';
import {Component, ElementRef, Input, OnInit, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';

import {TextToSpeechErrorResponse, TextToSpeechService} from '../text-to-speech-service';
import {TextEntryEndEvent} from '../types/text-entry';

const DEFAULT_LANGUAGE_CODE = 'en-US';
const DEFAULT_AUDIO_ENCODING = 'LINEAR16';

@Component({
  selector: 'app-text-to-speech-component',
  templateUrl: './text-to-speech.component.html',
  providers: [TextToSpeechService],
})
export class TextToSpeechComponent implements OnInit {
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;
  @Input() accessToken!: string;

  @ViewChildren('ttsAudio')
  ttsAudioElements!: QueryList<ElementRef<HTMLAudioElement>>;

  errorMessage?: string|null = null;
  audioPlaying: boolean = false;

  constructor(public textToSpeechService: TextToSpeechService) {}

  ngOnInit() {
    this.textEntryEndSubject.subscribe(event => {
      // TODO(cais): Add unit test.
      if (!event.isFinal || event.inAppTextToSpeechAudioConfig === undefined) {
        return;
      }
      const {volume_gain_db} = event.inAppTextToSpeechAudioConfig;
      if (volume_gain_db !== undefined && volume_gain_db !== 0) {
        // TODO(#49): Support volume control.
        throw new Error('Volume gain adjustment is not implemented yet.');
      }
      this.sendTextToSpeechRequest(event.text);
    });
  }

  sendTextToSpeechRequest(text: string) {
    if (this.accessToken.length === 0) {
      this.errorMessage = 'no access token';
      return;
    }
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
                  this.audioPlaying = true;
                };
                ttsAudioElement.onended = () => {
                  this.audioPlaying = false;
                };
              }
              if (!data.audio_content) {
                this.errorMessage = 'audio is empty';
                return;
              }
              ttsAudioElement.src =
                  'data:audio/wav;base64,' + data.audio_content;
              ttsAudioElement.play();
            },
            (error: HttpErrorResponse) => {
              if (error.error &&
                  (error.error as TextToSpeechErrorResponse).error_message) {
                this.errorMessage =
                    (error.error as TextToSpeechErrorResponse).error_message;
              } else {
                this.errorMessage = `${error.statusText}`;
              }
            });
  }
}
