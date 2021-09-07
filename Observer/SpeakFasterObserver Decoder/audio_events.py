"""Audio event classifier module."""
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import csv
import os
import tempfile
from urllib import request

import numpy as np
import tensorflow as tf

YAMNET_URL = 'https://storage.googleapis.com/tfhub-lite-models/google/lite-model/yamnet/tflite/1.tflite'
YAMNET_CLASS_MAP_URL = "https://raw.githubusercontent.com/tensorflow/models/master/research/audioset/yamnet/yamnet_class_map.csv"
LOCAL_YAMNET_FILENAME = "lite-model_yamnet_tflite_1.tflite"

YAMNET_IGNORE_CLASS_NAMES = ("Silence",)


def maybe_download_yamnet_tflite():
  """Downloads YAMNet tflite file to temp dir if it's not there."""
  yamnet_tflite_path = _get_local_yamnet_yamnet_path()
  if os.path.isfile(yamnet_tflite_path):
    return yamnet_tflite_path
  print(
      "Downloading TFLite file for audio event classification from %s..." %
      YAMNET_URL)
  tflite_bytes = request.urlopen(YAMNET_URL).read()
  with open(yamnet_tflite_path, "wb") as f:
    f.write(tflite_bytes)
  return yamnet_tflite_path


def _get_local_yamnet_yamnet_path():
  return os.path.join(tempfile.gettempdir(), LOCAL_YAMNET_FILENAME)


def maybe_download_yamnet_class_map():
  """Downloads YAMNet class map CSV file to temp dir if it's not there."""
  yamnet_class_map_path = _get_local_yamnet_class_map_path()
  if os.path.isfile(yamnet_class_map_path):
    return yamnet_class_map_path
  print("Downloading YAMNet class map from %s..." % YAMNET_CLASS_MAP_URL)
  class_map_bytes = request.urlopen(YAMNET_CLASS_MAP_URL).read()
  with open(yamnet_class_map_path, "w") as f:
    f.write(class_map_bytes.decode("utf-8"))
  return yamnet_class_map_path


def _get_local_yamnet_class_map_path():
  return os.path.join(tempfile.gettempdir(), os.path.basename(YAMNET_CLASS_MAP_URL))


def get_yamnet_class_names():
  """Returns list of YAMnet class names as a tuple of strings."""
  local_csv_path = maybe_download_yamnet_class_map()
  class_names = []
  with tf.io.gfile.GFile(local_csv_path) as csvfile:
    reader = csv.DictReader(csvfile)
    for row in reader:
      class_names.append(row["display_name"])
  return tuple(class_names)


YAMNET_FS = 16000  # Required sampling rate by YAMNet.


def extract_audio_events(generator, fs, threshold_score=0.25):
  """Extracts audio event labels using YAMNet model.

  See https://tfhub.dev/google/lite-model/yamnet/tflite/1 for more details about
  the model.

  Args:
    generator: A Python generator that yields mono audio in chunks.
       The generator must return numpy ndarrays of dtype float32 or int16.
    fs: The sampling rate. Currently this must be 16000 Hz.
    threshold_score: Threshold for the model output score. The score
      for a deteted class must be >= this value to be included in the return
      value.

  Returns:
    A list of lists. The length of the outer list is equal to the number
      of yielded waveforms from the generator. Each inner list contains
      tuple of the format (class_name, score). The length of the inner
      list depends on how many classes have scores >= thresold_score in
      the corresponding waveform.
  """
  if fs != YAMNET_FS:
    raise ValueError(
        "Required audio sample rate is %d Hz, got %s" % (YAMNET_FS, fs))

  class_names = get_yamnet_class_names()
  interpreter = tf.lite.Interpreter(maybe_download_yamnet_tflite())
  input_details = interpreter.get_input_details()
  waveform_input_index = input_details[0]['index']
  output_details = interpreter.get_output_details()
  scores_output_index = output_details[0]['index']

  output = []
  for xs in generator():
    if not isinstance(xs, np.ndarray):
      raise TypeError(
          "Required waveform to be numpy.ndarray; got %s" % type(xs))
    if xs.dtype == np.float32:
      pass
    elif xs.dtype == np.int16:
      xs = xs.astype(np.float32) / 32768
    else:
      raise ValueError("Got unsupported ndarray dtype")
    interpreter.resize_tensor_input(waveform_input_index,
                                    [len(xs)], strict=True)
    interpreter.allocate_tensors()
    interpreter.set_tensor(waveform_input_index, xs)
    interpreter.invoke()
    scores = interpreter.get_tensor(scores_output_index)
    scores = np.mean(scores, axis=0)
    supra_thresh_indices = np.where(scores > threshold_score)[0]
    segment_output = []
    for i in supra_thresh_indices:
      segment_output.append((class_names[i], scores[i]))
    output.append(segment_output)
  return output


