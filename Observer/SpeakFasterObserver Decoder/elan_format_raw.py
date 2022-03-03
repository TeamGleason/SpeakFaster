"""Format raw data for ELAN curation."""

import argparse
import glob
import os
import pathlib
import subprocess

import ffmpeg
import numpy as np
import pytz

import audio_asr
import file_naming
import keypresses_pb2
import process_keypresses
import tsv_data
import video


def format_raw_data(input_dir,
                    timezone,
                    speaker_count,
                    gcs_bucket_name,
                    dummy_video_frame_image_path=None,
                    skip_screenshots=False,
                    keypresses_only=False):
  """Processes a raw Observer data session.

  Args:
    input_dir: The path to the data directory of the session. At a minimum,
      it should contains: exactly one keypress protobuf file, a set of
      consecutive .flac audio recordings.
    timezone: Timezone in which the data was made (e.g., "US/Central",
      "US/Eastern").
    speaker_count: Number of speakers in the audio. Used for diarization.
    gcs_bucket_name: Name of the GCS bucket used for async speech-to-text.
    dummy_video_from_image_path: If not None or empty, will cause a dummy
      video file to be generated based looping the single frame of image.
      The duration of the video will be approximately equal to the total
      duration of the audio files. This must be provided if there are not
      screenshot image files in input_dir.
    skip_screenshots: Skip the processing of screenshots.
  """
  if not os.path.isdir(input_dir):
    raise ValueError("%s is not an existing directory" % input_dir)

  merged_tsv_path = os.path.join(input_dir, file_naming.MERGED_TSV_FILENAME)

  if keypresses_only:
    # Keypresses-only: The start timestamp will be from the first keypress.
    keypresses_data = process_keypresses.load_keypresses_from_directory(
        input_dir)
    if not keypresses_data.keyPresses:
      raise ValueError(
          "No keypress data is available in directory %s" % input_dir)
    first_timestamp = keypresses_data.keyPresses[0].Timestamp
    start_time_epoch = first_timestamp.seconds + first_timestamp.nanos / 1e9
    print("Determined start timestamp: %.3f" % start_time_epoch)
    keypresses_phrases_tsv_path = os.path.join(
        input_dir, "keypresses_phrases.tsv")
    process_keypresses.visualize_keypresses(
        keypresses_data, tsv_path=keypresses_phrases_tsv_path,
        start_time_epoch=start_time_epoch)
  else:
    # Not keypresses-only: The start timestamp will be extracted from the first
    # audio file.
    (first_audio_path,
     concatenated_audio_path,
     start_time_epoch,
     audio_duration_s) = read_and_concatenate_audio_files(input_dir, timezone)

  keypresses_paths = glob.glob(os.path.join(input_dir, "*-Keypresses.protobuf"))
  if not keypresses_paths:
    raise ValueError(
        "Cannot find at least one Keypresses protobuf file in %s" % input_dir)
  keypresses_tsv_path = os.path.join(input_dir, "keypresses.tsv")
  first_keypress_time_sec = format_keypresses(
      keypresses_paths, start_time_epoch, keypresses_tsv_path)

  if keypresses_only:
    print("Merging TSV files (keypresses-only)...")
    tsv_data.merge_tsv_files(
        [keypresses_tsv_path, keypresses_phrases_tsv_path], merged_tsv_path)
    print("Merged TSV file (keypresses-only) is at: %s" % merged_tsv_path)
    return

  if not skip_screenshots:
    # If screenshot image files are available, stitch them into a single video
    # file.
    screenshot_paths = sorted(
        glob.glob(os.path.join(input_dir, "*-Screenshot.jpg")))
    if screenshot_paths:
      screenshots_video_path = os.path.join(
          input_dir, file_naming.SCREENSHOTS_MP4_FILENAME)
      print("Writing screenshots video...")
      video.stitch_images_into_mp4(
          screenshot_paths,
          start_time_epoch,
          timezone,
          screenshots_video_path)
      print("Saved screenshots video to %s\n" % screenshots_video_path)
    elif dummy_video_frame_image_path:
      dummy_video_path = os.path.join(
          input_dir, file_naming.SCREENSHOTS_MP4_FILENAME)
      print("Generating dummy video (duration: %.3f s) based on %s..." %
          (audio_duration_s, dummy_video_frame_image_path))
      video.make_dummy_video_file(
          audio_duration_s, dummy_video_frame_image_path, dummy_video_path)
      print("Dummy video is generated at: %s" % dummy_video_path)
    else:
      raise ValueError(
          "No screenshot image files are found. "
          "You must provide dummy_video_frame_image_path")

  # Create a TSV file for TextEditorNavigation tier.
  text_editor_navigation_tsv_path = os.path.join(
      input_dir, "text_editor_navigation.tsv")
  create_text_editor_nagivation_tier(
      text_editor_navigation_tsv_path, first_keypress_time_sec)

  # Extract audio events.
  audio_events_tsv_path = os.path.join(input_dir, "audio_events.tsv")
  extract_audio_events(concatenated_audio_path, audio_events_tsv_path)

  # Perform ASR on audio.
  asr_tsv_path = os.path.join(input_dir, file_naming.ASR_TSV_FILENAME)
  run_asr(first_audio_path, asr_tsv_path, speaker_count, gcs_bucket_name)

  # Merge the files.
  print("Merging TSV files...")
  tsv_data.merge_tsv_files(
      [keypresses_tsv_path, text_editor_navigation_tsv_path,
       audio_events_tsv_path, asr_tsv_path], merged_tsv_path)
  print("Concatenated audio file is at: %s" % concatenated_audio_path)
  if not skip_screenshots and screenshot_paths:
    print("Screenshot video file is at: %s" % screenshots_video_path)
  print("Merged TSV file is at: %s" % merged_tsv_path)


def read_and_concatenate_audio_files(input_dir, timezone):
  if not glob.glob(os.path.join(input_dir, "*-MicWaveIn.flac")):
    raise ValueError(
        "Cannot find any *-MicWaveIn.flac audio files in directory %s. "
        "Make sure you are pointing to a valid data directory." % input_dir)
  all_audio_paths = sorted(
      glob.glob(os.path.join(input_dir, "*-MicWaveIn.flac")))
  print("Found %s audio file: %s" % (len(all_audio_paths), all_audio_paths))
  first_audio_path = all_audio_paths[0]
  audio_start_time, audio_start_time_epoch = get_epoch_time_from_file_path(
      first_audio_path, timezone)
  print("Audio data start time: %s (%s)" %
        (audio_start_time, audio_start_time_epoch))
  concatenated_audio_path = os.path.join(
      input_dir, file_naming.CONCATENATED_AUDIO_FILENAME)
  audio_duration_s = audio_asr.concatenate_audio_files(
      all_audio_paths, concatenated_audio_path, fill_gaps=True)
  return (first_audio_path,
          concatenated_audio_path, audio_start_time_epoch, audio_duration_s)


def get_epoch_time_from_file_path(file_path, timezone):
  (audio_start_time,
   is_utc) = file_naming.parse_timestamp_from_filename(file_path)
  if is_utc:
    tz = pytz.timezone("UTC")
  else:
    tz = pytz.timezone(timezone)
  dt = tz.localize(audio_start_time)
  return dt, dt.timestamp()


DUMMY_KEYPRESS_DURATION_SEC = 0.1


def format_keypresses(keypresses_paths,
                      start_epoch_time,
                      output_tsv_path):
  """Convert the keypress data from the protobuf format to TSV format.

  Args:
    keypresses_paths: Paths to the protobuf files that contains the raw
      keypresses data.
    start_epoch_time: Starting time of the data collection session,
      in seconds since the epoch.
    output_tsv_path: Path to the output TSV file.

  Return:
    Starting time of the first keypress, relative to start_epoch_time, in
      seconds.

  Raises:
    ValueError, if there are no keypresses.
  """
  first_keypress_time_sec = None
  with open(output_tsv_path, "w") as f:
    f.write(tsv_data.HEADER + "\n")
    for keypresses_path in keypresses_paths:
      keypresses = keypresses_pb2.KeyPresses()
      with open(keypresses_path, "rb") as file:
        keypresses.ParseFromString(file.read())
      num_keypresses = len(keypresses.keyPresses)
      first_keypress_epoch_ms = (
          keypresses.keyPresses[0].Timestamp.ToMilliseconds())
      print("First keypress epoch time in file %s: %.3f" %
            (keypresses_path, first_keypress_epoch_ms / 1e3))
      for keypress in keypresses.keyPresses:
        relative_time = (keypress.Timestamp.ToMilliseconds() / 1e3
                         - start_epoch_time)
        if first_keypress_time_sec is None:
          first_keypress_time_sec = relative_time
        f.write("%.3f\t%.3f\t%s\t%s\n" % (
            relative_time, relative_time + DUMMY_KEYPRESS_DURATION_SEC,
            tsv_data.KEYPRESS_TIER, keypress.KeyPress))
  print("Saved data for %d keypresses to %s" % (
      len(keypresses.keyPresses), output_tsv_path))
  if first_keypress_epoch_ms is None:
    raise ValueError("Found no keypress data at paths: %s" % keypresses_paths)
  return first_keypress_time_sec


def create_text_editor_nagivation_tier(tsv_path, first_keypress_time_sec):
  """Create a TSV file with the TextEditorNavigation tier and only one event."""
  with open(tsv_path, "w") as f:
    f.write(tsv_data.HEADER + "\n")
    f.write(tsv_data.DELIMITER.join(
        ("%.3f" % first_keypress_time_sec,
         "%.3f" % first_keypress_time_sec,
         tsv_data.TEXT_EDITOR_NAVIGATION_TIER,
         "FirstKeyStroke")))


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
            speaker_count,
            gcs_bucket_name):
  subprocess.check_call([
      "python",
      os.path.join(os.path.dirname(__file__), "audio_asr.py"),
      # Async mode gives slightly higher accuracy compared to streaming mode.
      "--use_async",
      "--fill_gaps",
      "--speaker_count=%d" % speaker_count,
      "--bucket_name=%s" % gcs_bucket_name,
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
  parser.add_argument(
      "--skip_screenshots",
      action="store_true",
      help="Skip the processing of screenshots.")
  parser.add_argument(
      "--keypresses_only",
      action="store_true",
      help="Process only the keystrokes. Skip audio data and screenshots "
      "(if any).")
  parser.add_argument(
      "--gcs_bucket_name",
      type=str,
      default="",
      help="GCS bucket used for holding objects for async ASR transcription."
      "If not provided (i.e., empty), a temporary GCS bucket will be created "
      "and deleted afterwards.")
  parser.add_argument(
      "--dummy_video_frame_image_path",
      type=str,
      default=None,
      help="Path to the frame of image used to make dummy videos.")
  return parser.parse_args()


def main():
  args = parse_args()
  format_raw_data(
      args.input_dir,
      args.timezone,
      args.speaker_count,
      args.gcs_bucket_name,
      dummy_video_frame_image_path=args.dummy_video_frame_image_path,
      skip_screenshots=args.skip_screenshots,
      keypresses_only=args.keypresses_only)


if __name__ == "__main__":
  main()
