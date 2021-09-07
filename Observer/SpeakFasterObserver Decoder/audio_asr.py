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
import tempfile

from absl import logging
import numpy as np
import pydub
from google.cloud import speech_v1p1beta1 as speech
from google.cloud import storage

import file_naming
import tsv_data


def concatenate_audio_files(input_paths, output_path):
  """Concatenate audio files into one file.

  Args:
    input_paths: Paths to the input audio files.
    output_path: Path to the output file.

  Returns:
    Duration of the concatenation result, in seconds.
  """
  if not input_paths:
    raise ValueError("Empty input paths")
  pure_path = pathlib.PurePath(input_paths[0])
  audio_seg = pydub.AudioSegment.from_file(pure_path, pure_path.suffix[1:])
  for input_path in input_paths[1:]:
    pure_path = pathlib.PurePath(input_path)
    audio_seg += pydub.AudioSegment.from_file(pure_path, pure_path.suffix[1:])
  pure_path = pathlib.PurePath(output_path)
  output_format = pure_path.suffix[1:].lower()
  audio_seg.export(pure_path, output_format)
  if output_format != "wav":
    audio_seg.export(pure_path.with_suffix(".wav"), "wav")
  return len(audio_seg) / 1e3


def get_audio_file_duration_sec(file_path):
  """Get the duration of given audio file, in seconds."""
  pure_path = pathlib.PurePath(file_path)
  audio_seg = pydub.AudioSegment.from_file(pure_path, pure_path.suffix[1:])
  return audio_seg.duration_seconds


GCLOUD_SPEECH_STREAMING_LENGTH_LIMIT_SEC = 240


def get_consecutive_audio_file_paths(
    first_audio_path,
    tolerance_seconds=1.0,
    group_limit_sec=GCLOUD_SPEECH_STREAMING_LENGTH_LIMIT_SEC):
  """Get the paths to the consecutive audio files.

  It is assumed that the audio basename of the file path has the format:
      yyyymmddThhmmssf-{DataStream}.{Extension}.

  NOTE: It is assumed that there is no interleaving of more than one series
      of audio files.

  Returns:
    path_groups: A list of list of audio files. In each group, the
      total duration of the audios is less than group_limit_sec
    group_durations_sec: Total duration of audio in each element of
      path_groups.
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
  durations_sec = []
  total_duration_sec = 0.0
  audio_path = first_audio_path
  while candidate_paths:
    timestamp = file_naming.parse_timestamp_from_filename(audio_path)
    duration_sec = get_audio_file_duration_sec(audio_path)
    durations_sec.append(duration_sec)
    total_duration_sec += duration_sec
    next_timestamp = file_naming.parse_timestamp_from_filename(
        candidate_paths[0])
    time_diff = next_timestamp - timestamp
    if np.abs(time_diff.total_seconds() - duration_sec) < tolerance_seconds:
      output_paths.append(candidate_paths[0])
      audio_path = candidate_paths[0]
      del candidate_paths[0]
    else:
      audio_path = None
      break
  if audio_path:
    durations_sec.append(get_audio_file_duration_sec(audio_path))
  assert len(durations_sec) == len(output_paths)

  # Group paths by duration.
  path_groups = [[]]
  group_durations_sec = []
  current_group_duration_sec = 0
  for output_path, duration_sec in zip(output_paths, durations_sec):
    if duration_sec > group_limit_sec:
      raise ValueError(
          "Single audio file has a duration (%f s) that exceeds streaming "
          "length limit (%f s)" % (duration_sec, group_limit_sec))
    if current_group_duration_sec + duration_sec > group_limit_sec:
      path_groups.append([])
      group_durations_sec.append(current_group_duration_sec)
      current_group_duration_sec = 0
    path_groups[-1].append(output_path)
    current_group_duration_sec += duration_sec
  if current_group_duration_sec:
    group_durations_sec.append(current_group_duration_sec)

  return path_groups, group_durations_sec


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
      logging.warn("Failed to read audio data from file %s", file_path)


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
  parser.add_argument(
      "--speaker_count",
      type=int,
      default=0,
      help="Number of speakers configured for diarization. "
      "If the value is greater than 1, speaker diarization will be enabled.")
  parser.add_argument(
      "--use_async",
      action="store_true",
      help="Whether to use the async Speech-to-Text API")
  parser.add_argument(
      "--bucket_name",
      default="sf_test_audio_uploads",
      help="GCS bucket used for holding objects for async transcription.")
  return parser.parse_args()





def regroup_utterances(utterances, words):
  """Regroup utterances by using word-level timestamps and speaker indices.

  A boundary between the utterances in `utterances` are respected in the
    regrouped utterances, if and only if there is a gap between the two words
    at the two sides of the boundary.

  Args:
    utterances: A list of utterances as a list of strings.
    words: A list of words. Each element of the list must have the format
      (word, speaker_index, start_time, end_time).

  Returns:
    A list of regrouped utterances, each of which corresponds to the same speaker.
      Each element of the list has the format
      (regrouped_utterance, speaker_index, start_time, end_time).
  """
  all_words = []
  original_bounds = []
  for utterance in utterances:
    utterance_words = [w.strip() for w in utterance.split(" ") if w]
    all_words.extend(utterance_words)
    original_bounds.append(
        (len(utterance_words) + original_bounds[-1]) if original_bounds
        else len(utterance_words))
  regrouped_utterances = []
  current_utterance = []
  current_utterance_start = None
  current_utterance_end = None
  current_speaker_index = -1  # -1 is a sentinel for the beginning.
  word_index = 0
  for i, (word,
          word_speaker_index,
          word_start_time,
          word_end_time) in enumerate(words):
    start_new_utterance = False
    if current_speaker_index == -1:
      start_new_utterance = True
    elif current_speaker_index != word_speaker_index or (
        i in original_bounds and word_start_time > current_utterance_end):
      # There is a change in speaker, or a pause in the same speaker across an
      # transcript boundary.
      regrouped_utterances.append((
          " ".join(current_utterance),
          current_speaker_index,
          current_utterance_start,
          current_utterance_end))
      start_new_utterance = True
    if start_new_utterance:
      current_utterance = []
      current_speaker_index = word_speaker_index
      current_utterance_start = word_start_time
    if all_words[word_index] != word:
      raise ValueError(
          "Mismatch in words: %s != %s" % (word, all_words[word_index]))
      current_utterance.append(word)
    current_utterance_end = word_end_time
    current_utterance.append(all_words[word_index])
    word_index += 1

  if current_utterance:
    regrouped_utterances.append((
        " ".join(current_utterance),
        current_speaker_index,
        current_utterance_start,
        current_utterance_end))

  if word_index != len(all_words):
    raise ValueError(
        "Some words in the transcripts are missing from word-level diarization")

  return regrouped_utterances


def transcribe_audio_to_tsv(input_audio_paths,
                            output_tsv_path,
                            sample_rate,
                            language_code,
                            begin_sec=0.0):
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

  with open(output_tsv_path, "w" if not begin_sec else "a") as f:
    if not begin_sec:
      # Write the TSV header.
      f.write(tsv_data.HEADER + "\n")

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
      # TODO(cais): Should we use absolute timestamps such as epoch time, instead of
      # time relative to the beginning of the first file?
      start_time_sec = end_time_sec - 1
      line = "%.3f\t%.3f\t%s\t%s" % (
          start_time_sec + begin_sec,
          end_time_sec + begin_sec,
          tsv_data.SPEECH_TRANSCRIPT_TIER_NAME,
          best_transcript)
      print(line)
      f.write(line + "\n")


def transcribe_audio_to_tsv_with_diarization(input_audio_paths,
                                             output_tsv_path,
                                             sample_rate,
                                             language_code,
                                             speaker_count,
                                             begin_sec=0.0):
  """Transcribe speech in input audio files and write results to .tsv file.

  This method differs from transcribe_audio_to_tsv() in that it performs speaker
  diarization and uses the word-level speaker indices to regroup the transcripts.
  """
  client = speech.SpeechClient()
  enable_speaker_diarization = speaker_count > 0
  config = speech.RecognitionConfig(
      encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
      sample_rate_hertz=sample_rate,
      audio_channel_count=1,
      enable_separate_recognition_per_channel=False,
      language_code=language_code,
      enable_speaker_diarization=enable_speaker_diarization,
      diarization_speaker_count=speaker_count)
  streaming_config = speech.StreamingRecognitionConfig(
      config=config, interim_results=False)
  requests = audio_data_generator(input_audio_paths, config)
  responses = client.streaming_recognize(streaming_config, requests)

  with open(output_tsv_path, "w" if not begin_sec else "a") as f:
    if not begin_sec:
      # Write the TSV header.
      f.write(tsv_data.HEADER + "\n")
    utterances = []
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
            diarized_words = [(
                word.word, word.speaker_tag, word.start_time.total_seconds(),
                word.end_time.total_seconds()) for word in alt.words]
            result_end_time = result.result_end_time
      if not best_transcript:
        continue
      end_time_sec = result_end_time.total_seconds()
      utterances.append(best_transcript)

    regrouped_utterances = regroup_utterances(utterances, diarized_words)
    for (regrouped_utterance,
         speaker_index, start_time_sec, end_time_sec) in regrouped_utterances:
      line = "%.3f\t%.3f\t%s\t%s (Speaker #%d)" % (
          start_time_sec + begin_sec,
          end_time_sec + begin_sec,
          tsv_data.SPEECH_TRANSCRIPT_TIER_NAME,
          regrouped_utterance,
          speaker_index)
      print(line)
      f.write(line + "\n")


def async_transcribe(audio_file_paths,
                     bucket_name,
                     output_tsv_path,
                     sample_rate,
                     language_code,
                     speaker_count=0,
                     begin_sec=0.0):
  """Transcribe a given audio file using the async GCloud Speech-to-Text API.

  The async API has the advantage of being able to handler longer audio without
  state reset. Empirically, we've observed that the async calls lead to slightly
  better accuracy than streaming calls.

  Args:
    audio_file_paths: Paths to the audio files as a list of strings in the
      correct order.
    bucket_name: Name of GCS bucket used for holding objects temporarily.
    output_tsv_path: Path to the output TSV file.
    sample_rate: Audio sample rate.
    language_code: Language code for recognition.
    speaker_count: Number of speakers. If 0, speaker diarization will be
      disabled.
    begin_sec: Transcript begin timestamp in seconds.
  """
  tmp_audio_file = tempfile.mktemp(suffix=".flac")
  print("Temporary audio file: %s" % tmp_audio_file)
  concatenate_audio_files(audio_file_paths, tmp_audio_file)

  storage_client = storage.Client()
  bucket = storage_client.bucket(bucket_name)
  destination_blob_name = os.path.basename(tmp_audio_file)
  blob = bucket.blob(destination_blob_name)
  print("Uploading %s to GCS bucket %s" % (tmp_audio_file, bucket_name))
  blob.upload_from_filename(tmp_audio_file)
  gcs_uri = "gs://%s/%s" % (bucket_name, destination_blob_name)
  print("Uploaded to GCS URI: %s" % gcs_uri)

  client = speech.SpeechClient()
  audio = speech.RecognitionAudio(uri=gcs_uri)
  enable_speaker_diarization = speaker_count > 0
  config = speech.RecognitionConfig(
      encoding=speech.RecognitionConfig.AudioEncoding.FLAC,
      sample_rate_hertz=sample_rate,
      language_code=language_code,
      enable_speaker_diarization=enable_speaker_diarization,
      diarization_speaker_count=speaker_count)

  operation = client.long_running_recognize(config=config, audio=audio)
  print("Waiting for async ASR operation to complete...")
  response = operation.result(timeout=90)
  blob.delete()
  os.remove(tmp_audio_file)

  utterances = []
  for result in response.results:
    # The first alternative is the most likely one for this portion.
    alt = result.alternatives[0]
    utterances.append(alt.transcript)
    print(u"Transcript: {}".format(alt.transcript))
    diarized_words = [(
        word.word, word.speaker_tag, word.start_time.total_seconds(),
        word.end_time.total_seconds()) for word in alt.words]
    # print("Confidence: {}".format(result.alternatives[0].confidence))

  regrouped_utterances = regroup_utterances(utterances, diarized_words)
  with open(output_tsv_path, "w" if not begin_sec else "a") as f:
    if not begin_sec:
      # Write the TSV header.
      f.write(tsv_data.HEADER + "\n")
    for (regrouped_utterance,
        speaker_index, start_time_sec, end_time_sec) in regrouped_utterances:
      line = "%.3f\t%.3f\t%s\t%s (Speaker #%d)" % (
          start_time_sec + begin_sec,
          end_time_sec + begin_sec,
          tsv_data.SPEECH_TRANSCRIPT_TIER_NAME,
          regrouped_utterance,
          speaker_index)
      print(line)
      f.write(line + "\n")


if __name__ == "__main__":
  args = parse_args()
  path_groups, group_durations_sec = get_consecutive_audio_file_paths(
      args.first_audio_path)
  num_audio_files = sum(len(group) for group in path_groups)
  total_duration_sec = sum(group_durations_sec)
  print("Transcribing %d consecutive audio files (%f seconds):\n\t%s" % (
      num_audio_files,
      total_duration_sec,
      "\n\t".join([",".join(group) for group in path_groups])))
  cum_duration_sec = 0.0
  if args.use_async:
    audio_file_paths = []
    for path_group in path_groups:
      audio_file_paths.extend(path_group)
    async_transcribe(
        audio_file_paths,
        args.bucket_name,
        args.output_tsv_path,
        args.sample_rate,
        args.language_code,
        speaker_count=args.speaker_count,
        begin_sec=cum_duration_sec)
  else:
    for audio_file_paths, group_duration_sec in zip(
          path_groups, group_durations_sec):
      if args.speaker_count > 0:
        transcribe_audio_to_tsv_with_diarization(
            audio_file_paths,
            args.output_tsv_path,
            args.sample_rate,
            args.language_code,
            args.speaker_count,
            begin_sec=cum_duration_sec)
      else:
        transcribe_audio_to_tsv(
          audio_file_paths,
          args.output_tsv_path,
          args.sample_rate,
          args.language_code,
          begin_sec=cum_duration_sec)
      cum_duration_sec += group_duration_sec
