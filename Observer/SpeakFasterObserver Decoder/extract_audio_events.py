"""Extract audio event labels from audio waveform input."""

from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import csv
import argparse

from scipy.io import wavfile

import audio_events
import events as events_lib
import tsv_data


parser = argparse.ArgumentParser()
parser.add_argument(
    "input_wav_paths",
    help="Paths to input wav files. Separate multiple files with commas")
parser.add_argument(
    "output_tsv_path", help="Path to output tsv file")

def main():
  args = parser.parse_args()

  wav_paths = sorted(args.input_wav_paths.split(","))
  events = []
  for wav_path in wav_paths:
    fs, xs = wavfile.read(wav_path)
    if len(xs.shape) != 1:
        raise ValueError("Only mono audio is supported")

    # TODO(#35): Resapmle waveform if fs doesn't meet YAMNet requirement.
    def waveform_generator():
      step_length = 16000
      i = 0
      while i < len(xs):
        yield xs[i:i + step_length]
        i += step_length

    events.extend(audio_events.extract_audio_events(
        waveform_generator, fs=fs, threshold_score=0.5))

  tsv_rows = events_lib.convert_events_to_tsv_rows(
      events,
      tsv_data.AUDIO_EVENTS_TIER,
      ignore_class_names=audio_events.YAMNET_IGNORE_CLASS_NAMES)
  with open(args.output_tsv_path, mode="w") as f:
    tsv_writer = csv.writer(f, delimiter="\t")
    tsv_writer.writerow(tsv_data.COLUMN_HEADS)
    for row in tsv_rows:
      tsv_writer.writerow(row)


if __name__ == "__main__":
  main()
