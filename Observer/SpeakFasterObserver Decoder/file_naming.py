"""Module for timestamp related utilities."""
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

from datetime import datetime
import os

import pytz

MERGED_TSV_FILENAME = "merged.tsv"
CONCATENATED_AUDIO_FILENAME = "concatenated_audio.wav"
SCREENSHOTS_MP4_FILENAME = "screenshots.mp4"


def parse_timestamp(timestamp):
  """Parse timestamp into a Python datetime.datetime object.

  Args:
    timestamp: Input timestamp string. Assumed to be in the
        yyyymmddThhmmssf format.

  Returns:
    A datetime.datetime object.
    A boolean indicating whether the timestamp is in UTC.
  """
  is_utc = timestamp.endswith("Z")
  if is_utc:
    timestamp = timestamp[:-1]
  return datetime.strptime(timestamp, "%Y%m%dT%H%M%S%f"), is_utc


def parse_timestamp_from_filename(filename):
  """Parse timestamp from a SpeakFaster Observer data filename."""
  filename = os.path.basename(filename)
  timestamp = filename.split("-", 1)[0]
  return parse_timestamp(timestamp)


def parse_epoch_seconds_from_filename(filename, timezone):
  """Parse epoch timestamp (in seconds) from filename and timezone name."""
  dt, is_utc = parse_timestamp_from_filename(filename)
  if is_utc:
    tz = pytz.timezone("UTC")
  else:
    tz = pytz.timezone(timezone)
  return tz.localize(dt).timestamp()


def get_data_stream_name(filename):
  """Get the data stream name.

  Args:
    filename: file path, the basename of which is assumed to have the
        yyyymmddThhmmssf-{DataStream}.{Extension} format.

  Returns:
    The name of the data stream as a str.
  """
  basename = os.path.basename(filename)
  if basename.count("-") != 1:
    raise ValueError("Invalid file name format: %s" % basename)
  return os.path.splitext(basename)[0].split("-")[-1]
