"""Module for timestamp related utilities."""
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

from datetime import datetime
import os


def parse_timestamp(timestamp):
  """Parse timestamp into a Python datetime.datetime object.

  Args:
    timestamp: Input timestamp string. Assumed to be in the
        yyyymmddThhmmssf format.

  Returns:
    A datetime.datetime object.
  """
  return datetime.strptime(timestamp, "%Y%m%dT%H%M%S%f")


def parse_timestamp_from_filename(filename):
  """Parse timestamp from a SpeakFaster Observer data filename."""
  filename = os.path.basename(filename)
  return parse_timestamp(filename.split("-", 1)[0])


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
