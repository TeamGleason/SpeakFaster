"""Utilities for SpeakFaster data in the TSV format."""

import csv

DELIMITER = "\t"

TBEGIN_COLUMN_HEAD = "tBegin"
TEND_COLUMN_HEAD = "tEND"
TIER_COLUMN_HEAD = "Tier"
CONTENT_COLUMN_HEAD = "Content"
COLUMN_HEADS = (TBEGIN_COLUMN_HEAD,
                TEND_COLUMN_HEAD,
                TIER_COLUMN_HEAD,
                CONTENT_COLUMN_HEAD)
HEADER = DELIMITER.join(COLUMN_HEADS)

# Tier names. Must be unique.
AUDIO_EVENTS_TIER = "AudioEvents1"
KEYPRESSES_TIER = "Keypress"
SPEECH_TRANSCRIPT_TIER_NAME = "SpeechTranscript"
VISUAL_OBJECTS_EVENTS_TIER = "VisualObjects1"


def merge_tsv_files(tsv_paths, merged_path):
  """Merge multiple tsv files into one.

  The rows are sorted by ascending tBegin.

  Args:
    tsv_path: Paths to tsv files to be merged.
    merged_path: Path to the result of merging.
  """
  rows = []
  for tsv_path in tsv_paths:
    with open(tsv_path, "r") as f:
      reader = csv.reader(f, delimiter=DELIMITER)
      file_rows = list(reader)
      if file_rows[0] != list(COLUMN_HEADS):
        raise ValueError("In file %s, expected column heads %s, got %s" %
            (tsv_path, COLUMN_HEADS, file_rows[0]))
      rows.extend(file_rows[1:])
  rows = sorted(rows, key=lambda row: float(row[0]))
  with open(merged_path, "w") as f:
    f.write(HEADER + "\n")
    for row in rows:
      f.write(DELIMITER.join(row) + "\n")
