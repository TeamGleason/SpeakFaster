/** Types related to text-to-speech audio output. */

export interface TextToSpeechAudioConfig {
  // Volume gain in dB. 0 or undefined corresponds to the original volume (no
  // gain). A positive value means a louder than original; a negative value
  // means softer than original.
  volume_gain_db?: number;
}
