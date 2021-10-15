"""Unit tests for the file_naming module."""
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import os

import tensorflow as tf

import file_naming


class ParseTimestampTest(tf.test.TestCase):

  def testParsesTimestamp_resultsCorrectResult_beforeNoon(self):
    out, is_utc = file_naming.parse_timestamp("20210710T095258428")
    self.assertFalse(is_utc)
    self.assertEqual(out.year, 2021)
    self.assertEqual(out.month, 7)
    self.assertEqual(out.day, 10)
    self.assertEqual(out.hour, 9)
    self.assertEqual(out.minute, 52)
    self.assertEqual(out.second, 58)
    self.assertEqual(out.microsecond, 428000)

  def testParsesTimestamp_resultsCorrectResult_afterNoon(self):
    out, is_utc = file_naming.parse_timestamp("20210710T235258428")
    self.assertFalse(is_utc)
    self.assertEqual(out.year, 2021)
    self.assertEqual(out.month, 7)
    self.assertEqual(out.day, 10)
    self.assertEqual(out.hour, 23)
    self.assertEqual(out.minute, 52)
    self.assertEqual(out.second, 58)
    self.assertEqual(out.microsecond, 428000)

  def testParseTimestamp_utc(self):
    out, is_utc = file_naming.parse_timestamp("20210710T095258428Z")
    self.assertTrue(is_utc)
    self.assertEqual(out.year, 2021)
    self.assertEqual(out.month, 7)
    self.assertEqual(out.day, 10)
    self.assertEqual(out.hour, 9)
    self.assertEqual(out.minute, 52)
    self.assertEqual(out.second, 58)
    self.assertEqual(out.microsecond, 428000)

  def testRaisesErrorForInvalidInputs(self):
    with self.assertRaises(ValueError):
      file_naming.parse_timestamp("20210710235258428")
    with self.assertRaises(ValueError):
      file_naming.parse_timestamp("20210710T23")
    with self.assertRaises(ValueError):
      file_naming.parse_timestamp("20210710T235258428-")

class ParseTimestampFromFilenameTest(tf.test.TestCase):

  def testParse_basenameOnly_returnsCorrectValue(self):
    out, is_utc = file_naming.parse_timestamp_from_filename(
        "20210710T095258428-MicWaveIn.flac")
    self.assertFalse(is_utc)
    self.assertEqual(out.year, 2021)
    self.assertEqual(out.month, 7)
    self.assertEqual(out.day, 10)
    self.assertEqual(out.hour, 9)
    self.assertEqual(out.minute, 52)
    self.assertEqual(out.second, 58)
    self.assertEqual(out.microsecond, 428000)

  def testParse_fullPath_returnsCorrectValue(self):
    out, is_utc = file_naming.parse_timestamp_from_filename(
        os.path.join("tmp", "data", "20210710T095258428Z-MicWaveIn.flac"))
    self.assertTrue(is_utc)
    self.assertEqual(out.year, 2021)
    self.assertEqual(out.month, 7)
    self.assertEqual(out.day, 10)
    self.assertEqual(out.hour, 9)
    self.assertEqual(out.minute, 52)
    self.assertEqual(out.second, 58)
    self.assertEqual(out.microsecond, 428000)

  def testParseEpochS(self):
    epoch_s = file_naming.parse_epoch_seconds_from_filename(
        "20210710T095258428-MicWaveIn.flac", "US/Eastern")
    self.assertAllClose(epoch_s, 1625925178.428)


class GetDataStreamNameTest(tf.test.TestCase):

  def testGetDataStreamName_basenameOnly_returnsCorrectName(self):
    name = file_naming.get_data_stream_name("20210710T095258428-MicWaveIn.flac")
    self.assertEqual(name, "MicWaveIn")

  def testGetDataStreamName_dirnameAndBasename_returnsCorrectName(self):
    name = file_naming.get_data_stream_name(
        os.path.join("foo", "bar", "20210710T095258428-MicWaveIn.flac"))
    self.assertEqual(name, "MicWaveIn")

  def testGetDataStreamName_raisesErrorForInvalidFormat(self):
    with self.assertRaisesRegex(ValueError, r"Invalid file name format"):
      file_naming.get_data_stream_name("20210710T095258428.dat")
    with self.assertRaisesRegex(ValueError, r"Invalid file name format"):
      file_naming.get_data_stream_name(
          os.path.join("foo", "20210710T095258428.dat"))


if __name__ == "__main__":
  tf.test.main()
