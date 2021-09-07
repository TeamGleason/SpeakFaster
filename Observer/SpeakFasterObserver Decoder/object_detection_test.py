"""Unit tests for object_detection."""
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import os

import tensorflow as tf

import object_detection


class ObjectDetectionTest(tf.test.TestCase):

  def testReadSingleImage(self):
    image_tensor = object_detection.read_image(
        "testdata/pic0001-standard-size.jpg")
    self.assertEqual(image_tensor.shape, (1, 768, 1024, 3))
    self.assertEqual(image_tensor.dtype, tf.uint8)

  def testReadImagesByGlobPattern(self):
    generator = object_detection.read_images("testdata/pic*.jpg", frame_rate=4.0)
    output = list(generator)
    self.assertLen(output, 3)
    for i in range(3):
      image_tensor, _ = output[i]
      self.assertEqual(image_tensor.shape, (1, 768, 1024, 3))
      self.assertEqual(image_tensor.dtype, tf.uint8)
    self.assertAllClose([timestamp for _, timestamp in output],
                        [0.0, 0.25, 0.5])

  def testReadImageFromVideoFile(self):
    generator = object_detection.read_video_file("testdata/test_video_1.mp4")
    output = list(generator)
    self.assertLen(output, 5)
    for i in range(5):
      image_tensor, _ = output[i]
      self.assertEqual(image_tensor.shape, (1, 768, 1024, 3))
      self.assertEqual(image_tensor.dtype, tf.uint8)
    self.assertAllClose([timestamp for _, timestamp in output],
                        [0.0, 1.0, 2.0, 3.0, 4.0])

  def testGetVideoFps(self):
    self.assertEqual(
        object_detection.get_video_fps("testdata/test_video_1.mp4"), 1.0)

  def testDetectObjects(self):
    generator = object_detection.read_video_file("testdata/test_video_1.mp4")
    output = object_detection.detect_objects(generator, threshold_score=0.5)
    self.assertLen(output, 5)
    class_names = [class_name for class_name, _ in output[0]]
    scores = [score for _, score in output[0]]
    self.assertIn("apple", class_names)
    self.assertGreaterEqual(min(scores), 0.5)
    class_names = [class_name for class_name, _ in output[1]]
    scores = [score for _, score in output[0]]
    self.assertIn("apple", class_names)
    self.assertGreaterEqual(min(scores), 0.5)
    class_names = [class_name for class_name, _ in output[2]]
    scores = [score for _, score in output[0]]
    self.assertEqual(class_names, ["cell phone"])
    self.assertGreaterEqual(min(scores), 0.5)
    class_names = [class_name for class_name, _ in output[3]]
    scores = [score for _, score in output[0]]
    self.assertEqual(class_names, ["cell phone"])
    self.assertGreaterEqual(min(scores), 0.5)
    class_names = [class_name for class_name, _ in output[4]]
    scores = [score for _, score in output[0]]
    self.assertEqual(class_names, ["dog"])
    self.assertGreaterEqual(min(scores), 0.5)



if __name__ == "__main__":
  tf.test.main()
