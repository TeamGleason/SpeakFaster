"""Unit tests for object_detection."""
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import os

import tensorflow as tf

import events as events_lib


class ConvertEventsToTsvRowsTest(tf.test.TestCase):

  def testConvertEventsToTsvRows_singleEventTypeAtATime(self):
    events = [
        [("Speech", 0.9)],
        [("Speech", 0.95)],
        [],
        [("Hands", 0.55)],
        [("Hands", 0.6)],
    ]
    rows = events_lib.convert_events_to_tsv_rows(events, "AudioEvents1")
    self.assertEqual(rows, [
        (0.0, 2.0, "AudioEvents1", "Speech"),
        (3.0, 5.0, "AudioEvents1", "Hands"),
    ])

  def testConvertEventsToTsvRows_withFinalEmptyClasses_ignoresSilence(self):
    events = [
        [("Speech", 0.9)],
        [("Speech", 0.95)],
        [("Silence", 0.99)],
        [("Hands", 0.55)],
        [("Hands", 0.6)],
        []
    ]
    rows = events_lib.convert_events_to_tsv_rows(
        events, "AudioEvents1", ignore_class_names=("Silence",))
    self.assertEqual(rows, [
        (0.0, 2.0, "AudioEvents1", "Speech"),
        (3.0, 5.0, "AudioEvents1", "Hands"),
    ])

  def testConvertEventsToTsvRows_withOverlapping(self):
      events = [
          [("Speech", 0.6)],
          [("Speech", 0.6), ("Music", 0.3)],
          [("Speech", 0.5), ("Music", 0.4)],
          [("Music", 0.7)],
          [("Music", 0.8)],
      ]
      rows = events_lib.convert_events_to_tsv_rows(events, "AudioEvents1")
      self.assertEqual(rows, [
          (0.0, 3.0, "AudioEvents1", "Speech"),
          (1.0, 5.0, "AudioEvents1", "Music"),
      ])

  def testCustomTimestep(self):
      events = [
          [("Speech", 0.6)],
          [("Speech", 0.6), ("Music", 0.3)],
          [("Speech", 0.5), ("Music", 0.4)],
          [("Music", 0.7)],
          [("Music", 0.8)],
      ]
      rows = events_lib.convert_events_to_tsv_rows(events, "AudioEvents1", timestep_s=2.5)
      self.assertEqual(rows, [
          (0.0, 7.5, "AudioEvents1", "Speech"),
          (2.5, 12.5, "AudioEvents1", "Music"),
      ])


if __name__ == "__main__":
  tf.test.main()
