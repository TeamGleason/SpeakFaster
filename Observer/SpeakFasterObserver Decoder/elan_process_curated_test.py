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
        "[RedactedSensitive:13:00:48-13:01:45]")
    self.assertEqual(tbegin, 13 * 3600 + 48)
    self.assertEqual(tend, 13 * 3600 + 60 + 45)

  def testParseTimeRange_withMilliseconds(self):
    tbegin, tend = elan_process_curated.parse_time_range(
        "[RedactedInfo:13:00:48.123-13:01:45.789]")
    self.assertEqual(tbegin, 13 * 3600 + 48 + 0.123)
    self.assertEqual(tend, 13 * 3600 + 60 + 45 + 0.789)

  def testParseTimeRange_wrongOrderRaisesValueError(self):
    with self.assertRaisesRegex(ValueError, r"Begin and end time out of order"):
      elan_process_curated.parse_time_range(
          "[RedactedInfo:13:00:48.123-12:59:45.789]")
    with self.assertRaisesRegex(ValueError, r"Begin and end time out of order"):
      elan_process_curated.parse_time_range("[RedactedName:13:00:48-12:59:45]")
    with self.assertRaisesRegex(ValueError, r"Begin and end time out of order"):
      elan_process_curated.parse_time_range(
          "[RedactedName:13:00:00.500-13:00:00]")

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


class ApplySpeakerMapGetKeypressRedactionsTest(tf.test.TestCase):

  def setUp(self):
    super(ApplySpeakerMapGetKeypressRedactionsTest, self).setUp()
    self._realname_to_pseudonym = {
        "danielle": "Partner005",
        "sean": "User001",
    }

  def testAppliesPseudonyms(self):
    rows = [
        [0.1, 1.3, "SpeechTranscript", "Good morning. [Speaker:Danielle] "],
        [1.8, 1.9, "Keypress", "v"],
        [5.2, 6.0, "SpeechTranscript", "What a nice day. [SpeakerTTS:Sean]"]]
    ranges = elan_process_curated.apply_speaker_map_get_keypress_redactions(
        rows, self._realname_to_pseudonym)
    self.assertEqual(ranges, [])
    self.assertEqual(rows, [
        [0.1, 1.3, "SpeechTranscript", "Good morning. [Speaker:Partner005]"],
        [1.8, 1.9, "Keypress", "v"],
        [5.2, 6.0, "SpeechTranscript", "What a nice day. [SpeakerTTS:User001]"]])

  def testInvalidRealName_raisesValueErrorForInvalidRealName(self):
    rows = [
        [0.1, 1.3, "SpeechTranscript", "Good morning. [Speaker:Danielle]"],
        [5.2, 6.0, "SpeechTranscript", "What a nice day. [SpeakerTTS:Shan]"]]
    with self.assertRaisesRegex(
        ValueError, r"Cannot find real name in speaker tag: Shan"):
      elan_process_curated.apply_speaker_map_get_keypress_redactions(
          rows, self._realname_to_pseudonym)

  def testMissingSpeakerTag_raisesValueError(self):
    rows = [
        [0.1, 1.3, "SpeechTranscript", "Good morning."],
        [1.8, 1.9, "Keypress", "v"],
        [5.2, 6.0, "SpeechTranscript", "What a nice day. [SpeakerTTS:Sean]"]]
    with self.assertRaisesRegex(ValueError, r"add Speaker or SpeakerTTS tag"):
      elan_process_curated.apply_speaker_map_get_keypress_redactions(
          rows, self._realname_to_pseudonym)

  def testExtractsRedactionTimeRangesCorrectly(self):
    rows = [
        [0.1, 1.3, "SpeechTranscript", "Good morning. [Speaker:Danielle] "],
        [1.8, 1.9, "Keypress", "a"],
        [2.8, 2.9, "Keypress", "b"],
        [3.8, 3.9, "Keypress", "c"],
        [15.2, 16.0, "SpeechTranscript",
         "I have [RedactedSensitive:00:00:01.500-00:00:04] [SpeakerTTS:Sean]"],
        [21.8, 21.9, "Keypress", "d"],
        [22.8, 22.9, "Keypress", "e"],
        [23.8, 23.9, "Keypress", "f"],
        [25.2, 26.0, "SpeechTranscript",
         "I have [RedactedSensitive:00:00:21.500-00:00:23.600] [SpeakerTTS:Sean]"]]
    ranges = elan_process_curated.apply_speaker_map_get_keypress_redactions(
        rows, self._realname_to_pseudonym)
    self.assertEqual(ranges, [(1.5, 4.0), (21.5, 23.6)])


class RedactKeypressesTest(tf.test.TestCase):

  def testRedactsOnlyTheSpecifiedKeys(self):
    rows = [
        [0.1, 1.3, "SpeechTranscript", "Good morning. [Speaker:Partner005] "],
        [2.0, 2.1, "Keypress", "I"],
        [2.2, 2.3, "Keypress", "Space"],
        [2.4, 2.5, "Keypress", "h"],
        [2.6, 2.7, "Keypress", "a"],
        [2.8, 2.9, "Keypress", "v"],
        [2.8, 2.9, "Keypress", "e"],
        [3.0, 3.1, "Keypress", "Space"],
        [10.8, 10.9, "Keypress", "a"],
        [11.8, 11.9, "Keypress", "b"],
        [12.8, 12.9, "Keypress", "c"],
        [15.2, 16.0, "SpeechTranscript",
         "I have [RedactedSensitive:00:00:10.500-00:00:13] [SpeakerTTS:User001]"],
        [21.8, 21.9, "Keypress", "d"],
        [22.8, 22.9, "Keypress", "e"],
        [23.8, 23.9, "Keypress", "f"]]
    elan_process_curated.redact_keypresses(rows, [(10.5, 13)])
    self.assertEqual(rows, [
        [0.1, 1.3, "SpeechTranscript", "Good morning. [Speaker:Partner005] "],
        [2.0, 2.1, "Keypress", "I"],
        [2.2, 2.3, "Keypress", "Space"],
        [2.4, 2.5, "Keypress", "h"],
        [2.6, 2.7, "Keypress", "a"],
        [2.8, 2.9, "Keypress", "v"],
        [2.8, 2.9, "Keypress", "e"],
        [3.0, 3.1, "Keypress", "Space"],
        [10.8, 10.9, "Keypress", "[RedactedKey]"],
        [11.8, 11.9, "Keypress", "[RedactedKey]"],
        [12.8, 12.9, "Keypress", "[RedactedKey]"],
        [15.2, 16.0, "SpeechTranscript",
         "I have [RedactedSensitive:00:00:10.500-00:00:13] [SpeakerTTS:User001]"],
        [21.8, 21.9, "Keypress", "d"],
        [22.8, 22.9, "Keypress", "e"],
        [23.8, 23.9, "Keypress", "f"]])


if __name__ == "__main__":
  tf.test.main()
