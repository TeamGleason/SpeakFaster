"""Unit tests for the process_keypresses module."""
import csv
from datetime import datetime
import os
import tempfile
import unittest

from google import protobuf

import keypresses_pb2
import process_keypresses


def get_keypress(key):
  return keypresses_pb2.KeyPress(KeyPress=key)


def create_keypresses(chars, timestamps_millis=1):
  """Create a KeyPresses proto.

  Args:
    chars: Characters for the keypresses, as a list of strings.
    timestamp_millis: Can be a single int, in which case it is interpreted
      as the timestamp step size between the successive keys. Can also be
      a list of ints, in which case the values are interpreted as the timestamps
      for the keys in milliseconds since epoch.

  Returns:
    A KeyPresses proto.
  """
  keypresses = keypresses_pb2.KeyPresses()
  if isinstance(timestamps_millis, int):
    interval = timestamps_millis
    timestamps_millis = []
    for i in range(len(chars)):
      timestamps_millis.append(i * interval)
  for i, char in enumerate(chars):
    timestamp = protobuf.timestamp_pb2.Timestamp()
    timestamp.FromMilliseconds(timestamps_millis[i])
    keypress = keypresses_pb2.KeyPress(KeyPress=char, Timestamp=timestamp)
    keypresses.keyPresses.append(keypress)
  return keypresses


def create_prediction(chars, timestamps_millis=1):
  "Create a Prediction object. See doc string of `create_keypresses()`."
  return process_keypresses.Prediction(
      create_keypresses(chars, timestamps_millis=timestamps_millis),
      0, len(chars))


class PredictionTest(unittest.TestCase):
  """Unit tests for the Prediction class."""

  def testShouldDetectCorrectEndingOfPredictions_startFromZero(self):
    keypresses = create_keypresses(
        ["e", "g", "g", "s"], timestamps_millis=[0, 1, 2, 5000])
    prediction = process_keypresses.Prediction(keypresses, 0, 4)
    self.assertEqual(prediction.prediction_string, "egg")
    self.assertEqual(prediction.end_index, 2)

  def testShouldDetectCorrectEndingOfPredictions_startFromNonZero(self):
    keypresses = create_keypresses(
        ["a", "an", "Space", "e", "g", "g", "s"],
        timestamps_millis=[0, 1, 2, 2000, 2001, 2002, 5000])
    prediction = process_keypresses.Prediction(keypresses, 4, 7)
    self.assertEqual(prediction.prediction_string, "gg")
    self.assertEqual(prediction.end_index,  5)


class PhraseTest(unittest.TestCase):
  """Unit tests for the Phrase class."""

  def testAddGazeInitiatedKeys_withoutBackspace(self):
    phrase = process_keypresses.Phrase(datetime.now, 0)
    phrase.add_non_control_key(
        get_keypress("h"), shift_on=True, is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("e"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("l"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("l"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("o"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("."), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("Space"), is_gaze_initiated=True)
    phrase.speak(gaze_keypress_count=2)
    self.assertEqual(phrase.recon_string, "Hello. ")
    self.assertEqual(phrase.gaze_keypress_count, 8 + 2)
    self.assertEqual(phrase.backspace_count, 0)
    self.assertEqual(phrase.delword_count, 0)
    self.assertEqual(phrase.machine_keypress_count, 0)
    self.assertEqual(phrase.character_count, 7)
    self.assertFalse(phrase.predictions)

  def testAddGazeInitiated_withBacksapce(self):
    phrase = process_keypresses.Phrase(datetime.now, 0)
    phrase.add_non_control_key(
        get_keypress("y"), shift_on=True, is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("e"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("Back"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("Back"), is_gaze_initiated=True)
    phrase.add_non_control_key(
        get_keypress("h"), shift_on=True, is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("i"), is_gaze_initiated=True)
    phrase.speak(gaze_keypress_count=2)
    self.assertEqual(phrase.recon_string, "Hi")
    self.assertEqual(phrase.gaze_keypress_count, 8 + 2)
    self.assertEqual(phrase.backspace_count, 2)
    self.assertEqual(phrase.delword_count, 0)
    self.assertEqual(phrase.machine_keypress_count, 0)
    self.assertEqual(phrase.character_count, 2)
    self.assertFalse(phrase.predictions)

  def testAddGazeInitializedWithPrediction_withoutErrorCorrection(self):
    phrase = process_keypresses.Phrase(datetime.now, 0)
    phrase.add_non_control_key(
        get_keypress("s"), shift_on=True, is_gaze_initiated=True)
    phrase.add_prediction(create_prediction(["p", "a", "m", " "]))
    phrase.add_prediction(create_prediction(["Back", "."]))
    phrase.speak(gaze_keypress_count=2)
    self.assertEqual(phrase.recon_string, "Spam.")
    self.assertEqual(phrase.gaze_keypress_count, 4 + 2)
    # Back in prediction does not count.
    self.assertEqual(phrase.backspace_count, 0)
    self.assertEqual(phrase.delword_count, 0)
    self.assertEqual(phrase.machine_keypress_count, 4)
    self.assertEqual(phrase.character_count, 5)
    self.assertEqual(len(phrase.predictions), 2)

  def testAddGazeInitializedWithPrediction_withErrorCorrection(self):
    phrase = process_keypresses.Phrase(datetime.now, 0)
    phrase.add_non_control_key(
        get_keypress("s"), shift_on=True, is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("o"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("a"), is_gaze_initiated=True)
    phrase.add_prediction(create_prediction(["Back", "Back", "p", "a", "m", " "]))
    phrase.add_prediction(create_prediction(["Back", "."]))
    phrase.speak(gaze_keypress_count=2)
    self.assertEqual(phrase.recon_string, "Spam.")
    self.assertEqual(phrase.gaze_keypress_count, 6 + 2)
    # Back in prediction does not count.
    self.assertEqual(phrase.backspace_count, 0)
    self.assertEqual(phrase.delword_count, 0)
    self.assertEqual(phrase.machine_keypress_count, 6)
    self.assertEqual(phrase.character_count, 5)
    self.assertEqual(len(phrase.predictions), 2)

  def testDelWord_withoutPrecedingWord(self):
    phrase = process_keypresses.Phrase(datetime.now, 0)
    phrase.add_non_control_key(get_keypress("s"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("o"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("a"), is_gaze_initiated=True)
    phrase.delete_word_backward()
    phrase.add_prediction(create_prediction(["s", "p", "a", "m", " "]))
    phrase.speak(gaze_keypress_count=2)
    self.assertEqual(phrase.recon_string, "spam ")
    self.assertEqual(phrase.gaze_keypress_count, 5 + 2)
    self.assertEqual(phrase.backspace_count, 0)
    self.assertEqual(phrase.delword_count, 1)
    self.assertEqual(phrase.machine_keypress_count, 7)
    self.assertEqual(phrase.character_count, 5)
    self.assertEqual(len(phrase.predictions), 1)

  def testDelWord_withPrecedingWord(self):
    phrase = process_keypresses.Phrase(datetime.now, 0)
    phrase.add_non_control_key(get_keypress("a"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("Space"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("s"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("o"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("a"), is_gaze_initiated=True)
    phrase.delete_word_backward()
    phrase.add_prediction(create_prediction(["s", "p", "a", "m", " "]))
    phrase.speak(gaze_keypress_count=2)
    self.assertEqual(phrase.recon_string, "a spam ")
    self.assertEqual(phrase.gaze_keypress_count, 7 + 2)
    self.assertEqual(phrase.backspace_count, 0)
    self.assertEqual(phrase.delword_count, 1)
    self.assertEqual(phrase.machine_keypress_count, 7)
    self.assertEqual(phrase.character_count, 7)
    self.assertEqual(len(phrase.predictions), 1)

  def testDelWord_withPrecedingSentenceEndingInPunctutation(self):
    phrase = process_keypresses.Phrase(datetime.now, 0)
    phrase.add_non_control_key(get_keypress("n"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("o"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("."), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("w"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("h"), is_gaze_initiated=True)
    phrase.delete_word_backward()
    phrase.speak(gaze_keypress_count=2)
    self.assertEqual(phrase.recon_string, "no.")
    self.assertEqual(phrase.gaze_keypress_count, 6 + 2)
    self.assertEqual(phrase.backspace_count, 0)
    self.assertEqual(phrase.delword_count, 1)
    self.assertEqual(phrase.machine_keypress_count, 3)
    self.assertEqual(phrase.character_count, 3)
    self.assertEqual(len(phrase.predictions), 0)

  def testDelWord_deletesPunctuationInCurrentWord(self):
    phrase = process_keypresses.Phrase(datetime.now, 0)
    phrase.add_non_control_key(get_keypress("n"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("o"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("Space"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("w"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("h"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("."), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("."), is_gaze_initiated=True)
    phrase.delete_word_backward()
    phrase.speak(gaze_keypress_count=2)
    self.assertEqual(phrase.recon_string, "no ")
    self.assertEqual(phrase.gaze_keypress_count, 8 + 2)
    self.assertEqual(phrase.backspace_count, 0)
    self.assertEqual(phrase.delword_count, 1)
    self.assertEqual(phrase.machine_keypress_count, 3)
    self.assertEqual(phrase.character_count, 3)
    self.assertEqual(len(phrase.predictions), 0)

  def testDelWord_deletesTrailingWhitespaceInCurrentWord(self):
    phrase = process_keypresses.Phrase(datetime.now, 0)
    phrase.add_non_control_key(get_keypress("n"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("o"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("Space"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("w"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("h"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("Space"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("Space"), is_gaze_initiated=True)
    phrase.delete_word_backward()
    self.assertEqual(phrase.gaze_keypress_count, 6 + 2)
    self.assertEqual(phrase.backspace_count, 0)
    self.assertEqual(phrase.delword_count, 1)
    self.assertEqual(phrase.machine_keypress_count, 3)
    self.assertEqual(phrase.character_count, 3)
    self.assertEqual(len(phrase.predictions), 0)

  def testDelWord_deletesTrailingPunctuationAndWhitespaceInCurrentWord(self):
    phrase = process_keypresses.Phrase(datetime.now, 0)
    phrase.add_non_control_key(get_keypress("n"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("o"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("Space"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("w"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("h"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("."), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("Space"), is_gaze_initiated=True)
    phrase.delete_word_backward()
    self.assertEqual(phrase.gaze_keypress_count, 6 + 2)
    self.assertEqual(phrase.backspace_count, 0)
    self.assertEqual(phrase.delword_count, 1)
    self.assertEqual(phrase.machine_keypress_count, 3)
    self.assertEqual(phrase.character_count, 3)
    self.assertEqual(len(phrase.predictions), 0)

  def testDelWord_deletesTrailingWhitespaceAndPunctuationInCurrentWord(self):
    phrase = process_keypresses.Phrase(datetime.now, 0)
    phrase.add_non_control_key(get_keypress("n"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("o"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("Space"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("w"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("h"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("Space"), is_gaze_initiated=True)
    phrase.add_non_control_key(get_keypress("."), is_gaze_initiated=True)
    phrase.delete_word_backward()
    self.assertEqual(phrase.gaze_keypress_count, 6 + 2)
    self.assertEqual(phrase.backspace_count, 0)
    self.assertEqual(phrase.delword_count, 1)
    self.assertEqual(phrase.machine_keypress_count, 3)
    self.assertEqual(phrase.character_count, 3)
    self.assertEqual(len(phrase.predictions), 0)

  def testFinalize_success(self):
    keypresses = create_keypresses(["y", "e", "s", "Space", "LControlKey", "w"])
    phrase = process_keypresses.Phrase(datetime.now(), 0)
    phrase.add_non_control_key(keypresses.keyPresses[0], is_gaze_initiated=True)
    phrase.add_non_control_key(keypresses.keyPresses[1], is_gaze_initiated=True)
    phrase.add_non_control_key(keypresses.keyPresses[2], is_gaze_initiated=True)
    phrase.add_non_control_key(keypresses.keyPresses[3], is_gaze_initiated=True)
    phrase.speak(gaze_keypress_count=2)
    phrase.finalize(keypresses, 5)

  def testCheckKeypresses_noMissingOrExtra(self):
    ref_keypresses = [(0.100, "b"), (1.100, "a"), (1.100, "r")]
    proc_keypresses = [(0.100, "b"), (1.100, "a"), (1.100, "r")]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [])
    self.assertEqual(missing_keypresses, [])

  def testCheckKeypresses_tailMissing_returnsCorrectMissingKeysNotRepeating(self):
    ref_keypresses = [(0.100, "b"), (1.100, "a"), (1.100, "r"),
                      (1.100, "Space")]
    proc_keypresses = [(0.100, "b"), (1.100, "a"),]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [])
    self.assertEqual(missing_keypresses, [(2, 1.100, "r"), (2, 1.100, "Space")])

  def testCheckKeypresses_headMissing_returnsCorrectMissingKeysNotRepeating(self):
    ref_keypresses = [(0.100, "b"), (1.100, "a"), (1.100, "r"),
                      (1.100, "Space")]
    proc_keypresses = [(0.100, "b"), (1.100, "Space"),]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [])
    self.assertEqual(missing_keypresses, [(1, 1.100, "a"), (1, 1.100, "r")])

  def testCheckKeypresses_multipleMissingSpans(self):
    ref_keypresses = [(0.100, "b"), (1.100, "a"), (1.100, "r"),
                      (1.100, "Space"), (2.000, "f"), (3.000, "o"),
                      (3.000, "o"), (3.000, "Space")]
    proc_keypresses = [(0.100, "b"), (1.100, "Space"), (2.000, "f"),
                       (3.000, "o")]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [])
    self.assertEqual(missing_keypresses,
                     [(1, 1.100, "a"), (1, 1.100, "r"), (4, 3.000, "o"),
                      (4, 3.000, "Space")])

  def testCheckKeypresses_tailMissing_returnsCorrectMissingKeysRepeating(self):
    ref_keypresses = [(0.100, "f"), (1.100, "o"), (1.100, "o"),
                      (1.100, "Space")]
    proc_keypresses = [(0.100, "f"), (1.100, "o"),]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [])
    self.assertEqual(missing_keypresses, [(2, 1.100, "o"), (2, 1.100, "Space")])

  def testCheckKeypresses_headMissing_returnsCorrectMissingKeysRepeating(self):
    ref_keypresses = [(0.100, "f"), (1.100, "o"), (1.100, "o"),
                      (1.100, "Space")]
    proc_keypresses = [(0.100, "f"), (1.100, "Space"),]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [])
    self.assertEqual(missing_keypresses, [(1, 1.100, "o"), (1, 1.100, "o")])

  def testCheckKeypresses_extraneousKeypressInProc(self):
    ref_keypresses = [(0.100, "f"), (1.100, "o"), (1.100, "o")]
    proc_keypresses = [(0.100, "f"), (0.6, "r"), (1.100, "o"), (1.100, "o")]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [(1, 0.6, "r")])
    self.assertEqual(missing_keypresses, [])

  def testCheckKeypresses_shiftedInProc(self):
    ref_keypresses = [(0.100, "b"), (1.100, "a"), (1.100, "r")]
    proc_keypresses = [(0.100, "b"), (1.099, "a"), (1.100, "r")]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [(1, 1.099, "a")])
    self.assertEqual(missing_keypresses, [(1, 1.100, "a")])

  def testCheckKeypresses_shiftedInProcPlusMissing(self):
    ref_keypresses = [(0.100, "b"), (1.100, "a"), (1.100, "r"), (2.000, "f")]
    proc_keypresses = [(0.100, "b"), (1.099, "a"), (1.999, "f")]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [(1, 1.099, "a"), (2, 1.999, "f")])
    self.assertEqual(missing_keypresses, [(1, 1.100, "a"), (1, 1.100, "r"),
                                          (1, 2.000, "f")])

  def testCheckKeypresses_edgeCaseEmptyProc(self):
    ref_keypresses = [(0.100, "b"), (1.100, "a"), (1.100, "a")]
    proc_keypresses = []
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [])
    self.assertEqual(missing_keypresses,
                     [(0, 0.100, "b"), (0, 1.100, "a"), (0, 1.100, "a")])

  def testCheckKeypresses_edgeCaseEmptyRef(self):
    ref_keypresses = []
    proc_keypresses = [(0.100, "b"), (1.100, "a"), (1.100, "a")]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses,
                     [(0, 0.100, "b"), (1, 1.100, "a"), (2, 1.100, "a")])
    self.assertEqual(missing_keypresses, [])

  def testCheckKeypresses_edgeCaseEmptyRefAndProc(self):
    ref_keypresses = []
    proc_keypresses = []
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [])
    self.assertEqual(missing_keypresses, [])

  def testCheckKeypresses_initialMismatchRaisesError(self):
    ref_keypresses = [(0.100, "b"), (1.100, "a")]
    proc_keypresses = [(0.100, "g"), (1.100, "a")]
    with self.assertRaisesRegex(
        ValueError, "Cannot find the first processed key"):
        process_keypresses.check_keypresses(ref_keypresses, proc_keypresses)

  def testCheckKeypresses_initialRefKeypressHasNegativeTimestamp(self):
    ref_keypresses = [(-0.100, "b"), (1.100, "a"), (1.110, "d"),
                      (5.000, "x"), (5.010, "y")]
    proc_keypresses = [(0.000, "b"), (1.100, "a"), (5.000, "x")]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [])
    self.assertEqual(missing_keypresses, [(2, 1.110, "d"), (3, 5.010, "y")])

  def testCheckKeypresses_raisesErrorForMultipleNegativeTimestamps(self):
    ref_keypresses = [(-0.100, "b"), (-0.050, "a"), (1.110, "d"),
                      (5.000, "x"), (5.010, "y")]
    proc_keypresses = [(0.000, "b"), (1.100, "a"), (5.000, "x")]
    with self.assertRaisesRegex(ValueError, "More than one negative timestamp"):
        process_keypresses.check_keypresses(ref_keypresses, proc_keypresses)

  def testCheckKeypresses_redactedKeysAreIgnored_equality(self):
    ref_keypresses = [(0.100, "b"), (1.100, "a"), (1.100, "r")]
    proc_keypresses = [(0.100, "[RedactedKey]"), (1.100, "a"), (1.100, "r")]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [])
    self.assertEqual(missing_keypresses, [])

  def testCheckKeypresses_redactedKeysAreIgnored_returnsMissingKey(self):
    ref_keypresses = [(0.100, "b"), (1.100, "a"), (1.100, "r")]
    proc_keypresses = [(0.100, "[RedactedKey]"), (1.100, "r")]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [])
    self.assertEqual(missing_keypresses, [(1, 1.100, "a")])

  def testCheckKeypresses_firstRefKeysAreMissingAtTheBeginning(self):
    ref_keypresses = [(0.100, "b"), (0.200, "l"), (1.100, "a"), (1.100, "r")]
    proc_keypresses = [(1.100, "a"), (1.200, "k")]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [(1, 1.200, "k")])
    # The first two are missing from the beginning.
    self.assertEqual(missing_keypresses,
                     [(0, 0.100, "b"), (1, 0.200, "l"), (3, 1.1, "r")])

  def testCheckKeypresses_firstRefKeysAreMissingAtTheBeginningContainsRedaction(self):
    ref_keypresses = [(0.100, "b"), (0.200, "l"), (1.100, "a"), (1.100, "r")]
    proc_keypresses = [(1.100, "[RedactedKey]"), (1.200, "k")]
    extra_keypresses, missing_keypresses = process_keypresses.check_keypresses(
        ref_keypresses, proc_keypresses)
    self.assertEqual(extra_keypresses, [(1, 1.200, "k")])
    # The first two are missing from the beginning.
    self.assertEqual(missing_keypresses,
                     [(0, 0.100, "b"), (1, 0.200, "l"), (3, 1.1, "r")])

  def testWriteExtraAndMissingKeypressesToTsv(self):
    extra_keypresses = [(10, 0.800, "z")]
    missing_keypresses = [(20, 10.800, "b"), (20, 10.800, "c"), (20, 10.801, "d")]
    temp_tsv_path = tempfile.mktemp(suffix=".tsv")
    process_keypresses.write_extra_and_missing_keypresses_to_tsv(
        temp_tsv_path, extra_keypresses, missing_keypresses)

    with open(temp_tsv_path, "rt") as f:
      rows = list(row for row in csv.reader(f, delimiter="\t"))
    self.assertEqual(len(rows), 5)
    self.assertEqual(rows[0], ["Type", "Index", "Timestamp", "Content"])
    self.assertEqual(rows[1], ["Extra", "10", "0.800", "z"])
    self.assertEqual(rows[2], ["Missing", "20", "10.800", "b"])
    self.assertEqual(rows[3], ["Missing", "20", "10.800", "c"])
    self.assertEqual(rows[4], ["Missing", "20", "10.801", "d"])
    os.remove(temp_tsv_path)


if __name__ == "__main__":
  unittest.main()
