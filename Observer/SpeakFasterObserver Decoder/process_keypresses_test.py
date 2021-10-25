"""Unit tests for the process_keypresses module."""
from datetime import datetime
from google import protobuf
import unittest

import keypresses_pb2
import process_keypresses


def get_keypress(key):
  return keypresses_pb2.KeyPress(KeyPress=key)


def create_prediction(chars):
  keypresses = keypresses_pb2.KeyPresses()
  for i, char in enumerate(chars):
    timestamp = protobuf.timestamp_pb2.Timestamp()
    timestamp.FromMilliseconds(i)
    keypress = keypresses_pb2.KeyPress(KeyPress=char, Timestamp=timestamp)
    keypresses.keyPresses.append(keypress)
  return process_keypresses.Prediction(keypresses, 0, len(chars))


class PhraseTest(unittest.TestCase):

  def testAddGazeInitiatedKeys_withoutBackspace(self):
    phrase = process_keypresses.Phrase(datetime.now)
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
    phrase = process_keypresses.Phrase(datetime.now)
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
    phrase = process_keypresses.Phrase(datetime.now)
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
    phrase = process_keypresses.Phrase(datetime.now)
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
    phrase = process_keypresses.Phrase(datetime.now)
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
    phrase = process_keypresses.Phrase(datetime.now)
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

  # TODO(cais): testDelWord_withPrecedingSentence
  # TODO(cais): testDelWord_withNumericChars


if __name__ == "__main__":
  unittest.main()

