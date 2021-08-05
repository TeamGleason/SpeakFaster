"""Unit tests for the audio_asr script."""
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import os

from google.cloud import speech_v1p1beta1 as speech
import numpy as np
from scipy.io import wavfile
import tensorflow as tf

import audio_asr


class GetAudioFileDurationSecTest(tf.test.TestCase):

  def testGetAudioFileDuration_returnsCorrectValueForWavFile(self):
    wav_path = os.path.join(self.get_temp_dir(), "a1.wav")
    wavfile.write(wav_path, 16000, np.zeros(24000))
    self.assertAllClose(audio_asr.get_audio_file_duration_sec(wav_path), 1.5)


class GetConsecutiveAudioFilePathsTest(tf.test.TestCase):

  def testGetConsecutiveAudioFilePaths_findsCorrectPathsSkippingWrongOnes(self):
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T060000000-MicWavIn.wav"),
        16000, np.zeros(16000 * 1))  # This file should be ignored.
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav"),
        16000, np.zeros(16000 * 10))  # This is the first file.
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T080010000-MicWavIn.wav"),
        16000, np.zeros(16000 * 5))
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T080015000-MicWavIn.wav"),
        16000, np.zeros(16000 * 1))
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T120000000-MicWavIn.wav"),
        16000, np.zeros(16000 * 1))

    paths, total_duration_sec = audio_asr.get_consecutive_audio_file_paths(
        os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav"))
    self.assertEqual(paths, [
        os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav"),
        os.path.join(self.get_temp_dir(), "20210710T080010000-MicWavIn.wav"),
        os.path.join(self.get_temp_dir(), "20210710T080015000-MicWavIn.wav")])
    self.assertEqual(total_duration_sec, 10 + 5 + 1)

  def testGetConsecutiveAudioFilePaths_findsASingleFile(self):
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T060000000-MicWavIn.wav"),
        16000, np.zeros(16000 * 1))  # This file should be ignored.
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav"),
        16000, np.zeros(16000 * 10))  # This is the first file.
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T090000000-MicWavIn.wav"),
        16000, np.zeros(16000 * 5))

    paths, total_duration_sec = audio_asr.get_consecutive_audio_file_paths(
        os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav"))
    self.assertEqual(paths, [
        os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav")])
    self.assertEqual(total_duration_sec, 10)


class LoadAudioDataTest(tf.test.TestCase):

  def testLoadAudioData_succeeds(self):
    audio_path = os.path.join(self.get_temp_dir(), "a1.wav")
    wavfile.write(audio_path, 16000, np.zeros(16000 * 1, dtype=np.int16))
    buffer = audio_asr.load_audio_data(audio_path, speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=16000,
        audio_channel_count=1,
        language_code="en-US"))
    self.assertLen(buffer, 16000 * 2)

  def testLoadAudioData_incorrecSampleRate_raiseValueError(self):
    audio_path = os.path.join(self.get_temp_dir(), "a1.wav")
    wavfile.write(audio_path, 16000, np.zeros(16000 * 1, dtype=np.int16))
    with self.assertRaises(ValueError):
      audio_asr.load_audio_data(audio_path, speech.RecognitionConfig(
          encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
          sample_rate_hertz=44100,
          audio_channel_count=1,
          language_code="en-US"))


class AudioDataGeneratorTest(tf.test.TestCase):

  def testTwoFiles(self):
    audio_path_1 = os.path.join(self.get_temp_dir(), "a1.wav")
    wavfile.write(audio_path_1, 16000, np.zeros(16000 * 1, dtype=np.int16))
    audio_path_2 = os.path.join(self.get_temp_dir(), "a2.wav")
    wavfile.write(audio_path_2, 16000, np.zeros(16000 * 1, dtype=np.int16))
    audio_paths = [audio_path_1, audio_path_2]
    config =  speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=16000,
        audio_channel_count=1,
        language_code="en-US")
    generator = audio_asr.audio_data_generator(audio_paths, config)
    self.assertLen(list(generator), 2)


if __name__ == "__main__":
  tf.test.main()
