/**
 * Types and interfaces related to text-to-speech (speech synthesis) service.
 */
import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

export interface AudioConfig {
  audio_encoding: 'LINEAR16';

  speaking_rate: number;

  // TODO(cais): Add prosody parameters such as pitch.
}

export interface TextToSpeechRequest {
  // Text representation of the speech.
  text: string;

  // Language code for the speech (e.g., en-US).
  language: string;

  // TODO(cais): Make optional.
  audio_config: AudioConfig;

  // Authentication for using the service.
  access_token: string;
}

export interface TextToSpeechResponse {
  // Encoded PCM audio. Assumed to be encoded in the audio/wav;base64 format.
  audio_content: string;

  audio_config: AudioConfig;
}

export interface TextToSpeechErrorResponse {
  error_message: string;
}

export interface TextToSpeechServiceStub {
  synthesizeSpeech(request: TextToSpeechRequest):
      Observable<TextToSpeechResponse>;
}

const TTS_ENDPOINT = '/tts';

@Injectable()
export class TextToSpeechService implements TextToSpeechServiceStub {
  constructor(private http: HttpClient) {}

  synthesizeSpeech(request: TextToSpeechRequest) {
    return this.http.get<TextToSpeechResponse>(TTS_ENDPOINT, {
      params: {
        text: request.text,
        language: request.language,
        audio_encoding: request.audio_config.audio_encoding,
        speaking_rate: request.audio_config.speaking_rate,
        access_token: request.access_token,
      },
    });
  }
}
