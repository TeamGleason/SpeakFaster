"""Postprocessing of curation results.

The curation of the data from elan_format_raw.py in ELAN should yield a file
named curated.tsv. This Python script performs the following operations on the
file:
1. Checking its correctness
2. Replacing the real names in speaker tags with pseudonyms
3. Redact the keystrokes that corresponds to the time ranges in the
   `Redacted.*` annotations.
4. Reorder the rows of the tsv file in ascending order of tBegin.
"""

import argparse
import csv
from dateutil import parser
import json
import os
import re

import numpy as np

import tsv_data

SPEAKER_MAP_DELIMITER = "\t"
SPEKAER_MAP_COLUMN_HEADS = ("RealName", "Pseudonym")


def load_speaker_map(speaker_map_tsv_path):
  """Loads speaker map.

  Args:
    speaker_map_tsv_path: Path to the tsv file that contains the columns
      RealName and Pseudonym.

  Returns:
    A dict mapping real name to pseudonym. The real name keys are converted
      to all lowercase.
  """
  expected_header = SPEAKER_MAP_DELIMITER.join(SPEKAER_MAP_COLUMN_HEADS)
  realname_to_pseudonym = dict()
  pseudonym_to_realname = dict()
  with open(speaker_map_tsv_path, "r") as f:
    reader = csv.reader(f, delimiter="\t")
    rows = list(reader)
    if tuple(rows[0]) != SPEKAER_MAP_COLUMN_HEADS:
      raise ValueError(
          "Expected speaker map file to have header '%s', but got '%s'" %
          (SPEKAER_MAP_COLUMN_HEADS, rows[0]))
    for row in rows[1:]:
      if not row:
        break
      realname, pseudonym = row
      realname = realname.lower()
      if realname in realname_to_pseudonym:
        raise ValueError("Duplicate real name found in %s: %s" %
            (speaker_map_tsv_path, realname))
      if pseudonym in pseudonym_to_realname:
        raise ValueError("Duplicate pseudonym found in %s: %s" %
            (speaker_map_tsv_path, pseudonym))
      realname_to_pseudonym[realname] = pseudonym
      pseudonym_to_realname[pseudonym] = realname
  print("Speaker map:", json.dumps(realname_to_pseudonym))
  return realname_to_pseudonym


def is_number(string):
  try:
    float(string)
    return True
  except ValueError:
    return False


def infer_columns(tsv_path):
  """Infers the columns of a curated tsv file.

  Args:
    tsv_path: Path to the input tsv file.

  Returns:
    A tuple of four numbers, indicating the 0-based column indices for:
      tBegin, tEnd, Tier, and Content
  """
  # TODO(cais): Deal with the case where there is actually a header.
  with open(tsv_path, "r") as f:
    reader = csv.reader(f, delimiter=tsv_data.DELIMITER)
    is_numeric = [[], [], [], []]
    is_tier = [[], [], [], []]
    for i, row in enumerate(reader):
      if not row:
        break
      items = [item for item in row if item]
      if len(items) != 4:
        raise ValueError(
            "Line %d of the file %s contains %d columns; expected %d" %
            (i + 1, tsv_path, len(items), 4))
      for j, item in enumerate(items):
        is_numeric[j].append(is_number(item))
        is_tier[j].append(item in tsv_data.ALL_TIERS)

  column_is_numeric = [np.all(column) for column in is_numeric]
  if column_is_numeric.count(True) < 2:
    raise ValueError("Cannot find exactly two columns for tBegin and tEnd")
  idx_column_tbegin = column_is_numeric.index(True)
  if not column_is_numeric[idx_column_tbegin + 1]:
    raise ValueError(
        "Cannot find adjacent tBegin and tEnd columns in %s" % tsv_path)
  idx_column_tend = idx_column_tbegin + 1
  print("tBegin determined to be column %d" % (idx_column_tbegin + 1))
  print("tEnd determined to be column %d" % (idx_column_tend + 1))

  column_is_tier = [np.all(column) for column in is_tier]
  if column_is_tier.count(True) < 1:
    raise ValueError(
        "Cannot find a tier column in %s. "
        "There may be invalid tier names in the file." % tsv_path)
  idx_column_tier = column_is_tier.index(True)
  print("Tier determined to be column %d" % (idx_column_tier + 1))

  idx_column_content = list(set((0, 1, 2, 3)) - set((
      idx_column_tbegin, idx_column_tend, idx_column_tier)))[0]
  print("Content determined to be column %d" % (idx_column_content + 1))

  return (idx_column_tbegin, idx_column_tend, idx_column_tier, idx_column_content)


def load_rows(tsv_path, column_order):
  """Load the rows of the tsv file in ascending order of Begin.

  Also checks tEnd >= tBegin for all rows.

  Args:
    tsv_path: Path to the input tsv file.
    column_order: Column indices for tBegin, tEnd, Tier, and Contents, as a
      tuple of integers.

  Returns:
    A list of rows, sorted in ascending order of tBegin. Each item of the list
      are a list of (tBegin, tEnd, tier, contents).
  """
  col_tbegin, col_tend, col_tier, col_content = column_order
  output_rows = []
  with open(tsv_path, "r") as f:
    reader = csv.reader(f, delimiter=tsv_data.DELIMITER)
    for i, row in enumerate(reader):
      items = [item for item in row if item]
      tbegin = float(items[col_tbegin])
      tend = float(items[col_tend])
      tier = items[col_tier].strip()
      content = items[col_content].strip()
      if tend < tbegin:
        raise ValueError(
            "Line %d of %s has tBegin and tEnd out of order: %.3f < %.3f" %
            (i + 1, tsv_path, tend, tbegin))
      output_rows.append([tbegin, tend, tier, content])
  return sorted(output_rows, key=lambda x: x[0])


_SPEECH_TRANSCRIPT_CONTENT_REGEX = re.compile(
    ".+(\[(Speaker|SpeakerTTS):[A-Za-z0-9]+\])$")
_REDACT_TIME_RANGE_REGEX = re.compile("\[Redacted[A-Za-z]*?:.*?\]")


def parse_time_range(tag):
  original_tag = tag
  index_colon = tag.index(":")
  tag = tag[index_colon + 1:-1].strip()
  if tag.count("-") != 1:
    raise ValueError(
        "Invalid redaction tag with time range: '%s'" % original_tag)
  index_hyphen = tag.index("-")
  if index_hyphen == 0:
    raise ValueError(
        "Invalid redaction tag with time range: '%s'" % original_tag)
  tbegin_str = tag[:index_hyphen]
  tend_str = tag[index_hyphen + 1:]
  t0 = parser.parse("2000-01-01T00:00:00.000")
  tbegin = parser.parse("2000-01-01T" + tbegin_str) - t0
  tbegin = tbegin.seconds + 1e6 * tbegin.microseconds
  tend = parser.parse("2000-01-01T" + tend_str) - t0
  tend = tend.seconds + 1e6 * tend.microseconds
  if tend <= tbegin:
    raise ValueError("Invalid time range in tag: '%s'" % original_tag)
  return tbegin, tend


def apply_speaker_map(rows, realname_to_pseudonym):
  for i, row in enumerate(rows):
    _, _, tier, content = row
    if tier == tsv_data.SPEECH_TRANSCRIPT_TIER_NAME:
      match = re.match(_SPEECH_TRANSCRIPT_CONTENT_REGEX, content)
      if not match:
        raise ValueError("Invalid SpeechTranscripts content: '%s'" % content)
      realname_tag, tag_type = match.groups()
      realname = realname_tag[len("[" + tag_type) + 1:-1]
      if realname.lower() not in realname_to_pseudonym:
        raise ValueError("Cannot find real name in speaker tag: %s" % realname)
      pseudonym = realname_to_pseudonym[realname.lower()]
      pseudonym_tag = "[%s:%s]" % (tag_type, pseudonym)
      index = content.rindex(realname_tag)
      pseudonymized_content = content[:index] + pseudonym_tag
      rows[i][3] = pseudonymized_content

      # Check for redaction tags with time ranges.
      redaction_time_range_tags = re.findall(
          _REDACT_TIME_RANGE_REGEX, pseudonymized_content)
      for time_range_tag in redaction_time_range_tags:
        print(time_range_tag)  # DEBUG
        parse_time_range(time_range_tag)


def parse_args():
  parser = argparse.ArgumentParser()
  parser.add_argument(
      "input_dir",
      type=str,
      help="Input directory path. This directory is assumed to contain the "
      "curated.tsv file from the ELAN curation process.")
  parser.add_argument(
      "speaker_map_tsv_path",
      type=str,
      help="Path to the speaker map file. This file is assumed to be a tsv file "
      "with two columns: RealName and Pseudonym")
  return parser.parse_args()


def main():
  args = parse_args()
  realname_to_pseudonym = load_speaker_map(args.speaker_map_tsv_path)
  curated_tsv_path = os.path.join(args.input_dir, "curated.tsv")
  column_order = infer_columns(curated_tsv_path)
  rows = load_rows(curated_tsv_path, column_order)
  apply_speaker_map(rows, realname_to_pseudonym)


if __name__ == "__main__":
  main()
