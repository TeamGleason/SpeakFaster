"""Unit tests for elan_process_curated."""
import os
import shutil

import tensorflow as tf

import elan_process_curated


class LoadSpeakerMapTest(tf.test.TestCase):

  def testLoadSpeakerMap_success(self):
    speaker_map_tsv_path = os.path.join("testdata", "speaker_map.tsv")
    realname_to_pseudonym = elan_process_curated.load_speaker_map(
        speaker_map_tsv_path)
    self.assertItemsEqual(realname_to_pseudonym, {
        "sean": "User001",
        "sherry": "Partner001",
        "tim": "Partner002",
        "jenny": "Partner003",
        "mike": "Partner004",
        "danielle": "Partner005",
    })

  def testLoadSpeakerMap_duplicateRealNamesRaisesValueError(self):
    original_speaker_map_tsv_path = os.path.join("testdata", "speaker_map.tsv")
    modified_speaker_map_tsv_path = os.path.join(
        self.get_temp_dir(), "modified_speaker_map.tsv")
    shutil.copy(original_speaker_map_tsv_path, modified_speaker_map_tsv_path)
    with open(modified_speaker_map_tsv_path, "a") as f:
      f.write("Danielle\tPartner006\n")
    with self.assertRaisesRegex(
        ValueError, r"Duplicate real name.*modified.*tsv: danielle"):
      elan_process_curated.load_speaker_map(modified_speaker_map_tsv_path)

  def testLoadSpeakerMap_duplicatePseudonymRaisesValueError(self):
    original_speaker_map_tsv_path = os.path.join("testdata", "speaker_map.tsv")
    modified_speaker_map_tsv_path = os.path.join(
        self.get_temp_dir(), "modified_speaker_map.tsv")
    shutil.copy(original_speaker_map_tsv_path, modified_speaker_map_tsv_path)
    with open(modified_speaker_map_tsv_path, "a") as f:
      f.write("John\tPartner002\n")
    with self.assertRaisesRegex(
        ValueError, r"Duplicate pseudonym.*modified.*tsv: Partner002"):
      elan_process_curated.load_speaker_map(modified_speaker_map_tsv_path)


class InferColumnsTest(tf.test.TestCase):

  def testInferColumns_success(self):
    tsv_path = os.path.join("testdata", "curated_1.tsv")
    column_order = elan_process_curated.infer_columns(tsv_path)
    self.assertEqual(column_order, (1, 2, 0, 3))

  def testCheckTierNames_detectsWrongTierName(self):
    tsv_path = os.path.join("testdata", "curated_with_wrong_tier_name.tsv")
    with self.assertRaisesRegex(
        ValueError, "Cannot find a tier column.*invalid tier names."):
      elan_process_curated.infer_columns(tsv_path)


class LoadRowsTest(tf.test.TestCase):

  def testLoadRows_success(self):
    tsv_path = os.path.join("testdata", "curated_1.tsv")
    column_order = elan_process_curated.infer_columns(tsv_path)
    rows = elan_process_curated.load_rows(tsv_path, column_order)
    self.assertEqual(rows, [
        [0.1, 0.9, 'SpeechTranscript', 'Hello, my friend'],
        [1.2, 2.5, 'SpeechTranscript', 'How are you doing today?'],
        [2.5, 2.6, 'Keypress', 'V'],
        [3.0, 3.2, 'AudioEvents1', 'Doorbell']])

  def testLoadRows_incorrectTBeginRaisesValueError(self):
    tsv_path = os.path.join("testdata", "curated_with_wrong_tend.tsv")
    column_order = elan_process_curated.infer_columns(tsv_path)
    with self.assertRaisesRegex(
        ValueError, r"Line 4.*tBegin.*tEnd.*order.*2\.900.*<.*3\.000"):
      elan_process_curated.load_rows(tsv_path, column_order)


class ParseTimeRangeTest(tf.test.TestCase):

  def testParseTimeRange_noMilliseconds(self):
    tbegin, tend = elan_process_curated.parse_time_range(
        "[RedactedSensitive:00:01:23-00:02:01]")
    self.assertEqual(tbegin, 83.0)
    self.assertEqual(tend, 121.0)

  def testParseTimeRange_invalidFormat_raisesValueError(self):
    with self.assertRaises(ValueError):
      elan_process_curated.parse_time_range("[RedactedName:]")
    with self.assertRaises(ValueError):
      elan_process_curated.parse_time_range("[Redacted:00:01:23-]")
    with self.assertRaises(ValueError):
      elan_process_curated.parse_time_range("[Redacted:00:01:23- ]")
    with self.assertRaises(ValueError):
      elan_process_curated.parse_time_range("[Redacted:-00:01:23]")
    with self.assertRaises(ValueError):
      elan_process_curated.parse_time_range("[Redacted: -00:01:23]")


if __name__ == "__main__":
  tf.test.main()
