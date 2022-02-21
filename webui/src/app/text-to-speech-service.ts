/**
 * Types and interfaces related to text-to-speech (speech synthesis) service.
 */
import {HttpClient} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

/** Audio configuration for text-to-speech. */
export interface AudioConfig {
  audio_encoding: 'LINEAR16';

  // Speaking rate. 1.0 corresponds to baseline.
  // values <1.0 and >0.0 means slower than baseline.
  // Values >1.0 means faster than baseline.
  speaking_rate: number;

  // Volume (sound intensity) of the requested audio, in decibels
  // (dB). 0 means no additional gain relative to baseline.
  // Values <0 means intensity lower (quieter) than baseline.
  // Values >0 means intensity higher (louder) than baseline.
  volume_gain_db: number;

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
        volume_gain_db: request.audio_config.volume_gain_db,
        access_token: request.access_token,
      },
    });
  }
}
