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
import glob
import json
import os
import re

import numpy as np

import file_naming
import metadata_pb2
import nlp
import transcript_lib
import tsv_data


SPEAKER_MAP_DELIMITER = "\t"
SPEKAER_MAP_COLUMN_HEADS = ("RealName", "Pseudonym")
REDACTED_KEY = "[RedactedKey]"
_REDACT_TIME_RANGE_REGEX = re.compile("\[Redacted[A-Za-z]*?:.*?\]")


def load_speaker_map(speaker_map_json_path):
  """Loads speaker map from JSON file.

  See README.md for a definition of the expected schema of the JSON file.

  Args:
    speaker_map_json_path: Path to the tsv file that contains the columns
      RealName and Pseudonym.

  Returns:
    A dict mapping real name to pseudonym. The real name keys are converted
      to all lowercase.
  """
  expected_header = SPEAKER_MAP_DELIMITER.join(SPEKAER_MAP_COLUMN_HEADS)
  with open(speaker_map_json_path, "r") as f:
    json_obj = json.load(f)
  if not "realname_to_pseudonym" in json_obj:
    raise ValueError("Cannot find the field realname_to_pseudonym in %s" %
                      speaker_map_json_path)
  realname_to_pseudonym = dict()
  pseudonym_to_realname = dict()
  for realname, pseudonym in json_obj["realname_to_pseudonym"].items():
    realname = realname.strip().lower()
    pseudonym = pseudonym.strip()
    if realname in realname_to_pseudonym:
      raise ValueError("Duplicate real names in %s: %s" %
                       (speaker_map_json_path, realname))
    realname_to_pseudonym[realname] = pseudonym
    if pseudonym in pseudonym_to_realname:
      raise ValueError("Duplicate pseudonyms in %s: %s" %
                       (speaker_map_json_path, pseudonym))
    pseudonym_to_realname[pseudonym] = realname
  print("Speaker map:", json.dumps(realname_to_pseudonym))
  return realname_to_pseudonym


def is_number(string):
  try:
    float(string)
    return True
  except ValueError:
    return


def is_speech_content_tier(tier):
  return tier in (tsv_data.KEYPRESS_PHRASE_TIER,
                  tsv_data.SPEECH_TRANSCRIPT_TIER)


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


def calculate_speech_curation_stats(merged_tsv_path,
                                    curated_rows,
                                    realname_to_pseudonym):
  """Calculate statistics about the speech transcript and their curation.

  This function also checks for errors including:
    - Inadvertent deletion of the [UX] utterance label.

  # TODO(cais): Handle SpeechTranscripts2 tier.
  """
  column_order, has_header = infer_columns(merged_tsv_path)
  original_rows = load_rows(
      merged_tsv_path, column_order, has_header=has_header)
  original_rows = [
      row for row in original_rows if is_speech_content_tier(row[2])]
  curated_rows = [
      row for row in curated_rows if is_speech_content_tier(row[2])]
  stats = {
      "original_num_utterances": len(original_rows),
      "curated_num_utterances": len(curated_rows),
      "deleted_utterances": [],
      "added_utterances": [],
      "edited_utterances": [],
      "curated_speaker_id_to_original_speaker_id": [],
  }
  # If there is an annotation with tBegin and tEnd matching
  # exactly that of an original. Report an error.
  for i, row in enumerate(original_rows):
    tbegin, tend, _, transcript = row
    utterance_id_with_braket, utterance_id = transcript_lib.parse_utterance_id(
        transcript, i + 1)
    matching_rows = [
        r for r in curated_rows if r[0] == tbegin and r[1] == tend]
    if not matching_rows:
      stats["deleted_utterances"].append({
        "utterance_id": utterance_id,
        "utterance_summary": transcript_lib.summarize_speech_content(transcript),
      })
      continue
    elif len(matching_rows) > 1:
      raise ValueError(
          "Found multiple speech transcripts of timestamp: %.3f - %.3f" %
         (tbegin, tend))
    else:
      matching_row = matching_rows[0]
      original_transcript = row[3]
      curated_transcript = matching_row[3]
      original_speaker_id = transcript_lib.extract_speaker_tag(
          original_transcript)[-1]
      curated_speaker_id = transcript_lib.extract_speaker_tag(
          curated_transcript)[-1]
      if utterance_id_with_braket not in curated_transcript:
        raise ValueError(
            "In curated.tsv, it seems that you have deleted or changed "
            "the utterance ID "
            "'%s' from the utterance: '%s'. Please add it back." %
            (utterance_id_with_braket, matching_row))
      stats["edited_utterances"].append({
          "utterance_id": utterance_id,
          "utterance_summary":
              transcript_lib.summarize_speech_content(
                  curated_transcript,
                  hypothesis_transcript=original_transcript),
      })
      if curated_speaker_id.lower() not in realname_to_pseudonym:
        raise ValueError(
            "Cannot find speaker ID %s. Make sure you have entered "
            "the correct real name for the speaker in utterance: %s" %
            (curated_speaker_id, curated_transcript))
      stats["curated_speaker_id_to_original_speaker_id"].append({
          "utterance_id": utterance_id,
          "original_speaker_id":
              realname_to_pseudonym.get(original_speaker_id.lower(),
                                        original_speaker_id),
          "curated_speaker_id":
              realname_to_pseudonym[curated_speaker_id.lower()],
      })
      print("\"%s\" - \"%s\": WER = %.3f" %
            (original_transcript, curated_transcript,
             stats["edited_utterances"][-1]["utterance_summary"]["wer"]))
  # Go over the curated speech rows, find which are added.
  for i, row in enumerate(curated_rows):
    tbegin, tend, _, transcript = row
    if not transcript_lib.parse_utterance_id(transcript):
      stats["added_utterances"].append({
          "index": i,
          "utterance_summary":
              transcript_lib.summarize_speech_content(transcript),
      })
  return stats


def apply_speaker_map_and_redaction_masks(rows, realname_to_pseudonym):
  """Applies speaker map and redactoin masks.

  Also extracts keypress redaction time ranges if exist.

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
    if is_speech_content_tier(tier):
      realname_tag, tag_type, realname = transcript_lib.extract_speaker_tag(
          content.strip())
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
      redacted_segments = transcript_lib.parse_redacted_segments(
          pseudonymized_content)
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


def write_rows_to_tsv(rows,
                      out_tsv_path,
                      speech_transcript_only=False):
  with open(out_tsv_path, "w") as f:
    f.write(tsv_data.HEADER + "\n")
    for row in rows:
      tbegin, tend, tier, content = row
      if speech_transcript_only and tier != tsv_data.SPEECH_TRANSCRIPT_TIER:
        continue
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


def maybe_read_session_end_metadata(input_dir):
  """If a SessionEnd.bin file exists in input dir, reads and returns it.

  As a JSON-serializable dictionary.

  Else returns an empty dict.
  """
  session_end_bin_paths = glob.glob(
      os.path.join(input_dir, "*-SessionEnd.bin"))
  if not session_end_bin_paths:
    return dict()
  if len(session_end_bin_paths) > 1:
    raise ValueError(
        "Unexpectedly found more than one (%d) SessionEnd.bin files "
        "in the directory %s: %s" %
        (len(session_end_bin_paths), input_dir, session_end_bin_paths))
  session_end_bin_path = session_end_bin_paths[0]
  session_metadata = metadata_pb2.SessionMetadata()
  with open(session_end_bin_path, "rb") as f:
    session_metadata.ParseFromString(f.read())
  return {
      "timezone": session_metadata.timezone,
      "computer_manufacturer_family":
          session_metadata.computer_manufacturer_family,
      "gaze_device": session_metadata.gaze_device,
      "platform": session_metadata.platform,
      "os_version": session_metadata.os_version,
  }


def main():
  args = parse_args()
  nlp.init()

  realname_to_pseudonym = load_speaker_map(args.speaker_map_tsv_path)
  merged_tsv_path = os.path.join(args.input_dir,
                                 file_naming.MERGED_TSV_FILENAME)
  curated_tsv_path = os.path.join(args.input_dir, "curated.tsv")
  column_order, has_header = infer_columns(curated_tsv_path)
  rows = load_rows(curated_tsv_path, column_order, has_header=has_header)
  speech_curation_stats = calculate_speech_curation_stats(
      merged_tsv_path, rows, realname_to_pseudonym)
  keypress_redaction_time_ranges = apply_speaker_map_and_redaction_masks(
      rows, realname_to_pseudonym)
  redact_keypresses(rows, keypress_redaction_time_ranges)
  out_json_path = os.path.join(args.input_dir, "curated_processed.json")
  out_tsv_path = os.path.join(args.input_dir, "curated_processed.tsv")
  write_rows_to_tsv(rows, out_tsv_path)
  print("\nSuccess: Converted postprocessed tsv file and saved result to: %s" %
        out_tsv_path)
  speech_only_out_tsv_path = os.path.join(args.input_dir,
                                          "curated_processed_speech_only.tsv")
  write_rows_to_tsv(rows, speech_only_out_tsv_path, speech_transcript_only=True)
  print("\nSuccess: Wrote speech-transcript only tsv file to: %s" %
        speech_only_out_tsv_path)

  out_json = maybe_read_session_end_metadata(args.input_dir)
  with open(out_json_path, "wt") as f:
    out_json["proprocessing_timestamp"] = (
        str(datetime.utcnow().strftime("%Y%m%dT%H%M%S.%fZ")))
    out_json["speech_curation_stats"] = speech_curation_stats
    json.dump(out_json, f, indent=2)
    print("\nWrote additional info to JSON file: %s" % out_json_path)


if __name__ == "__main__":
  main()
