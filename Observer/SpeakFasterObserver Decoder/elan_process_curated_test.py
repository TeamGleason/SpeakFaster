"""Unit tests for elan_process_curated."""
import json
import os

import tensorflow as tf

import elan_process_curated
import nlp
import tsv_data


class LoadSpeakerMapTest(tf.test.TestCase):

  @classmethod
  def setUpClass(cls):
    nlp.init()

  def testLoadSpeakerMap_success(self):
    speaker_map_tsv_path = os.path.join("testdata", "speaker_id_config.json")
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
    original_speaker_map_json_path = os.path.join("testdata", "speaker_id_config.json")
    modified_speaker_map_tsv_path = os.path.join(
        self.get_temp_dir(), "modified_speaker_id_config.json")
    with open(original_speaker_map_json_path, "r") as f_in:
      with open(modified_speaker_map_tsv_path, "w") as f_out:
        json_obj = json.load(f_in)
        json_obj["realname_to_pseudonym"]["danielle"] = "Partner007"
        json.dump(json_obj, f_out)
    with self.assertRaisesRegex(
        ValueError, r"Duplicate real names.*modified.*json: danielle"):
      elan_process_curated.load_speaker_map(modified_speaker_map_tsv_path)

  def testLoadSpeakerMap_duplicatePseudonymRaisesValueError(self):
    original_speaker_map_json_path = os.path.join("testdata", "speaker_id_config.json")
    modified_speaker_map_tsv_path = os.path.join(
        self.get_temp_dir(), "modified_speaker_id_config.json")
    with open(original_speaker_map_json_path, "r") as f_in:
      with open(modified_speaker_map_tsv_path, "w") as f_out:
        json_obj = json.load(f_in)
        json_obj["realname_to_pseudonym"]["John"] = "Partner002"
        json.dump(json_obj, f_out)
    with self.assertRaisesRegex(
        ValueError, r"Duplicate pseudonym.*modified.*json: Partner002"):
      elan_process_curated.load_speaker_map(modified_speaker_map_tsv_path)


class InferColumnsTest(tf.test.TestCase):

  @classmethod
  def setUpClass(cls):
    nlp.init()

  def testInferColumns_noHeader_success(self):
    tsv_path= os.path.join("testdata", "curated_1.tsv")
    column_order, has_header = elan_process_curated.infer_columns(tsv_path)
    self.assertEqual(column_order, (1, 2, 0, 3))
    self.assertEqual(has_header, False)

  def testInferColumns_hasHeader_success(self):
    tsv_path = os.path.join("testdata", "curated_with_header.tsv")
    column_order, has_header = elan_process_curated.infer_columns(tsv_path)
    self.assertEqual(column_order, (1, 2, 0, 3))
    self.assertEqual(has_header, True)

  def testCheckTierNames_detectsWrongTierName(self):
    tsv_path = os.path.join("testdata", "curated_with_wrong_tier_name.tsv")
    with self.assertRaisesRegex(
        ValueError, "Cannot find a tier column.*invalid tier names."):
      elan_process_curated.infer_columns(tsv_path)


class LoadRowsTest(tf.test.TestCase):

  @classmethod
  def setUpClass(cls):
    nlp.init()

  def testLoadRows_noHeader_success(self):
    tsv_path = os.path.join("testdata", "curated_1.tsv")
    column_order, has_header = elan_process_curated.infer_columns(tsv_path)
    rows = elan_process_curated.load_rows(
        tsv_path, column_order, has_header=has_header)
    self.assertEqual(rows, [
        [0.1, 0.9, 'SpeechTranscript', 'Hello, my friend'],
        [1.2, 2.5, 'SpeechTranscript', 'How are you doing today?'],
        [2.5, 2.6, 'Keypress', 'V'],
        [3.0, 3.2, 'AudioEvents1', 'Doorbell']])

  def testLoadRows_noHeader_success(self):
    tsv_path = os.path.join("testdata", "curated_with_header.tsv")
    column_order, has_header = elan_process_curated.infer_columns(tsv_path)
    rows = elan_process_curated.load_rows(
        tsv_path, column_order, has_header=has_header)
    self.assertEqual(rows, [
        [0.1, 0.9, 'SpeechTranscript', 'Hello, my friend'],
        [1.2, 2.5, 'SpeechTranscript', 'How are you doing today?'],
        [2.5, 2.6, 'Keypress', 'V'],
        [3.0, 3.2, 'AudioEvents1', 'Doorbell']])

  def testLoadRows_incorrectTBeginRaisesValueError(self):
    tsv_path = os.path.join("testdata", "curated_with_wrong_tend.tsv")
    column_order, has_header = elan_process_curated.infer_columns(tsv_path)
    with self.assertRaisesRegex(
        ValueError, r"Line 4.*tBegin.*tEnd.*order.*2\.900.*<.*3\.000"):
      elan_process_curated.load_rows(
          tsv_path, column_order, has_header=has_header)


class ApplySpeakerMapGetKeypressRedactionsTest(tf.test.TestCase):

  @classmethod
  def setUpClass(cls):
    nlp.init()

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
    ranges = elan_process_curated.apply_speaker_map_and_redaction_masks(
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
      elan_process_curated.apply_speaker_map_and_redaction_masks(
          rows, self._realname_to_pseudonym)

  def testMissingSpeakerTag_raisesValueError(self):
    rows = [
        [0.1, 1.3, "SpeechTranscript", "Good morning."],
        [1.8, 1.9, "Keypress", "v"],
        [5.2, 6.0, "SpeechTranscript", "What a nice day. [SpeakerTTS:Sean]"]]
    with self.assertRaisesRegex(ValueError, r"add Speaker or SpeakerTTS tag"):
      elan_process_curated.apply_speaker_map_and_redaction_masks(
          rows, self._realname_to_pseudonym)

  def testAppliesRedactionMasksAndSpeakerPseudonyms_forNoTimeSpans(self):
    rows = [
        [5.2, 6.0, "SpeechTranscript",
         "Hi, Sean [Speaker:Danielle]"],
        [15.2, 16.0, "SpeechTranscript",
         "I have <RedactedSensitive>foo</RedactedSensitive> [Speaker:Danielle]"],
        [25.2, 26.0, "SpeechTranscript",
         "I think <RedactedSensitive>bar baz</RedactedSensitive> [Speaker:Danielle]"]]
    ranges = elan_process_curated.apply_speaker_map_and_redaction_masks(
        rows, self._realname_to_pseudonym)
    self.assertEqual(
        rows[0],
        [5.2, 6.0, "SpeechTranscript", "Hi, Sean [Speaker:Partner005]"])
    self.assertEqual(
        rows[1],
        [15.2, 16.0, "SpeechTranscript", "I have [RedactedSensitive] [Speaker:Partner005]"])
    self.assertEqual(
        rows[2],
        [25.2, 26.0, "SpeechTranscript", "I think [RedactedSensitive] [Speaker:Partner005]"])

  def testAppliesRedactionMasksAndSpeakerPseudonyms_redactedSpeakerId(self):
    rows = [
        [5.2, 6.0, "SpeechTranscript",
         "<RedactedSpeaker>Hello</RedactedSpeaker> [Speaker:redacted]"]]
    ranges = elan_process_curated.apply_speaker_map_and_redaction_masks(
        rows, self._realname_to_pseudonym)
    self.assertEqual(ranges, [])
    self.assertLen(rows, 1)
    self.assertEqual(
        rows[0],
        [5.2, 6.0, "SpeechTranscript", "[RedactedSpeaker] [Speaker:redacted]"])

  def testExtractsRedactionTimeRangesCorrectly(self):
    rows = [
        [0.1, 1.3, "SpeechTranscript", "Good morning. [Speaker:Danielle] "],
        [1.8, 1.9, "Keypress", "a"],
        [2.8, 2.9, "Keypress", "b"],
        [3.8, 3.9, "Keypress", "c"],
        [15.2, 16.0, "SpeechTranscript",
         "I have <RedactedSensitive time=\"00:00:01.500-00:00:04\">abc</RedactedSensitive> [SpeakerTTS:Sean]"],
        [21.8, 21.9, "Keypress", "d"],
        [22.8, 22.9, "Keypress", "e"],
        [23.8, 23.9, "Keypress", "f"],
        [25.2, 26.0, "SpeechTranscript",
         "I have <RedactedSensitive time=\"00:00:21.500-00:00:23.600\">de</RedactedSensitive> [SpeakerTTS:Sean]"]]
    ranges = elan_process_curated.apply_speaker_map_and_redaction_masks(
        rows, self._realname_to_pseudonym)
    self.assertEqual(
        rows[4][3],
        "I have [RedactedSensitive time=\"1.500-4.000\"] [SpeakerTTS:User001]")
    self.assertEqual(
        rows[8][3],
        "I have [RedactedSensitive time=\"21.500-23.600\"] [SpeakerTTS:User001]")
    self.assertEqual(ranges, [(1.5, 4.0), (21.5, 23.6)])

  def testHandlingValidBackgroundSpeechLabel(self):
    rows = [
        [5.2, 6.0, "SpeechTranscript",
         "[BackgroundSpeech] Random content [Speaker:Danielle]"]]
    ranges = elan_process_curated.apply_speaker_map_and_redaction_masks(
        rows, self._realname_to_pseudonym)
    self.assertEqual(ranges, [])
    self.assertLen(rows, 1)
    self.assertEqual(
        rows[0],
        [5.2, 6.0, "SpeechTranscript",
        "[BackgroundSpeech] Random content [Speaker:Partner005]"])

  def testUnintelligibleArticulationTag_isRecognized(self):
    rows = [
        [5.2, 6.0, "SpeechTranscript",
         "[Unintelligible:Articulation] Random content [Speaker:Danielle]"]]
    ranges = elan_process_curated.apply_speaker_map_and_redaction_masks(
        rows, self._realname_to_pseudonym)
    self.assertEqual(ranges, [])

  def testUnintelligibleCrosstalkTag_isRecognized(self):
    rows = [
        [5.2, 6.0, "SpeechTranscript",
         "[Unintelligible:Crosstalk] Random content [Speaker:Danielle]"]]
    ranges = elan_process_curated.apply_speaker_map_and_redaction_masks(
        rows, self._realname_to_pseudonym)
    self.assertEqual(ranges, [])

  def testUnintelligibleNoiseTag_isRecognized(self):
    rows = [
        [5.2, 6.0, "SpeechTranscript",
         "[Unintelligible:Noise] Random content [Speaker:Danielle]"]]
    ranges = elan_process_curated.apply_speaker_map_and_redaction_masks(
        rows, self._realname_to_pseudonym)
    self.assertEqual(ranges, [])

  def testOverlappingRedactionTimeRangesRaisesValueError(self):
    rows = [
        [0.1, 1.3, "SpeechTranscript", "Good morning. [Speaker:Danielle] "],
        [1.8, 1.9, "Keypress", "a"],
        [2.8, 2.9, "Keypress", "b"],
        [3.8, 3.9, "Keypress", "c"],
        [15.2, 16.0, "SpeechTranscript",
         "I have <RedactedSensitive time=\"00:00:01.500-00:00:04\">abc</RedactedSensitive> [SpeakerTTS:Sean]"],
        [21.8, 21.9, "Keypress", "d"],
        [22.8, 22.9, "Keypress", "e"],
        [23.8, 23.9, "Keypress", "f"],
        [25.2, 26.0, "SpeechTranscript",
         "I have <RedactedSensitive time=\"00:00:03.500-00:00:05\">de</RedactedSensitive> [SpeakerTTS:Sean]"]]
    with self.assertRaisesRegexp(
        ValueError,
        r"Redaction time interval \(1\.5, 4\.0\) overlaps with \(3\.5, 5\.0\)\ \(Unit: s\). Check"):
      elan_process_curated.apply_speaker_map_and_redaction_masks(
          rows, self._realname_to_pseudonym)

  def testInvalidInitialLabelCausesValueError(self):
    rows = [
        [5.2, 6.0, "SpeechTranscript",
        # Notice the typo here.
         "[BackgroundSpeehc] Random content [Speaker:Danielle]"]]
    with self.assertRaisesRegex(
        ValueError,
        r"Found unrecognized label at the beginning of: \[BackgroundSpeehc\]"):
      elan_process_curated.apply_speaker_map_and_redaction_masks(
          rows, self._realname_to_pseudonym)


class TimeIntervalsOverlapTest(tf.test.TestCase):

  def testReturnsTrueForOverlappingCases(self):
    self.assertTrue(elan_process_curated.time_intervals_overlap(
        (50.0, 60.0), (59.0, 70.0)))
    self.assertTrue(elan_process_curated.time_intervals_overlap(
        (59.0, 70.0), (50.0, 60.0)))
    self.assertTrue(elan_process_curated.time_intervals_overlap(
        (50.0, 60.0), (49.0, 61.0)))
    self.assertTrue(elan_process_curated.time_intervals_overlap(
        (49.0, 61.0), (50.0, 60.0)))
    self.assertTrue(elan_process_curated.time_intervals_overlap(
        (50.0, 60.0), (50.0, 60.0)))

  def testReturnsFalseForNonoverlappingCases(self):
    self.assertFalse(elan_process_curated.time_intervals_overlap(
        (50.0, 60.0), (60.0, 70.0)))
    self.assertFalse(elan_process_curated.time_intervals_overlap(
        (60.0, 70.0), (50.0, 60.0)))
    self.assertFalse(elan_process_curated.time_intervals_overlap(
        (50.0, 59.0), (60.0, 70.0)))
    self.assertFalse(elan_process_curated.time_intervals_overlap(
        (60.0, 70.0), (50.0, 59.0)))

  def testWrongOrderInTimeIntervalsRaisesAssertionError(self):
    with self.assertRaises(AssertionError):
      elan_process_curated.time_intervals_overlap(
          (50.0, 49.9), (50.0, 70.0))
    with self.assertRaises(AssertionError):
      elan_process_curated.time_intervals_overlap(
          (50.0, 60.0), (70.0, 69.9))

class RedactKeypressesTest(tf.test.TestCase):

  @classmethod
  def setUpClass(cls):
    nlp.init()

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

  def testUnusedRedactionTimeRanges_raisesValueError(self):
    rows = [
        [0.1, 1.3, "SpeechTranscript", "Good morning. [Speaker:Partner005] "],
        [1.5, 1.9, "SpeechTranscript",
         "I have [RedactedSensitive:00:00:00-00:00:01] [SpeakerTTS:User001]"],
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
         "I have [RedactedSensitive:00:00:18.500-00:00:19] [SpeakerTTS:User001]"]]
    with self.assertRaisesRegex(
        ValueError, r"2 unused keypress redaction time range.*0, 1.*18\.5.* 19"):
      elan_process_curated.redact_keypresses(rows, [(0, 1), (18.5, 19)])


class CalculuateSpeechCurationStatsTest(tf.test.TestCase):

  @classmethod
  def setUpClass(cls):
    nlp.init()

  def setUp(self):
    super().setUp()
    original_rows = [
        (1.0, 2.0, "SpeechTranscript", "When do you want to sleep [U1] [Speaker #1]"),
        (10.0, 20.0, "SpeechTranscript", "How about kate o'clock [U2] [Speaker #2]"),
        (21.0, 22.0, "SpeechTranscript", "Beep [U3] [Speaker #1]"),
        (30.0, 30.01, "Keypress", "a"),
        (31.0, 31.01, "Keypress", "b"),
        (32.0, 32.01, "Keypress", "c"),
    ]
    self.merged_tsv_path = os.path.join(self.get_temp_dir(), "merged.tsv")
    with open(self.merged_tsv_path, "w") as f:
      f.write(tsv_data.HEADER + "\n")
      for row in original_rows:
        f.write(tsv_data.DELIMITER.join([str(item) for item in row]) + "\n")
    self.realname_to_pseudonym = {
        "sean": "User001",
        "tim": "Partner001",
    }

  def testGetMisspelledWords_returnsWrongWords(self):
    tsv_path = os.path.join("testdata", "curated_with_typos.tsv")
    misspelled_words = elan_process_curated.get_misspelled_words(tsv_path)
    self.assertItemsEqual(misspelled_words, ["freend", "doign"])

  def testGetMisspelledWords_returnsEmptyListWhenAllWordsAreCorrect(self):
    tsv_path = os.path.join("testdata", "curated_1.tsv")
    misspelled_words = elan_process_curated.get_misspelled_words(tsv_path)
    self.assertEqual(misspelled_words, [])


if __name__ == "__main__":
  tf.test.main()
