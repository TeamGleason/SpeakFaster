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
from datetime import datetime
import json
import os
import re

import numpy as np

import tsv_data

SPEAKER_MAP_DELIMITER = "\t"
SPEKAER_MAP_COLUMN_HEADS = ("RealName", "Pseudonym")

_SPEECH_TRANSCRIPT_CONTENT_REGEX = re.compile(
    ".+(\[(Speaker|SpeakerTTS):[A-Za-z0-9]+\])$")
_REDACT_TIME_RANGE_REGEX = re.compile("\[Redacted[A-Za-z]*?:.*?\]")
_DUMMY_DATETIME_FORMAT_NO_MILLIS = "%Y-%m-%dT%H:%M:%S"
_DUMMY_DATETIME_FORMAT_WITH_MILLIS = "%Y-%m-%dT%H:%M:%S.%f"
_UTTERANCE_ID_REGEX = r"\[U[0-9]+\]"


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
  # Check and see whether there file actually has a header row.
  with open(tsv_path, "r") as f:
    reader = csv.reader(f, delimiter=tsv_data.DELIMITER)
    first_row = [item for item in next(reader) if item]
    if sorted(first_row) == sorted(list(tsv_data.COLUMN_HEADS)):
      return (first_row.index(tsv_data.TBEGIN_COLUMN_HEAD),
              first_row.index(tsv_data.TEND_COLUMN_HEAD),
              first_row.index(tsv_data.TIER_COLUMN_HEAD),
              first_row.index(tsv_data.CONTENT_COLUMN_HEAD)), True

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

  return (idx_column_tbegin,
          idx_column_tend, idx_column_tier, idx_column_content), False


def load_rows(tsv_path, column_order, has_header=False):
  """Load the rows of the tsv file in ascending order of Begin.

  Also checks tEnd >= tBegin for all rows.

  Args:
    tsv_path: Path to the input tsv file.
    column_order: Column indices for tBegin, tEnd, Tier, and Contents, as a
      tuple of integers.
    has_header: Whether the TSV file has a header row.

  Returns:
    A list of rows, sorted in ascending order of tBegin. Each item of the list
      are a list of (tBegin, tEnd, tier, contents).
  """
  col_tbegin, col_tend, col_tier, col_content = column_order
  output_rows = []
  with open(tsv_path, "r") as f:
    reader = csv.reader(f, delimiter=tsv_data.DELIMITER)
    if has_header:
      next(reader)
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


def _parse_time_string(time_str):
  time_str = time_str.strip()
  base_time = ("2000-01-01T00:00:00.000" if ("." in time_str)
               else "2000-01-01T00:00:00")
  time_format = (_DUMMY_DATETIME_FORMAT_WITH_MILLIS if ("." in time_str)
                 else _DUMMY_DATETIME_FORMAT_NO_MILLIS)
  t0 = datetime.strptime(base_time, time_format)
  t1 = datetime.strptime("2000-01-01T" + time_str, time_format)
  dt = t1 - t0
  return dt.seconds + dt.microseconds / 1e6


def parse_time_range(tag):
  original_tag = tag
  if tag.count("-") != 1:
    raise ValueError(
        "Invalid redaction tag with time range: '%s'" % original_tag)
  index_hyphen = tag.index("-")
  if index_hyphen == 0:
    raise ValueError(
        "Invalid redaction tag with time range: '%s'" % original_tag)
  tbegin_str = tag[:index_hyphen]
  tend_str = tag[index_hyphen + 1:]
  tbegin = _parse_time_string(tbegin_str)
  tend = _parse_time_string(tend_str)
  if tend <= tbegin:
    raise ValueError(
        "Begin and end time out of order in tag: '%s'" % original_tag)
  return tbegin, tend


def parse_utterance_id(transcript, expected_counter=None):
  match = re.search(_UTTERANCE_ID_REGEX, transcript)
  if not match:
    return None
  match_begin, match_end = match.span()
  utterance_id_with_brackets = transcript[match_begin : match_end]
  if expected_counter is not None:
    assert utterance_id_with_brackets == "[U%d]" % expected_counter
  utterance_id = utterance_id_with_brackets[1:-1]
  return utterance_id_with_brackets, utterance_id


def parse_redacted_segments(transcript):
  """Given an utterance transcript, parse all segments with redaction.

  Args:
    transcript: The transcript of an utterance, as a string.

  Returns:
    A list of (begin, end, redaction_tag, redacted_text, (tbegin, tend))
      tuples, wherein,
      - begin is the beginning index of the redacted segment in the input
        string.
      - end is the ending index (exclusive).
      - redaction_tag is the name of the redaction tag, e.g., RedactedSensitive.
      - redacted_text is the text body of the redacted text.
      - (tbegin, tend) is the optional keystroke time range, which is applicable
        only to speech utterance from AAC user's TTS. If not applicable, this is
        None.
  """
  output = []
  offset = 0
  while True:
    if "<Redacted" not in transcript:
      break
    begin = transcript.index("<Redacted")
    if ">" not in transcript[begin:]:
      raise ValueError("Invalid redaction syntax in %s" % transcript)
    begin_tag = transcript[begin:transcript.index(">") + 1]
    tag_tokens = begin_tag[1:-1].split(" ")
    redaction_tag = tag_tokens.pop(0)
    t_span = None
    for token in tag_tokens:
      if token.count("=") != 1:
        raise ValueError("Invalid syntax in tag: %s" % begin_tag)
      attr_type, attr_value = token.split("=")
      if not (attr_value.startswith("\"") and attr_value.endswith("\"")):
        raise ValueError(
            "Invalid syntax (missing quotes) in tag: %s" % begin_tag)
      if attr_type == "time":
        t_span = parse_time_range(attr_value[1:-1])
      else:
        raise ValueError(
            "Unsupported attribute type %s in tag %s" % (attr_type, begin_tag))
    end_tag = "</%s>" % redaction_tag
    if end_tag not in transcript[begin:]:
      raise ValueError(
          "Cannot find closing tag '%s' in '%s'" % (end_tag, transcript))
    end_tag_index = transcript[begin:].index(end_tag)
    if end_tag_index < len(begin_tag):
      raise ValueError("Invalid tag syntax in: %s" % transcript)
    end = begin + end_tag_index + len(end_tag)
    redacted_text = transcript[begin + len(begin_tag):begin + end_tag_index]
    output.append(
        (begin + offset, end + offset, redaction_tag, redacted_text, t_span))
    offset += end
    transcript = transcript[end:]
  return output


def calculate_speech_curation_stats(merged_tsv_path, rows):
  """Calculate statistics about the speech transcript and their curation.

  This function also checks for errors including:
    - Inadvertent deletion of the [UX] utterance label.

  # TODO(cais): Handle SpeechTranscripts2 tier.
  """
  column_order, has_header = infer_columns(merged_tsv_path)
  original_rows = load_rows(
      merged_tsv_path, column_order, has_header=has_header)
  original_rows = [
      row for row in original_rows
      if row[2] == tsv_data.SPEECH_TRANSCRIPT_TIER]
  curated_rows = [
      row for row in rows
      if row[2] == tsv_data.SPEECH_TRANSCRIPT_TIER]
  stats = {
      "original_num_utterances": len(original_rows),
      "curated_num_utterances:": len(curated_rows),
      "deleted_utterances": [],
      "added_utterance_indices": 0,
      "utterance_edits": [],
      "curated_speaker_id_to_original_speaker_id": [],
  }
  # If there is an annotation with tBegin and tEnd matching
  # exactly that of an original. Report an error.
  for i, row in enumerate(original_rows):
    tbegin, tend, _, transcript = row
    utterance_id_with_braket, utterance_id = parse_utterance_id(
        transcript, i + 1)
    matching_rows = [
        r for r in curated_rows if r[0] == tbegin and r[1] == tend]
    if not matching_rows:
      stats["deleted_utterances"].append({
        "utterance_id": utterance_id,
        "num_tokens": -1,  # TODO(cais):
        "num_chars": -1,  # TODO(cais):
      })
      continue
    elif len(matching_rows) > 1:
      raise ValueError(
          "Found multiple speech transcripts of timestamp: %.3f - %.3f" %
         (tbegin, tend))
    else:
      matching_row = matching_rows[0]
      if utterance_id_with_braket not in matching_row[3]:
        raise ValueError(
            "In curated.tsv, it seems that you have deleted or changed "
            "the utterance ID "
            "'%s' from the utterance: '%s'. Please add it back." %
            (utterance_id_with_braket, matching_row))
  # Go over the curated speech rows, find which are added.
  for i, row in enumerate(curated_rows):
    tbegin, tend, _, transcript = row
    if not parse_utterance_id(transcript):
      stats["added_utterance_indices"].append(i)

  # Calculate the edit distances of words in transcripts.
  print(stats)
  import sys; sys.exit(1)  # DEBUG
  return stats


def apply_speaker_map_get_keypress_redactions(rows, realname_to_pseudonym):
  """Applies speaker map on rows and extracts keypress redaction time ranges.

  Args:
    rows: A list of data rows, in the order of (tBegin, tEnd, Tier, Content).
      This list is modified in place.
    realname_to_pseudonym: A dict mapping lowercase real names to pseudonyms.

  Returns:
    Keypress redaction time ranges, as a list of (tbegin, tend) tuples.
  """
  keypress_redaction_time_ranges = []
  for i, row in enumerate(rows):
    _, _, tier, content = row
    if tier == tsv_data.SPEECH_TRANSCRIPT_TIER:
      match = re.match(_SPEECH_TRANSCRIPT_CONTENT_REGEX, content.strip())
      if not match:
        raise ValueError(
            "Invalid SpeechTranscripts content: '%s'. "
            "Make sure to add Speaker or SpeakerTTS tag at the end "
            "(e.g., '[Speaker:John]')" % content)
      realname_tag, tag_type = match.groups()
      realname = realname_tag[len("[" + tag_type) + 1:-1]
      if realname.lower() not in realname_to_pseudonym:
        raise ValueError("Cannot find real name in speaker tag: %s" % realname)
      pseudonym = realname_to_pseudonym[realname.lower()]
      pseudonym_tag = "[%s:%s]" % (tag_type, pseudonym)
      index = content.rindex(realname_tag)
      pseudonymized_content = content[:index] + pseudonym_tag

      # Check for redaction tags with time ranges, replace the redacted spans
      # with tags like "[RedactedSenitive]"
      redaction_time_range_tags = re.findall(
          _REDACT_TIME_RANGE_REGEX, pseudonymized_content)
      redacted_segments = parse_redacted_segments(pseudonymized_content)
      for begin, end, redaction_tag, _, tspan in reversed(
          redacted_segments):
        if tspan:
          keypress_redaction_time_ranges.append(tspan)
          redaction_mask = "[%s time=\"%.3f-%.3f\"]" % (
              redaction_tag, tspan[0], tspan[1])
        else:
          redaction_mask = "[%s]" % redaction_tag
        pseudonymized_content = (
            pseudonymized_content[:begin] + redaction_mask +
            pseudonymized_content[end:])
      rows[i][3] = pseudonymized_content
  return keypress_redaction_time_ranges


REDACTED_KEY = "[RedactedKey]"


def redact_keypresses(rows, time_ranges):
  """Redact keypresses based on the time ranges.

  Verifies that each time range in time_range is used.
  If this is not the case, an error will be thrown.

  Args:
    rows: Rows that contain (among other data) the keypress rows to
      be redacted. This list is modified in place.
    time_ranges: A list of (t0, t1) time ranges.
  """
  time_range_use_count = []
  for _ in time_ranges:
    time_range_use_count.append(0)
  for i, row in enumerate(rows):
    tbegin, _, tier, content = row
    if tier != tsv_data.KEYPRESS_TIER:
      continue
    index_use = -1
    for j, time_range in enumerate(time_ranges):
      if time_range[0] <= tbegin and time_range[1] > tbegin:
        index_use = j
        break
    if index_use != -1:
      rows[i][3] = REDACTED_KEY
      time_range_use_count[index_use] += 1
  indices_unused = np.where(np.array(time_range_use_count) == 0)[0].tolist()
  if indices_unused:
    unused_ranges = []
    for i in indices_unused:
      unused_ranges.append(time_ranges[i])
    raise ValueError(
        "Found %d unused keypress redaction time range(s): %s" %
        (len(unused_ranges), unused_ranges))


def write_rows_to_tsv(rows, out_tsv_path):
  with open(out_tsv_path, "w") as f:
    f.write(tsv_data.HEADER + "\n")
    for row in rows:
      tbegin, tend, tier, content = row
      str_items = ["%.3f" % tbegin, "%.3f" % tend, tier, content]
      f.write(tsv_data.DELIMITER.join(str_items) + "\n")


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
  merged_tsv_path = os.path.join(args.input_dir, "merged.tsv")
  curated_tsv_path = os.path.join(args.input_dir, "curated.tsv")
  column_order, has_header = infer_columns(curated_tsv_path)
  rows = load_rows(curated_tsv_path, column_order, has_header=has_header)
  calculate_speech_curation_stats(merged_tsv_path, rows)
  keypress_redaction_time_ranges = apply_speaker_map_get_keypress_redactions(
      rows, realname_to_pseudonym)
  redact_keypresses(rows, keypress_redaction_time_ranges)
  out_json_path = os.path.join(args.input_dir, "curated_processed.json")
  out_tsv_path = os.path.join(args.input_dir, "curated_processed.tsv")
  write_rows_to_tsv(rows, out_tsv_path)
  print("Success: Converted postprocessed tsv file and saved result to: %s" %
        out_tsv_path)


if __name__ == "__main__":
  main()
