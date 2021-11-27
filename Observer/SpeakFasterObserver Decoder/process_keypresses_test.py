"""Unit tests for the process_keypresses module."""
from datetime import datetime
from google import protobuf
import unittest

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


if __name__ == "__main__":
  unittest.main()
