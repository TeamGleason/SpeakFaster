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


class ConcatenateAudioFilesTest(tf.test.TestCase):

  def testEmptyPathsRaisesValueError(self):
    with self.assertRaisesRegexp(ValueError, r"Empty input paths"):
      audio_asr.concatenate_audio_files(
          [], os.path.join(self.get_temp_dir(), "concatenated.wav"))

  def testConcatenateASingleWavFiles(self):
    wav_path_1 = os.path.join(
        self.get_temp_dir(), "20210710T080000000-MicWavIn.wav")
    wavfile.write(wav_path_1, 16000, np.zeros(16000 * 10, dtype=np.int16))
    concat_path = os.path.join(self.get_temp_dir(), "concatenated.wav")
    duration_s = audio_asr.concatenate_audio_files([wav_path_1], concat_path)
    fs, xs = wavfile.read(concat_path)
    self.assertEqual(duration_s, 10)
    self.assertEqual(fs, 16000)
    self.assertAllEqual(xs, np.zeros(16000 * 10, dtype=np.int16))

  def testConcatenateTwoWavFiles(self):
    wav_path_1 = os.path.join(
        self.get_temp_dir(), "20210710T080000000-MicWavIn.wav")
    wavfile.write(wav_path_1, 16000, np.zeros(16000 * 10, dtype=np.int16))
    wav_path_2 = os.path.join(
        self.get_temp_dir(), "20210710T080010000-MicWavIn.wav")
    wavfile.write(wav_path_2, 16000, 12 * np.ones(16000 * 5, dtype=np.int16))
    concat_path = os.path.join(self.get_temp_dir(), "concatenated.wav")
    duration_s = audio_asr.concatenate_audio_files(
        [wav_path_1, wav_path_2], concat_path)
    fs, xs = wavfile.read(concat_path)
    self.assertEqual(duration_s, 15)
    self.assertEqual(fs, 16000)
    self.assertAllClose(xs, np.concatenate([
        np.zeros(16000 * 10, dtype=np.int16),
        12 * np.ones(16000 * 5, dtype=np.int16)]))

  def testConcatenateTwoWavFilesWithGapFilling_gapExists(self):
    wav_path_1 = os.path.join(
        self.get_temp_dir(), "20210710T080000000Z-MicWavIn.wav")
    wavfile.write(wav_path_1, 16000, np.zeros(16000 * 10, dtype=np.int16))
    # There is a 0.5-second gap.
    wav_path_2 = os.path.join(
        self.get_temp_dir(), "20210710T080010500Z-MicWavIn.wav")
    wavfile.write(wav_path_2, 16000, 12 * np.ones(16000 * 5, dtype=np.int16))
    concat_path = os.path.join(self.get_temp_dir(), "concatenated.wav")
    duration_s = audio_asr.concatenate_audio_files(
        [wav_path_1, wav_path_2], concat_path, fill_gaps=True)
    self.assertEqual(duration_s, 15.5)
    fs, xs = wavfile.read(concat_path)
    self.assertEqual(fs, 16000)
    self.assertAllEqual(xs, np.concatenate([
        np.zeros(16000 * 10, dtype=np.int16),
        np.zeros(int(16000 * 0.5), dtype=np.int16),
        12 * np.ones(16000 * 5, dtype=np.int16)]))

  def testConcatenateTwoWavFilesWithGapFilling_singleFileEdgeCase(self):
    wav_path_1 = os.path.join(
        self.get_temp_dir(), "20210710T080000000-MicWavIn.wav")
    wavfile.write(wav_path_1, 16000, np.ones(16000 * 10, dtype=np.int16))
    concat_path = os.path.join(self.get_temp_dir(), "concatenated.wav")
    duration_s = audio_asr.concatenate_audio_files(
        [wav_path_1], concat_path, fill_gaps=True)
    self.assertEqual(duration_s, 10.0)
    fs, xs = wavfile.read(concat_path)
    self.assertEqual(fs, 16000)
    self.assertAllEqual(xs, np.concatenate([
        np.ones(16000 * 10, dtype=np.int16)]))

  def testConcatenateTwoWavFilesWithGapFilling_gapDoesNotExist(self):
    wav_path_1 = os.path.join(
        self.get_temp_dir(), "20210710T080000000Z-MicWavIn.wav")
    wavfile.write(wav_path_1, 16000, np.zeros(16000 * 10, dtype=np.int16))
    # There is actually no gap, even though we'll specify fill_gaps=True)
    wav_path_2 = os.path.join(
        self.get_temp_dir(), "20210710T080010000Z-MicWavIn.wav")
    wavfile.write(wav_path_2, 16000, 12 * np.ones(16000 * 5, dtype=np.int16))
    concat_path = os.path.join(self.get_temp_dir(), "concatenated.wav")
    duration_s = audio_asr.concatenate_audio_files(
        [wav_path_1, wav_path_2], concat_path, fill_gaps=True)
    self.assertEqual(duration_s, 15.0)
    fs, xs = wavfile.read(concat_path)
    self.assertEqual(fs, 16000)
    self.assertAllEqual(xs, np.concatenate([
        np.zeros(16000 * 10, dtype=np.int16),
        12 * np.ones(16000 * 5, dtype=np.int16)]))

  def testConcatenateTwoWavFilesWithNegativeGapTooLarge_raisesError(self):
    wav_path_1 = os.path.join(
        self.get_temp_dir(), "20210710T080000000Z-MicWavIn.wav")
    wavfile.write(wav_path_1, 16000, np.zeros(16000 * 10, dtype=np.int16))
    # There is a 3-second "negative gap".
    wav_path_2 = os.path.join(
        self.get_temp_dir(), "20210710T080007000Z-MicWavIn.wav")
    wavfile.write(wav_path_2, 16000, 12 * np.ones(16000 * 5, dtype=np.int16))
    concat_path = os.path.join(self.get_temp_dir(), "concatenated.wav")
    with self.assertRaisesRegexp(ValueError, "too early"):
      audio_asr.concatenate_audio_files(
          [wav_path_1, wav_path_2], concat_path, fill_gaps=True)

  def testConcatenateTwoWavFilesWithNegativeGapNegativeButNotTooLarge_leadsToHeadAdjustment(self):
    wav_path_1 = os.path.join(
        self.get_temp_dir(), "20210710T080000000Z-MicWavIn.wav")
    wavfile.write(wav_path_1, 16000, np.zeros(16000 * 10, dtype=np.int16))
    # There is a 1.5-second "negative gap" (> 0.5 s buto < 2.0 s).
    wav_path_2 = os.path.join(
        self.get_temp_dir(), "20210710T080008500Z-MicWavIn.wav")
    wavfile.write(
        wav_path_2,
        16000,
        np.concatenate([12 * np.ones(int(16000 * 1.5), dtype=np.int16),
                        24 * np.ones(16000 * 5, dtype=np.int16)]))
    concat_path = os.path.join(self.get_temp_dir(), "concatenated.wav")
    audio_asr.concatenate_audio_files(
        [wav_path_1, wav_path_2], concat_path, fill_gaps=True)
    fs, xs = wavfile.read(concat_path)
    self.assertEqual(fs, 16000)
    self.assertAllEqual(xs, np.concatenate([
        np.zeros(16000 * 10, dtype=np.int16),
        24 * np.ones(16000 * 5, dtype=np.int16)]))

  def testConcatenateTwoWavFilesWithGapFilling_singleFileEdgeCase(self):
    concat_path = os.path.join(self.get_temp_dir(), "concatenated.wav")
    with self.assertRaisesRegex(ValueError, r"Empty input paths"):
      audio_asr.concatenate_audio_files([], concat_path, fill_gaps=True)


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
        16000, np.zeros(16000 * 5))  # This file should be included.
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T080015000-MicWavIn.wav"),
        16000, np.zeros(16000 * 1))  # This file should be included.
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T120000000-MicWavIn.wav"),
        16000, np.zeros(16000 * 1))  # This file sould be excluded.

    (path_groups,
     group_durations_sec) = audio_asr.get_consecutive_audio_file_paths(
        os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav"),
        group_limit_sec=15)
    self.assertEqual(path_groups, [
        [os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav"),
         os.path.join(self.get_temp_dir(), "20210710T080010000-MicWavIn.wav")],
        [os.path.join(self.get_temp_dir(), "20210710T080015000-MicWavIn.wav")]])
    self.assertEqual(group_durations_sec, [10 + 5, 1])

  def testGetConsecutiveAudioFilePaths_findsASingleFile(self):
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T060000000-MicWavIn.wav"),
        16000, np.zeros(16000 * 1))  # This file should be ignored.
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav"),
        16000, np.zeros(16000 * 10))  # This is the first file.
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T090000000-MicWavIn.wav"),
        16000, np.zeros(16000 * 5))  # This file should be excluded.

    (path_groups,
     group_durations_sec) = audio_asr.get_consecutive_audio_file_paths(
        os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav"))
    self.assertEqual(path_groups, [
        [os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav")]])
    self.assertEqual(group_durations_sec, [10])

  def testGetConsecutiveAudioFilePaths_lastOneIsIncluded(self):
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav"),
        16000, np.zeros(16000 * 5))  # This is the first file.
    wavfile.write(
        os.path.join(self.get_temp_dir(), "20210710T080005000-MicWavIn.wav"),
        16000, np.zeros(16000 * 1))  # This file should be included.

    (path_groups,
     group_durations_sec) = audio_asr.get_consecutive_audio_file_paths(
        os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav"))
    self.assertEqual(path_groups, [
        [os.path.join(self.get_temp_dir(), "20210710T080000000-MicWavIn.wav"),
         os.path.join(self.get_temp_dir(), "20210710T080005000-MicWavIn.wav")]])
    self.assertEqual(group_durations_sec, [6])


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
