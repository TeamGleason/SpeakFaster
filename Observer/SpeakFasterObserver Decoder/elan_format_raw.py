"""Format raw data for ELAN curation."""

import argparse
import glob
import os
import pathlib
import subprocess

import pytz

import audio_asr
import file_naming
import keypresses_pb2
import tsv_data


def format_raw_data(input_dir,
                    timezone,
                    speaker_count):
  if not os.path.isdir(input_dir):
    raise ValueError("%s is not an existing directory" % input_dir)

  (first_audio_path,
   concatenated_audio_path,
   audio_start_time_epoch,
   audio_duration_s) = read_and_concatenate_audio_files(input_dir, timezone)

  keypresses_paths = glob.glob(os.path.join(input_dir, "*-Keypresses.protobuf"))
  if len(keypresses_paths) != 1:
    raise ValueError(
        "Cannot find exactly one Keypresses protobuf file in %s" % input_dir)
  keypresses_path = keypresses_paths[0]
  keypresses_tsv_path = os.path.join(input_dir, "keypresses.tsv")
  format_keypresses(
      keypresses_path, audio_start_time_epoch, keypresses_tsv_path)

  # Extract audio events.
  audio_events_tsv_path = os.path.join(input_dir, "audio_events.tsv")
  extract_audio_events(concatenated_audio_path, audio_events_tsv_path)

  # Perform ASR on audio.
  # TODO(cais): Uncomment me. DO NOT SUBMIT.
  asr_tsv_path = os.path.join(input_dir, "asr.tsv")
  # run_asr(first_audio_path, asr_tsv_path, speaker_count=speaker_count)

  # Merge the files.
  merged_tsv_path = os.path.join(input_dir, "merged.tsv")
  print("Merging TSV files...")
  tsv_data.merge_tsv_files(
      [keypresses_tsv_path, audio_events_tsv_path, asr_tsv_path], merged_tsv_path)

  # TODO(cais): Add fake video file.


def read_and_concatenate_audio_files(input_dir, timezone):
  first_audio_path = sorted(
      glob.glob(os.path.join(input_dir, "*-MicWaveIn.flac")))[0]
  audio_start_time = file_naming.parse_timestamp_from_filename(first_audio_path)
  tz = pytz.timezone(timezone)
  audio_start_time = tz.localize(audio_start_time)
  audio_start_time_epoch = audio_start_time.timestamp()
  print("Audio data start time: %s (%.3f)" % (
      audio_start_time, audio_start_time_epoch))
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
  return (first_audio_path,
          concatenated_audio_path, audio_start_time_epoch, audio_duration_s)



DUMMY_KEYPRESS_DURATION_SEC = 0.1
KEYPRESS_TIER = "Keypress"


def format_keypresses(keypresses_path,
                      start_epoch_time,
                      output_tsv_path):
  """Convert the keypress data from the protobuf format to TSV format.

  Args:
    keypresses_path: Path to the protobuf file that contains the raw
      keypresses data.
    start_epoch_time: Starting time of the data collection session,
      in seconds since the epoch.
    output_tsv_path: Path to the output TSV file.
  """
  keypresses = keypresses_pb2.KeyPresses()
  with open(keypresses_path, "rb") as file:
    keypresses.ParseFromString(file.read())
  num_keypresses = len(keypresses.keyPresses)
  first_keypress_epoch_ms = (
      keypresses.keyPresses[0].Timestamp.ToMilliseconds())
  print("First keypress epoch time: %.3f" % (first_keypress_epoch_ms / 1e3))
  with open(output_tsv_path, "w") as f:
    f.write(tsv_data.HEADER + "\n")
    for keypress in keypresses.keyPresses:
      relative_time = keypress.Timestamp.ToMilliseconds() / 1e3 - start_epoch_time
      f.write("%.3f\t%.3f\t%s\t%s\n" % (
          relative_time, relative_time + DUMMY_KEYPRESS_DURATION_SEC,
          KEYPRESS_TIER, keypress.KeyPress))
  print("Saved data for %d keypresses to %s" % (
      len(keypresses.keyPresses), output_tsv_path))


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


def run_asr(first_audio_path,
            output_tsv_path,
            speaker_count=0):
  subprocess.check_call([
      "python",
      os.path.join(os.path.dirname(__file__), "audio_asr.py"),
      # Async mode gives slightly higher accuracy compared to streaming mode.
      "--use_async",
      "--speaker_count=%d" % speaker_count,
      first_audio_path,
      output_tsv_path])


def parse_args():
  parser = argparse.ArgumentParser()
  parser.add_argument(
      "input_dir", help="Input directory path")
  parser.add_argument(
      "timezone",
      type=str,
      default="US/Central",
      help="Timezone in which the data was collected")
  parser.add_argument(
      "--speaker_count",
      type=int,
      default=2,
      help="Number of speakers in the audio. Used for ASR and speaker "
      "diarization. A value of 0 disables the speaker diarization.")
  return parser.parse_args()


def main():
  args = parse_args()
  format_raw_data(args.input_dir, args.timezone, args.speaker_count)


if __name__ == "__main__":
  main()
