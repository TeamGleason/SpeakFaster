"""Unit tests for data_manager.py."""
import tensorflow as tf

import data_manager


class DataManagerTest(tf.test.TestCase):

  def testWeedDays(self):
    self.assertLen(data_manager.WEEKDAYS, 7)
    self.assertLen(set(data_manager.WEEKDAYS), 7)

  def testHourRanges(self):
    for hour_range in data_manager.HOUR_RANGES:
      self.assertLen(hour_range, 2)
      self.assertIsInstance(hour_range, tuple)
    for i in range(len(data_manager.HOUR_RANGES) - 1):
      self.assertEqual(data_manager.HOUR_RANGES[i][1],
                       data_manager.HOUR_RANGES[i + 1][0])

  def testGetHourIndex(self):
    self.assertEqual(data_manager.get_hour_index(0), 0)
    self.assertEqual(data_manager.get_hour_index(1), 0)
    self.assertEqual(data_manager.get_hour_index(2), 0)
    self.assertEqual(data_manager.get_hour_index(3), 1)
    self.assertEqual(data_manager.get_hour_index(4), 1)
    self.assertEqual(data_manager.get_hour_index(6), 2)
    self.assertEqual(data_manager.get_hour_index(21), 7)
    self.assertEqual(data_manager.get_hour_index(23), 7)



if __name__ == "__main__":
  tf.test.main()
