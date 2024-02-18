"""Corrects typos and grammatical errors in the Turk Dialogues dataset.

The focus of the correction is the typos and grammatical errors that
affect acronym expansion evaluation results. Examples include
- Typos such as "unbelievable" -> ""unbelieveable"
- Common misspelling, e.g., "let's" -> "lets", "it's" -> "its"
- Obvious grammatical error such as "go to the casino" -> "go the casino"

The details are specified in turk_dialogues_corrections.txt, which is
loosely based on the `sed` format.

These errors are found with the help of the spell and grammar checker in
Google Docs.

Reference:
Vertanen, Keith, and Per Ola Kristensson. "The imagination of crowds:
conversational AAC language modeling using crowdsourcing and large data
sources." Proceedings of the 2011 Conference on Empirical Methods in Natural
Language Processing. 2011.
"""
import os

from absl import app
from absl import flags

_DATA_RELPATH = "./turk_dialogues_corrections.txt"
FLAGS = flags.FLAGS

flags.DEFINE_string(
    "input_path",
    default="./turk-dialogues.txt",
    help="Input dataset path")
flags.DEFINE_string(
    "output_path",
    default="./turk-dialogues-corrected.txt",
    help="Output dataset path")


def apply_sed_command(in_str, sed_command, allow_missing):
  """Apply sed command for string replacement.

  Args:
    in_str: Input string to apply string replacement on.
    sed_command: Replacement command in sed format, e.g., "s/abc/def/"
    allow_missing: Whether it is allowed that `in_str` doesn't contain the
      source string in `sed_command`.

  Returns:
    String after replacement.

  Raises:
    ValueError if the source string is missing from in_str and allow_missing is
      False.
  """
  begin_index = sed_command.index("s/")
  second_slash_index = sed_command[begin_index +
                                   2:].index("/") + begin_index + 2
  third_slash_index = sed_command[second_slash_index +
                                  1:].index("/") + second_slash_index + 1
  source_substr = sed_command[begin_index + 2:second_slash_index]
  dest_substr = sed_command[second_slash_index + 1:third_slash_index]
  if source_substr == dest_substr:
    raise ValueError("Source and destination substrings are identical: '%s'" %
                     source_substr)
  if source_substr not in in_str:
    if allow_missing:
      return in_str
    raise ValueError("Found no substring \"%s\" in line \"%s\"" %
                     (source_substr, in_str))
  return in_str.replace(source_substr, dest_substr)


def _corrections_data_path():
  return os.path.join(flags.FLAGS.datadir, _DATA_RELPATH)


def correct_line(corrections, original_line):
  """Correct a line using the corrections specified in the sed format."""
  corrections = " " + corrections.strip()
  sed_commands = corrections.split(" s/")[1:]
  sed_commands = [("s/" + command) for command in sed_commands]
  line = original_line
  for sed_command in sed_commands:
    line = apply_sed_command(line, sed_command)
  return line


def main(_):
  if FLAGS.input_path == FLAGS.output_path:
    raise ValueError("Input and output paths are identical")
  if os.path.isfile(FLAGS.output_path):
    raise ValueError("File already exists at output path: %s" %
                     FLAGS.output_path)

  data_lines = []
  chain_id_to_line_index = dict()
  with open(FLAGS.input_path, "rt") as f:
    while True:
      line = f.readline()
      if not line:
        break
      chain_id = line.split("\t")[1]
      chain_id_to_line_index[chain_id] = len(data_lines)
      data_lines.append(line)

  with open(_corrections_data_path(), "rt") as f:
    while True:
      line = f.readline()
      if not line:
        break
      _, chain_id, corrections = line.split(" ", 2)
      print("Correcting %s" % chain_id)
      line_index = chain_id_to_line_index[chain_id]
      original_line = data_lines[line_index]
      corrected_line = correct_line(corrections, original_line)
      data_lines[line_index] = corrected_line

  with open(FLAGS.output_path, "wt") as f:
    for data_line in data_lines:
      f.write(data_line)
  print("Wrote corrected dataset to %s" % FLAGS.output_path)


if __name__ == "__main__":
  app.run(main)
