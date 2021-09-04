"""Module for processing videos."""

import os
import shutil
import subprocess
import tempfile

from PIL import Image
import ffmpeg
import numpy as np

import file_naming


def stitch_images_into_mp4(image_paths,
                           initial_frame_duration_s,
                           out_mp4_path):
  """Stitch a series of images of the same size into a video.

  The video will have no audio track.

  image_paths: The paths to the images.
  initial_frame_duration_s: Duration of the added initial (blank) frame,
    in seconds, as a float.
  output_mp4_path: Path to the output mp4 video file.
  """
  if not image_paths:
    raise ValueError("Empty image paths")
  if initial_frame_duration_s < 0:
    raise ValueError("initial_frame_duration_s must not be negative")
  tmp_dir = tempfile.mkdtemp()
  pts = [0]

  # Get the dimensions of the first image.
  image_width, image_height = Image.open(image_paths[0]).size
  # Create the image file for the first frame.
  if initial_frame_duration_s > 0:
    initial_frame_image_path = os.path.join(tmp_dir, "first_frame.jpg")
    Image.new("RGB", (image_width, image_height)).save(initial_frame_image_path)

  timestamp0 = file_naming.parse_timestamp_from_filename(image_paths[0])
  for image_path in image_paths[1:]:
    timestamp = file_naming.parse_timestamp_from_filename(image_path)
    if timestamp < timestamp0:
      raise ValueError(
          "Timestamp of image file is out of order: %s" % image_path)
    dt = timestamp - timestamp0
    pts.append(dt.seconds + dt.microseconds / 1e6)
  frame_durations_s = np.diff(pts)
  n_images = len(image_paths)

  input_file_path = os.path.join(tmp_dir, "input.txt")
  with open(input_file_path, "w") as f:
    if initial_frame_duration_s > 0:
      f.write("file %s\n" % initial_frame_image_path)
      f.write("duration %.6f\n" % initial_frame_duration_s)
    for i in range(n_images):
      f.write("file %s\n" % image_paths[i])
      if i < n_images - 1:
        f.write("duration %.6f\n" % frame_durations_s[i])

  subprocess.check_call([
      "ffmpeg", "-f", "concat", "-safe", "0",
      "-i", input_file_path, out_mp4_path])
  shutil.rmtree(tmp_dir)


def make_dummy_video_file(duration_s,
                          frame_image_path,
                          output_video_path,
                          fps=1.0):
  """Generates a dummy video file.

  The video is generated by repeating a single frame of image at a
  frame rate of 1 fps for the specified duration.
  This is useful when there is no video data collected in the session.

  Args:
    duration_s: Duration of the video in seconds.
  """
  stream = ffmpeg.input(
      frame_image_path, pattern_type="glob", framerate=fps,
      stream_loop=np.ceil(duration_s) / fps)
  stream.output(output_video_path).run()
