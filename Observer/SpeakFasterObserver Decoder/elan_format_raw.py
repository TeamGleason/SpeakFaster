"""Format raw data for ELAN curation."""

import argparse
import glob
import os
import pathlib
import subprocess

import audio_asr
import keypresses_pb2


parser = argparse.ArgumentParser()
parser.add_argument("input_dir", help="Input directory path")


def format_raw_data(input_dir):
  if not os.path.isdir(input_dir):
    raise ValueError("%s is not an existing directory" % input_dir)
  keypresses_paths = glob.glob(os.path.join(input_dir, "*-Keypresses.protobuf"))
  if len(keypresses_paths) != 1:
    raise ValueError(
        "Cannot find exactly one Keypresses protobuf file in %s" % input_dir)
  keypresses_path = keypresses_paths[0]
  format_keypresses(keypresses_path)

  first_audio_path = sorted(
      glob.glob(os.path.join(input_dir, "*-MicWaveIn.flac")))[0]
  path_groups, group_durations_sec = audio_asr.get_consecutive_audio_file_paths(
      first_audio_path)
  all_audio_paths = []
  for path_group in path_groups:
    all_audio_paths.extend(path_group)
  print("Found %s audio file: %s" % (len(all_audio_paths), all_audio_paths))
  concatenated_audio_path = os.path.join(input_dir, "concatenated_audio.flac")
  audio_duration_s = audio_asr.concatenate_audio_files(
      all_audio_paths, concatenated_audio_path)
  print("Saved concatenated audio file to %s (duration = %.3f s)" % (
      concatenated_audio_path, audio_duration_s))
#   print(path_groups, group_durations_sec)

  # Extract audio events.
  audio_events_tsv_path = os.path.join(input_dir, "audio_events.tsv")
  extract_audio_events(concatenated_audio_path, audio_events_tsv_path)

  # TODO(cais): Add asr.
  # TODO(cais): Add fake video file.


def format_keypresses(keypresses_path):
  keypresses = keypresses_pb2.KeyPresses()
  with open(keypresses_path, "rb") as file:
    keypresses.ParseFromString(file.read())
  num_keypresses = len(keypresses.keyPresses)
  first_keypress_epoch_ms = keypresses.keyPresses[0].Timestamp.ToMilliseconds()
  print("First keypress epoch ms: %d" % first_keypress_epoch_ms)
#   for keypress in keypresses.keyPresses:
#     print(keypress.KeyPress)  # DEBUG

def extract_audio_events(concatenated_audio_path, output_tsv_path):
  pure_path = pathlib.PurePath(concatenated_audio_path)
  wav_path = (
      concatenated_audio_path
      if pure_path.suffix.lower() == ".wav"
      else pure_path.with_suffix(".wav"))
  if not os.path.isfile(wav_path):
    raise ValueError("Cannot find concated .wav file")
  subprocess.check_call([
      "python",
      os.path.join(os.path.dirname(__file__), "extract_audio_events.py"),
      wav_path,
      output_tsv_path])
  print("Saved audio events to file: %s" % output_tsv_path)


def main():
  args = parser.parse_args()
  format_raw_data(args.input_dir)


if __name__ == "__main__":
  main()