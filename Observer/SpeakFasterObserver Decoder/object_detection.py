"""Library for object detection on input images."""
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import glob
import tempfile

import cv2
import numpy as np
import tensorflow as tf
import tensorflow_hub as hub


def read_image(input_image_path):
  """Reads a single image file as a tensor.

  Args:
    input_image_path: Path to the input image.

  Returns:
    A tf.Tensor of shape [1, height, width, 3] and dtype uint8.
  """
  buf = tf.io.read_file(input_image_path)
  image = tf.io.decode_jpeg(buf)
  return tf.expand_dims(tf.cast(image, tf.uint8), 0)


def read_images(input_image_glob, frame_rate):
  """Reads an image file and returns its tensor representation.

  Args:
    input_image_glob: Glob pattern for th input images.
    frame_rate: Frame rate in fps.

  Yields:
    (image_tensor, timestamp), wherein
      - image_tensor is a (1, height, width, 3)-shape, uint8-dtype tf.Tensor.
      - timestamp is the relative timestamp for the image frame in seconds.
  """
  file_paths = sorted(glob.glob(input_image_glob))
  timestamp = 0
  for file_path in file_paths:
    yield read_image(file_path), timestamp
    timestamp += 1.0 / frame_rate


def read_video_file(video_file_path):
  """Reads given video file.

  Args:
    video_file_path: Path to the input video file.

  Yields:
    (image_tensor, timestamp), wherein
      - image_tensor is a (1, height, width, 3)-shape, uint8-dtype tf.Tensor.
      - timestamp is the relative timestamp for the image frame in seconds.
  """
  video_cap = cv2.VideoCapture(video_file_path)
  success, image = video_cap.read()
  frame_rate = video_cap.get(cv2.CAP_PROP_FPS)
  timestamp = 0.0
  tmp_image_path = tempfile.mktemp(suffix=".jpg")
  while success:
    cv2.imwrite(tmp_image_path, image)     # save frame as JPEG file
    yield read_image(tmp_image_path), timestamp
    timestamp += 1.0 / frame_rate
    success, image = video_cap.read()
  tf.io.gfile.remove(tmp_image_path)


def get_video_fps(video_file_path):
  """Gets the frame rate (fps) of given video file."""
  video_cap = cv2.VideoCapture(video_file_path)
  return video_cap.get(cv2.CAP_PROP_FPS)


COCO_LABELS_PATH = "coco_labels.csv"
OBJECT_DETECTION_MODEL_URL = "https://tfhub.dev/tensorflow/ssd_mobilenet_v2/fpnlite_640x640/1"
_cached_objects = {
    "detector": None,
    "coco_labels": None,
}


def get_coco_labels():
  """Returns COCO labels as a dict mapping integer index to class name."""
  if _cached_objects["coco_labels"] is None:
    labels = dict()
    i = 1
    with tf.io.gfile.GFile(COCO_LABELS_PATH, "r") as f:
      label = f.readline().strip()
      while label:
        labels[i] = label
        i += 1
        label = f.readline().strip()
    _cached_objects["coco_labels"] = labels
  return _cached_objects["coco_labels"]


def detect_objects(frame_generator, threshold_score=0.5):
  """Detect objects in a series of images frames.

  Args:
    frame_generator: A generator that yields the (image_tensor, timestamp),
      wherein image_tensor is a (1, height, width, 3)-shape, uint8-dtype
      tf.Tensor, and timestamp is the timestamp of the frame (in seconds).

  Returns:
    A list of lists. The length of the outer list is equal to the number
      of yielded image frames from the generator. Each inner list contains
      tuple of the format (class_name, score). The length of the inner
      list depends on how many classes have scores >= thresold_score in
      the corresponding waveform.
  """
  if not _cached_objects["detector"]:
     _cached_objects["detector"] = hub.load(OBJECT_DETECTION_MODEL_URL)
  detector = _cached_objects["detector"]
  coco_labels = get_coco_labels()
  output = []
  for image_tensor, timestamp in frame_generator:
    detector_output = detector(image_tensor)
    scores = detector_output["detection_scores"][0].numpy()
    class_indices = detector_output["detection_classes"][0].numpy().astype(np.int32)
    class_indices = class_indices[scores > threshold_score]
    scores = scores[scores > threshold_score]
    frame_output = []
    for class_index, score in zip(class_indices, scores):
      class_name = coco_labels[class_index]
      frame_output.append((class_name, score))
    output.append(frame_output)
  return output
