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


class RegroupUtterancesTest(tf.test.TestCase):

  def testRegroupOneSpeakerTwoUtterances_notObeyingOriginalBoundary(self):
    utterances = ["would you like to", "sit down"]
    words = [
        ("would", 1, 0.1, 0.2),
        ("you", 1, 0.2, 0.3),
        ("like", 1, 0.3, 0.4),
        ("to", 1, 0.5, 0.6),
        ("sit", 1, 0.6, 0.7),
        ("down", 1, 0.7, 0.8)]
    regrouped = audio_asr.regroup_utterances(utterances, words)
    self.assertEqual(regrouped, [("would you like to sit down", 1, 0.1, 0.8)])

  def testRegroupOneSpeakerTwoUtterances_obeyingOriginalBoundary(self):
    utterances = ["would you like to", "sit down"]
    words = [
        ("would", 1, 0.1, 0.2),
        ("you", 1, 0.2, 0.3),
        ("like", 1, 0.3, 0.4),
        ("to", 1, 0.5, 0.6),
        ("sit", 1, 1.6, 1.7),
        ("down", 1, 1.7, 1.8)]
    regrouped = audio_asr.regroup_utterances(utterances, words)
    self.assertEqual(regrouped, [
        ("would you like to", 1, 0.1, 0.6),
        ("sit down", 1, 1.6, 1.8)])

  def testRegroupThreeSpeakersOneUtterances(self):
    utterances = ["would you like to sit down no me neither"]
    words = [
        ("would", 1, 0.1, 0.2),
        ("you", 1, 0.2, 0.3),
        ("like", 1, 0.3, 0.4),
        ("to", 1, 0.5, 0.6),
        ("sit", 1, 0.6, 0.7),
        ("down", 1, 0.7, 0.8),
        ("no", 2, 0.8, 0.9),
        ("me", 3, 0.9, 1.0),
        ("neither", 3, 1.0, 1.1)]
    regrouped = audio_asr.regroup_utterances(utterances, words)
    self.assertEqual(regrouped, [
        ("would you like to sit down", 1, 0.1, 0.8),
        ("no", 2, 0.8, 0.9),
        ("me neither", 3, 0.9, 1.1)])

  def testRegroupTwoSpeakersTwoUtterances(self):
    utterances = [
        "would you like to sit down no",
        "been sitting all day"]
    words = [
        ("would", 1, 0.1, 0.2),
        ("you", 1, 0.2, 0.3),
        ("like", 1, 0.3, 0.4),
        ("to", 1, 0.5, 0.6),
        ("sit", 1, 0.6, 0.7),
        ("down", 1, 0.7, 0.8),
        ("no", 2, 0.8, 0.9),
        ("been", 2, 0.9, 1.0),
        ("sitting", 2, 1.0, 1.1),
        ("all", 2, 1.1, 1.2),
        ("day", 2, 1.2, 1.3)]
    regrouped = audio_asr.regroup_utterances(utterances, words)
    self.assertEqual(regrouped, [
        ("would you like to sit down", 1, 0.1, 0.8),
        ("no been sitting all day", 2, 0.8, 1.3)])

  def testRegroupTwoSpeakersThreeUtterances(self):
    utterances = [
        "would you like to sit down no",
        "been sitting all day ",
        "alright"]
    words = [
        ("would", 1, 0.1, 0.2),
        ("you", 1, 0.2, 0.3),
        ("like", 1, 0.3, 0.4),
        ("to", 1, 0.5, 0.6),
        ("sit", 1, 0.6, 0.7),
        ("down", 1, 0.7, 0.8),
        ("no", 2, 0.8, 0.9),
        ("been", 2, 0.9, 1.0),
        ("sitting", 2, 1.0, 1.1),
        ("all", 2, 1.1, 1.2),
        ("day", 2, 1.2, 1.3),
        ("alright", 1, 1.5, 1.6)]
    regrouped = audio_asr.regroup_utterances(utterances, words)
    self.assertEqual(regrouped, [
        ("would you like to sit down", 1, 0.1, 0.8),
        ("no been sitting all day", 2, 0.8, 1.3),
        ("alright", 1, 1.5, 1.6)])

  def testUnmatchedWordsRaisesValuError(self):
    utterances = ["would you like to", "sit down"]
    words = [
        ("would", 1, 0.1, 0.2),
        ("you", 1, 0.2, 0.3)]
    with self.assertRaisesRegex(ValueError, r"Some words .* missing"):
      audio_asr.regroup_utterances(utterances, words)

  def testMismatchInWordsRaisesValueError(self):
      utterances = [
          "would you like to sit down no",
          "been sitting all day "]
      words = [("would", 1, 0.1, 0.2), ("thou", 1, 0.2, 0.3)]
      with self.assertRaises(ValueError):
        audio_asr.regroup_utterances(utterances, words)


if __name__ == "__main__":
  tf.test.main()
