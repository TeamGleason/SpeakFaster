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
import json
import os

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
    A dict mapping real name to pseudonym.
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
  """Infers the columns of a curated tsv file."""
  with open(tsv_path, "r") as f:
    reader = csv.reader(f, delimiter=tsv_data.DELIMITER)
    rows = list(reader)
    is_numeric = [[], [], [], []]
    is_tier = [[], [], [], []]
    for i, row in enumerate(rows):
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
    raise ValueError("Cannot find a tier column in %s" % tsv_path)
  idx_column_tier = column_is_tier.index(True)
  print("Tier determined to be column %d" % (idx_column_tier + 1))

  idx_column_content = list(set((0, 1, 2, 3)) - set((
      idx_column_tbegin, idx_column_tend, idx_column_tier)))[0]
  print("Content determined to be column %d" % (idx_column_content + 1))

  return (idx_column_tbegin, idx_column_tend, idx_column_tier, idx_column_content)


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


if __name__ == "__main__":
  main()
