"""Unit tests for the video module."""
import os

from PIL import Image
import ffmpeg
import numpy as np
import tensorflow as tf

import file_naming
import video


class StitchImagesIntoMp4Test(tf.test.TestCase):

  def _createImage(self, w, h, pixel_value, image_file_name):
    image_abs_path = os.path.join(self.get_temp_dir(), image_file_name)
    image = Image.new("RGB", (w, h))
    pixels = image.load()
    for i in range(w):
      for j in range(h):
        pixels[i, j] = (pixel_value, pixel_value, pixel_value)
    image.save(image_abs_path)
    return image_abs_path

  def testStichOneImage(self):
    filename = "20210903T120000000-Screenshot.jpg"
    timezone = "US/Eastern"
    image_path_1 = self._createImage(800, 600, 0, filename)
    video_start_epoch_s = file_naming.parse_epoch_seconds_from_filename(filename, timezone)
    start_time_epoch_s = video_start_epoch_s - 5.0
    out_mp4_path = os.path.join(self.get_temp_dir(), "stiched.mp4")
    video.stitch_images_into_mp4([image_path_1], start_time_epoch_s, timezone, out_mp4_path)

    probe = ffmpeg.probe(out_mp4_path)
    self.assertAllClose(float(probe["streams"][0]["duration"]), 5.0, atol=0.1)

  def testStichThreeImages(self):
    image_path_1 = self._createImage(800, 600, 0, "20210903T120000000-Screenshot.jpg")
    image_path_2 = self._createImage(800, 600, 60, "20210903T120000200-Screenshot.jpg")
    image_path_3 = self._createImage(800, 600, 120, "20210903T120001000-Screenshot.jpg")
    timezone = "US/Central"
    video_start_epoch_s = file_naming.parse_epoch_seconds_from_filename(
        "20210903T120000000-Screenshot.jpg", timezone)
    start_time_epoch_s = video_start_epoch_s - 10.0
    out_mp4_path = os.path.join(self.get_temp_dir(), "stitched.mp4")
    video.stitch_images_into_mp4(
        [image_path_1, image_path_2, image_path_3], start_time_epoch_s,
        timezone, out_mp4_path)

    probe = ffmpeg.probe(out_mp4_path)
    self.assertAllClose(float(probe["streams"][0]["duration"]), 11.8, atol=0.1)

  def testStichThreeImages_noInitialFrame(self):
    image_path_1 = self._createImage(800, 600, 0, "20210903T120000000-Screenshot.jpg")
    image_path_2 = self._createImage(800, 600, 60, "20210903T120000200-Screenshot.jpg")
    image_path_3 = self._createImage(800, 600, 120, "20210903T120001000-Screenshot.jpg")
    timezone = "US/Central"
    video_start_epoch_s = file_naming.parse_epoch_seconds_from_filename(
        "20210903T120000000-Screenshot.jpg", timezone)
    start_time_epoch_s = video_start_epoch_s
    out_mp4_path = os.path.join(self.get_temp_dir(), "stiched.mp4")
    video.stitch_images_into_mp4(
        [image_path_1, image_path_2, image_path_3], start_time_epoch_s, timezone,
        out_mp4_path)

    probe = ffmpeg.probe(out_mp4_path)
    self.assertAllClose(float(probe["streams"][0]["duration"]), 1.1, atol=0.1)

  def testStichOneImage(self):
    out_mp4_path = os.path.join(self.get_temp_dir(), "stiched.mp4")
    with self.assertRaisesRegex(ValueError, "Empty image paths"):
      video.stitch_images_into_mp4([], 5.0, "US/Central", out_mp4_path)


class MakeDummyVideoFileTest(tf.test.TestCase):

  def _createImage(self, w, h, pixel_value, image_file_name):
    image_abs_path = os.path.join(self.get_temp_dir(), image_file_name)
    image = Image.new("RGB", (w, h))
    pixels = image.load()
    for i in range(w):
      for j in range(h):
        pixels[i, j] = (pixel_value, pixel_value, pixel_value)
    image.save(image_abs_path)
    return image_abs_path

  def testMakeDummyVideoSucceeds(self):
    image_path = self._createImage(800, 600, 60, "dummy_frame.jpg")
    out_mp4_path = os.path.join(self.get_temp_dir(), "out.mp4")
    video.make_dummy_video_file(10, image_path, out_mp4_path)

    probe = ffmpeg.probe(out_mp4_path)
    self.assertAllClose(float(probe["streams"][0]["duration"]), 11.0, atol=0.1)


if __name__ == "__main__":
  tf.test.main()
