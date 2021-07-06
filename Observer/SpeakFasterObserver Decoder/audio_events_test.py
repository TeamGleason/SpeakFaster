"""Unit tests for audio_events."""
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import os
import tempfile
import unittest

import numpy as np
import tensorflow as tf

import audio_events


class AudioEventsTest(tf.test.TestCase):

  def testMaybeDownloadYamnetTfliteFile(self):
    local_tflite_path = os.path.join(
        tempfile.gettempdir(), audio_events.LOCAL_YAMNET_FILENAME)
    if os.path.isfile(local_tflite_path):
      os.remove(local_tflite_path)
    local_path = audio_events.maybe_download_yamnet_tflite()
    self.assertEqual(
        local_path,
        os.path.join(tempfile.gettempdir(), audio_events.LOCAL_YAMNET_FILENAME))
    self.assertTrue(os.path.isfile(local_path))

  def testMaybeDownloadYamnetClassMapCsvFile(self):
    local_class_map_path = os.path.join(
        tempfile.gettempdir(),
        os.path.basename(audio_events.YAMNET_CLASS_MAP_URL))
    if os.path.isfile(local_class_map_path):
      os.remove(local_class_map_path)
    local_path = audio_events.maybe_download_yamnet_class_map()
    self.assertEqual(
        local_path,
        os.path.join(
            tempfile.gettempdir(),
            os.path.basename(audio_events.YAMNET_CLASS_MAP_URL)))
    self.assertTrue(os.path.isfile(local_path))

  def testGetYamnetClassMap(self):
    class_names = audio_events.get_yamnet_class_names()
    self.assertIsInstance(class_names, tuple)
    self.assertLen(class_names, 521)

  def testExtractAudioEvents(self):
    def noise_waveform_generator():
      # Return two waveforms of unequal lengths: 1.0 s and 1.5 s.
      yield np.random.normal(0, 0.1, size=[16000]).astype(np.float32)
      yield np.random.normal(0, 0.1, size=[24000]).astype(np.float32)
    output = audio_events.extract_audio_events(
        noise_waveform_generator, fs=16000, threshold_score=0.25)

    self.assertLen(output, 2)
    seg_0_output = output[0]
    for item in seg_0_output:
      self.assertGreaterEqual(item[1], 0.25)
    seg_1_class_names = [item[0] for item in seg_0_output]
    # White noise gets recognized as Waterfall or Spray.
    self.assertTrue("Waterfall" in seg_1_class_names or "Spray" in seg_1_class_names)
    seg_1_output = output[1]
    for item in seg_1_output:
      self.assertGreaterEqual(item[1], 0.25)
    seg_1_class_names = [item[0] for item in seg_1_output]
    # White noise gets recognized as Waterfall or Spray.
    self.assertTrue("Waterfall" in seg_1_class_names or "Spray" in seg_1_class_names)

  def testIncorrectSampleRateLeadsToError(self):
    def dummy_generator():
      return
    with self.assertRaisesRegex(ValueError, r"sample rate.*18000"):
      output = audio_events.extract_audio_events(dummy_generator, fs=18000)


if __name__ == "__main__":
  tf.test.main() # run all tests
