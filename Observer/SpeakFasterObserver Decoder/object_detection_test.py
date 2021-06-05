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
    generator = object_detection.read_images("testdata/*.jpg", frame_rate=4.0)
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


if __name__ == "__main__":
  tf.test.main()
