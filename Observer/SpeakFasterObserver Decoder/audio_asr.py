"""Script for transcribing speech in input audio files."""
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function

import argparse
import glob
import io
import os
import pathlib
import struct

import numpy as np
import pydub
from google.cloud import speech_v1p1beta1 as speech

import file_naming


def get_audio_file_duration_sec(file_path):
  """Get the duration of given audio file, in seconds."""
  pure_path = pathlib.PurePath(file_path)
  audio_seg = pydub.AudioSegment.from_file(pure_path, pure_path.suffix[1:])
  return audio_seg.duration_seconds


def get_consecutive_audio_file_paths(
    first_audio_path, tolerance_seconds=1.0):
  """Get the paths to the consecutive audio files.

  It is assumed that the audio basename of the file path has the format:
      yyyymmddThhmmssf-{DataStream}.{Extension}.

  NOTE: It is assumed that there is no interleaving of more than one series
      of audio files.
  """
  if not os.path.exists(first_audio_path):
    raise ValueError("Nonexist audio file path: %s" % first_audio_path)
  data_stream_name = file_naming.get_data_stream_name(first_audio_path)
  ext = os.path.splitext(first_audio_path)[-1]
  candidate_paths = sorted(glob.glob(os.path.join(
      os.path.dirname(first_audio_path), "*-%s%s" % (data_stream_name, ext))))
  candidate_paths = [
      file for file in candidate_paths if file > first_audio_path]

  output_paths = [first_audio_path]
  total_duration_sec = 0.0
  audio_path = first_audio_path
  while candidate_paths:
    timestamp = file_naming.parse_timestamp_from_filename(audio_path)
    duration_sec = get_audio_file_duration_sec(audio_path)
    total_duration_sec += duration_sec
    next_timestamp = file_naming.parse_timestamp_from_filename(
        candidate_paths[0])
    time_diff = next_timestamp - timestamp
    if np.abs(time_diff.total_seconds() - duration_sec) < tolerance_seconds:
      output_paths.append(candidate_paths[0])
      audio_path = candidate_paths[0]
      del candidate_paths[0]
    else:
      break
  return output_paths, total_duration_sec


def load_audio_data(file_path, config):
  """Load the audio data from given audio file.

  Args:
    file_path: Path to the audio file, as a str.
    config: An instance of google.cloud.speech.RecognitionConfig, used to check
        audio file specs including sample rate and channel count.

  Returns:
    The int16 (LINEAR16) binary buffer for all audio samples in the file.
  """
  pure_path = pathlib.PurePath(file_path)
  audio_seg = pydub.AudioSegment.from_file(pure_path, pure_path.suffix[1:])
  if audio_seg.frame_rate != config.sample_rate_hertz:
    raise ValueError("Mismatch in sample rate: expected: %d; got: %d" % (
        config.sample_rate_hertz, audio_seg.frame_rate))
  if audio_seg.channels != config.audio_channel_count:
    raise ValueError(
        "Mismatch in audio channel count: expected: %d; got: %d" % (
        config.audio_channel_count, audio_seg.channels))
  samples = list(audio_seg.get_array_of_samples())
  # NOTE(cais): We currently use LINEAR16 in the stream requests regardless of
  # the original audio file format. Is it possible to avoid converting FLAC to
  # LINEAR16 during these cloud requests?
  return struct.pack('<%dh' % len(samples), *samples)


def audio_data_generator(input_audio_paths, config):
  """A generator for audio data of all files at the specified file path glob pattern.

  Args:
    input_audio_paths: Paths of input audio files.
    config: An instance of google.cloud.speech.RecognitionConfig, used to check
        audio file specs including sample rate and channel count.

  Yields:
    Instances of `google.cloud.speech.StreamingRecognizeRequest`. These instances
        correspond to the order in `input_audio_paths`.
  """
  if not input_audio_paths:
    raise ValueError("Empty paths")
  for file_path in input_audio_paths:
    try:
      data = load_audio_data(file_path, config)
      yield speech.StreamingRecognizeRequest(audio_content=data)
    except pydub.exceptions.CouldntDecodeError:
      pass  # TODO(cais): Log an error.


def parse_args():
  parser = argparse.ArgumentParser("Transcribe speech in audio input files")
  parser.add_argument(
      "first_audio_path",
      type=str,
      help="Path to the first audio file in the series. The series will be "
      "automatically determined based on the timestamps.")
  parser.add_argument(
      "output_tsv_path",
      type=str,
      help="Path to the output .tsv file that contains the transcripts")
  parser.add_argument(
      "--sample_rate",
      type=int,
      default=16000,
      help="The asserted sample rate of the input audio files (Hz).")
  parser.add_argument(
      "--language_code",
      type=str,
      default="en-US",
      help="Language code used for speech transcription.")
  return parser.parse_args()


SPEECH_TRANSCRIPT_TIER_NAME = "SpeechTranscript"


def transcribe_audio_to_tsv(input_audio_paths,
                            output_tsv_path,
                            sample_rate,
                            language_code):
  """Transcribe speech in input audio files and write results to .tsv file."""
  client = speech.SpeechClient()
  config = speech.RecognitionConfig(
      encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
      sample_rate_hertz=sample_rate,
      audio_channel_count=1,
      language_code=language_code)
  streaming_config = speech.StreamingRecognitionConfig(
      config=config, interim_results=False)
  requests = audio_data_generator(input_audio_paths, config)
  responses = client.streaming_recognize(streaming_config, requests)

  with open(output_tsv_path, "w") as f:
    # Write the TSV header.
    f.write("tBegin\ttEnd\tTier\tContent\n")

    for response in responses:
      if not response.results:
        continue
      results = [result for result in response.results if result.is_final]
      max_confidence = -1
      best_transcript = None
      result_end_time = None
      for result in results:
        for alt in result.alternatives:
          if alt.confidence > max_confidence:
            max_confidence = alt.confidence
            best_transcript = alt.transcript.strip()
            result_end_time = result.result_end_time
      if not best_transcript:
        continue
      end_time_sec = result_end_time.total_seconds()
      # TODO(cais): The default transcript result doesn't include the start
      # time stamp, so we currently pretend that each recognizer output phrase
      # is exactly 1 second.
      start_time_sec = end_time_sec - 1
      line = "%.3f\t%.3f\t%s\t%s" % (
          start_time_sec, end_time_sec, SPEECH_TRANSCRIPT_TIER_NAME, best_transcript)
      print(line)
      f.write(line + "\n")


if __name__ == "__main__":
  args = parse_args()
  audio_file_paths, total_duration_sec = get_consecutive_audio_file_paths(
      args.first_audio_path)
  print("Transcribing %d consecutive audio files (%f seconds):\n\t%s" % (
      len(audio_file_paths), total_duration_sec, "\n\t".join(audio_file_paths)))
  transcribe_audio_to_tsv(
      audio_file_paths,
      args.output_tsv_path,
      args.sample_rate,
      args.language_code)
