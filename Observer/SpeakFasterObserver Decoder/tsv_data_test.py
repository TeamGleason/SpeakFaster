"""Unit tests for modeul tsv_data."""
import csv
import os

import tensorflow as tf

import tsv_data


class MergeTsvFilesTest(tf.test.TestCase):

  def setUp(self):
    super(MergeTsvFilesTest, self).setUp()
    self.tsv_path_1 = os.path.join(self.get_temp_dir(), "1.tsv")
    with open(self.tsv_path_1, "w") as f:
      f.write(tsv_data.HEADER + "\n")
      f.write("10.100\t10.200\tKeypress\th\n")
      f.write("11.100\t11.200\tKeypress\ti\n")
    self.tsv_path_2 = os.path.join(self.get_temp_dir(), "2.tsv")
    with open(self.tsv_path_2, "w") as f:
      f.write(tsv_data.HEADER + "\n")
      f.write("0.100\t1.100\tSpeechTranscript\tHello how are you\n")
      f.write("12.100\t13.100\tSpeechTranscript\tWhat's up\n")

  def testMergeSingleFile(self):
    merged_tsv_path = os.path.join(self.get_temp_dir(), "merged.tsv")
    tsv_data.merge_tsv_files([self.tsv_path_1], merged_tsv_path)
    with open(merged_tsv_path) as f:
      reader = csv.reader(f, delimiter=tsv_data.DELIMITER)
      rows = list(reader)
    self.assertLen(rows, 3)
    self.assertEqual(rows[0], list(tsv_data.COLUMN_HEADS))
    self.assertEqual(rows[1], ["10.100", "10.200", "Keypress", "h"])
    self.assertEqual(rows[2], ["11.100", "11.200", "Keypress", "i"])

  def testMergeTwoTsvFiles_interleavingTimestamps(self):
    merged_tsv_path = os.path.join(self.get_temp_dir(), "merged.tsv")
    tsv_data.merge_tsv_files(
        [self.tsv_path_1, self.tsv_path_2], merged_tsv_path)
    with open(merged_tsv_path) as f:
      reader = csv.reader(f, delimiter=tsv_data.DELIMITER)
      rows = list(reader)
    self.assertLen(rows, 5)
    self.assertEqual(rows[0], list(tsv_data.COLUMN_HEADS))
    self.assertEqual(
        rows[1], ["0.100", "1.100", "SpeechTranscript", "Hello how are you"])
    self.assertEqual(rows[2], ["10.100", "10.200", "Keypress", "h"])
    self.assertEqual(rows[3], ["11.100", "11.200", "Keypress", "i"])
    self.assertEqual(
        rows[4], ["12.100", "13.100", "SpeechTranscript", "What's up"])

  def testIncorrectHeader_raisesException(self):
    self.tsv_path_1 = os.path.join(self.get_temp_dir(), "1.tsv")
    with open(self.tsv_path_1, "w") as f:
      f.write(tsv_data.HEADER + "\n")
      f.write("10.100\t10.200\tKeypress\th\n")
      f.write("11.100\t11.200\tKeypress\ti\n")
    self.tsv_path_2 = os.path.join(self.get_temp_dir(), "2.tsv")
    with open(self.tsv_path_2, "w") as f:
      f.write(tsv_data.CONTENT_COLUMN_HEAD + "\n")
      f.write("Hello how are you\n")
      f.write("What's up\n")
    merged_tsv_path = os.path.join(self.get_temp_dir(), "merged.tsv")

    with self.assertRaisesRegexp(ValueError, r"expected column heads"):
      tsv_data.merge_tsv_files(
          [self.tsv_path_1, self.tsv_path_2], merged_tsv_path)

  def testHandlesEmptyRowsCorrectly(self):
    self.tsv_path_1 = os.path.join(self.get_temp_dir(), "1.tsv")
    with open(self.tsv_path_1, "w") as f:
      f.write(tsv_data.HEADER + "\n")
      f.write("10.100\t10.200\tKeypress\th\n")
      # Notice the extra empty line.
      f.write("11.100\t11.200\tKeypress\ti\n\n")
    self.tsv_path_2 = os.path.join(self.get_temp_dir(), "2.tsv")
    with open(self.tsv_path_2, "w") as f:
      f.write(tsv_data.HEADER + "\n")
      # Notice the extra empty line.
      f.write("12.100\t12.200\tSpeechTranscript\tHello\n\n")
    merged_tsv_path = os.path.join(self.get_temp_dir(), "merged.tsv")

    tsv_data.merge_tsv_files(
        [self.tsv_path_1, self.tsv_path_2], merged_tsv_path)
    with open(merged_tsv_path) as f:
      reader = csv.reader(f, delimiter=tsv_data.DELIMITER)
      rows = list(reader)
    self.assertLen(rows, 4)
    self.assertEqual(rows[0], list(tsv_data.COLUMN_HEADS))
    self.assertEqual(rows[1], ["10.100", "10.200", "Keypress", "h"])
    self.assertEqual(rows[2], ["11.100", "11.200", "Keypress", "i"])
    self.assertEqual(rows[3], ["12.100", "12.200", "SpeechTranscript", "Hello"])


class TsvDataTest(tf.test.TestCase):

  def testAllTierNamesAreUnique(self):
    self.assertLen(set(tsv_data.ALL_TIERS), len(tsv_data.ALL_TIERS))


if __name__ == "__main__":
  tf.test.main()
