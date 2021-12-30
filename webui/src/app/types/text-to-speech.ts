/** Types related to text-to-speech audio output. */

export interface TextToSpeechAudioConfig {
  // Volume gain in dB. 0 or undefined corresponds to the original volume (no
  // gain).
  volume_gain_db?: number;
}
