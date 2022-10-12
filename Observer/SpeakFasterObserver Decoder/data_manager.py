"""SpeakFaster data manager GUI.

Command line exapmle:

```sh
python data_manager.py
```

Or, to use a non-default bucket name:

```sh
python data_manager.py --s3_bucket_name=my-bucket-name
```
"""
import argparse
import datetime
import glob
import io
import json
import os
import pathlib
import pytz
import shutil
import subprocess
import sys
import tempfile
import time

import boto3
import numpy as np
import PySimpleGUI as sg

import elan_process_curated
import file_naming
import freeform_text
import gcloud_utils
import metadata_pb2
import process_keypresses
import transcript_lib

DEFAULT_PROFILE_NAME = "spo"
DEFAULT_S3_BUCKET_NAME = "speak-faster"
OBSERVER_DATA_PREFIX = "observer_data"
DATA_SCHEMA_NAME = "SPO-2111"
POSSIBLE_DATA_ROOT_DIRS = (
    os.path.join("/", "SpeakFasterObs", "data"),
    os.path.join(pathlib.Path.home(), "SpeakFasterObs", "data"),
    os.path.join(pathlib.Path.home(), "sf_observer_data"),
)
DEFAULT_TIMEZONE_NAME = "US/Central"

# Time-of-the-day hour ranges. Local time.
HOUR_RANGES = ((0, 3), (3, 6), (6, 9), (9, 12), (12, 15), (15, 18),
               (18, 21), (21, 24))
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

DEFAULT_GCS_BUCKET_NAME = "speak-faster-curated-data-shared"
GCS_SUMMARY_PREFIX = "summary"
GCS_CURATED_FREEFORM_UPLOAD_PREFIX = "curated_freeform"
GCS_POSTPROCESSED_UPLOAD_PREFIX = "postprocessed"
CLAIM_JSON_FILENAME = "claim.json"

STATE_NOT_DOWNLOADED = "NOT_DOWNLOADED"
STATE_DOWNLOADED = "DOWNLOADED"
STATE_PREPROCESSED = "PREPROCESSED"
STATE_CURATED = "CURATED"
STATE_POSTPROCESSED = "POSTPROCESSED"

# Remote states only:
STATE_NOT_PREPROCESSED = "NOT_PREPROCESSED"

# GCS states only:
STATE_NOT_UPLOADED = "NOT_UPLOADED"
STATE_UPLOADED = "UPLOADED"

# The set of files to upload to shared GCS folder. Must only include
# the post-processed, curated results.
POSTPROCESSING_FILES_TO_UPLOAD = (
    file_naming.CURATED_PROCESSED_JSON_FILENAME,
    file_naming.CURATED_PROCESSED_TSV_FILENAME,
    file_naming.CURATED_PROCESSED_SPEECH_ONLY_TSV_FILENAME)

def get_hour_index(hour):
  for i, (hour_min, hour_max) in enumerate(HOUR_RANGES):
    if hour >= hour_min and hour < hour_max:
      return i
  return len(HOUR_RANGES) - 1


def _print_time_summary_table(table):
  print("=== Distribution of session start times ===")
  print("\t" + "\t".join(["%d-%d" %
      (hour_min, hour_max) for hour_min, hour_max in HOUR_RANGES]))
  for i, weekday in enumerate(WEEKDAYS):
    day_line = weekday + "\t" + "\t".join(
        ["%d" % n for n in table[i, :].tolist()])
    day_line += "\t%d" % np.sum(table[i, :])
    print(day_line)
  print("-------------------------------------------")
  print("   \t" +
        "\t".join(["%d" % n for n in np.sum(table, axis=0).tolist()]))


def parse_args():
  parser = argparse.ArgumentParser("Data Manager")
  parser.add_argument(
      "--aws_profile_name",
      type=str,
      default=DEFAULT_PROFILE_NAME,
      help="AWS profile name")
  parser.add_argument(
      "--s3_bucket_name",
      type=str,
      default=DEFAULT_S3_BUCKET_NAME)
  parser.add_argument(
      "--gcs_bucket_name",
      type=str,
      default=DEFAULT_GCS_BUCKET_NAME,
      help="AWS profile name")
  return parser.parse_args()


def infer_local_data_root():
  for root_dir in POSSIBLE_DATA_ROOT_DIRS:
    if os.path.isdir(root_dir):
      return root_dir
  raise ValueError(
      "Cannot find a root directory for data among these possible paths: %s. "
      "Create one first." % (POSSIBLE_DATA_ROOT_DIRS,))


def _get_timezone(readable_timezone_name):
  if ("Eastern Time (US & Canada)" in readable_timezone_name or
      readable_timezone_name == "US/Eastern"):
    return "US/Eastern"
  elif ("Central Time (US & Canada)" in readable_timezone_name or
        readable_timezone_name == "US/Central"):
    return "US/Central"
  elif ("Mountain Time (US & Canada)" in readable_timezone_name or
        readable_timezone_name == "US/Mountain"):
    return "US/Mountain"
  elif ("Pacific Time (US & Canada)" in readable_timezone_name or
        readable_timezone_name == "US/Pacific"):
    return "US/Pacific"
  else:
    raise ValueError("Unimplemented time zone: %s" % readable_timezone_name)


def find_speaker_id_config_json():
  """Try to find the speaker ID config JSON file among known possibilities."""
  possible_paths = [
      os.path.join("/", "SpeakFasterObs", "Creds_NoShare",
          file_naming.SPEAKER_ID_CONFIG_JSON_FILENAME),
      os.path.join("/", "SpeakFasterObs", "Creds_noShare",
          file_naming.SPEAKER_ID_CONFIG_JSON_FILENAME),
      os.path.join(pathlib.Path.home(), "SpeakFasterObs", "Creds_NoShare",
          file_naming.SPEAKER_ID_CONFIG_JSON_FILENAME),
      os.path.join(pathlib.Path.home(), "SpeakFasterObs", "Creds_noShare",
          file_naming.SPEAKER_ID_CONFIG_JSON_FILENAME),
      os.path.join(os.path.dirname(__file__), "testdata",
          file_naming.SPEAKER_ID_CONFIG_JSON_FILENAME)]
  for possible_path in possible_paths:
    if os.path.isfile(possible_path):
      print("Located speaker ID config JSON file at %s" % possible_path)
      return possible_path
  raise ValueError(
      "Cannot find speaker ID config JSON file among these possibilities: %s. "
      "Make sure you put the file at one of those paths." %
      possible_paths)


class DataManager(object):

  def __init__(self,
               aws_profile_name,
               s3_bucket_name,
               gcs_bucket_name,
               local_data_root):
    self._s3_session = boto3.Session(profile_name=aws_profile_name)
    self._s3_client = self._s3_session.client("s3")
    self._aws_profile_name = aws_profile_name
    self._s3_bucket_name = s3_bucket_name
    self._gcs_bucket_name = gcs_bucket_name
    self._local_data_root = local_data_root
    self._speaker_id_config_json_path = find_speaker_id_config_json()
    self._session_keypresses_per_second = None
    self._session_gcs_status = None
    self._manual_timezone_name = None
    self._check_aws_cli()
    self._curator_username = os.getlogin()
    if self._curator_username:
      print("Determined username: %s" % self._curator_username)
    else:
      raise ValueError("Unable to determine username of curator")
    self._session_prefix_to_claiming_username = {}

  def _check_aws_cli(self):
    try:
      self._run_command_line(["aws", "--version"])
    except subprocess.CalledProcessError:
      raise ValueError(
          "It appears that you don't have aws cli installed and on the path. "
          "Please install it and make sure it is on the path.")

  @property
  def gcs_bucket_name(self):
    return self._gcs_bucket_name

  def get_session_container_prefixes(self):
    """Find the prefixes that hold the session folders as children.

    Returns:
      A list of prefixes, each of which ends with '/'. The bucket name
      itself is not included.
    """
    prefixes = []
    current_prefixes = [OBSERVER_DATA_PREFIX + "/" + DATA_SCHEMA_NAME + "/"]
    for i in range(3):
      new_prefixes = []
      for current_prefix in current_prefixes:
        paginator = self._s3_client.get_paginator("list_objects")
        results = list(paginator.paginate(
            Bucket=self._s3_bucket_name,
            Delimiter="/",
            Prefix=current_prefix))
        if not results:
          break
        for result in results:
          if "CommonPrefixes" in result:
            for common_prefix in result["CommonPrefixes"]:
              if common_prefix["Prefix"].endswith("//"):
                continue
              new_prefixes.append(common_prefix["Prefix"])
      current_prefixes = new_prefixes
    return current_prefixes

  def get_session_prefixes(self, session_container_prefix):
    """Get the prefixes that correspond to the sessions."""
    paginator = self._s3_client.get_paginator("list_objects")
    results = list(paginator.paginate(
        Bucket=self._s3_bucket_name,
        Delimiter="/",
        Prefix=session_container_prefix))
    session_prefixes = []
    for result in results:
      if "CommonPrefixes" not in result:
        continue
      for common_prefix in result["CommonPrefixes"]:
        prefix = common_prefix["Prefix"][len(session_container_prefix):]
        if not prefix.startswith("session-"):
          continue
        session_prefixes.append(prefix)
    return session_prefixes

  def _download_to_temp_file(self, object_key):
    tmp_filepath = tempfile.mktemp()
    self._s3_client.download_file(self._s3_bucket_name, object_key, tmp_filepath)
    return tmp_filepath

  def _list_session_objects(self, session_prefix):
    """List all objects under a session prefix, taking care of pagination."""
    paginator = self._s3_client.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=self._s3_bucket_name,
                               Prefix=session_prefix)
    objects = []
    for page in pages:
      objects.extend(page["Contents"])
    return objects

  def get_session_details(self, session_prefix):
    """Get the details about a session."""
    utc_timezone = pytz.timezone("UTC")
    objects = self._list_session_objects(session_prefix)
    # This is determined by whether the SessionEnd.bin file exists.
    is_session_complete = False
    object_keys = []
    time_zone = None
    first_timestamp = -1
    last_timestamp = 0
    start_time = None
    duration_s = None
    num_keypresses = 0
    num_audio_files = 0
    num_screenshots = 0
    for obj in objects:
      obj_key = obj["Key"]
      object_keys.append(obj_key[len(session_prefix):])
      if os.path.basename(obj_key).endswith((".tsv", ".wav", ".mp4", ".json")):
        continue
      data_stream_name = file_naming.get_data_stream_name(obj_key)
      if data_stream_name == "MicWaveIn":
        num_audio_files += 1
      elif data_stream_name == "Screenshot":
        num_screenshots += 1
      timestamp, is_utc = file_naming.parse_timestamp_from_filename(
          obj_key)
      if not is_utc:
        raise NotImplemented("Support for non-UTC timezone is not implemented")
      timestamp = timestamp.timestamp()
      if first_timestamp < 0 or timestamp < first_timestamp:
        first_timestamp = timestamp
      if timestamp > last_timestamp:
        last_timestamp = timestamp
      if obj_key.endswith("-SessionEnd.bin"):
        tmp_filepath = self._download_to_temp_file(obj_key)
        session_metadata = metadata_pb2.SessionMetadata()
        with open(tmp_filepath, "rb") as f:
          session_metadata.ParseFromString(f.read())
        time_zone = session_metadata.timezone
        is_session_complete = True
        os.remove(tmp_filepath)
      elif obj_key.endswith("-Keypresses.protobuf"):
        tmp_filepath = self._download_to_temp_file(obj_key)
        keypresses = process_keypresses.load_keypresses_from_protobuf_file(tmp_filepath)
        num_keypresses += len(keypresses.keyPresses)
        os.remove(tmp_filepath)
    if not time_zone:
      # Time zone is not found. Ask for it with a PySimpleGUI get-text dialog.
      if not self._manual_timezone_name:
        self._manual_timezone_name = self._get_manual_timezone()
        if not self._manual_timezone_name:
          self._manual_timezone_name = DEFAULT_TIMEZONE_NAME
      tz = pytz.timezone(self._manual_timezone_name)
    else:
      tz = pytz.timezone(_get_timezone(time_zone))
    start_time = utc_timezone.localize(
        datetime.datetime.fromtimestamp(first_timestamp)).astimezone(tz)
    duration_s = last_timestamp - first_timestamp
    return (is_session_complete,
            str(tz), start_time, duration_s, num_keypresses, num_audio_files,
            num_screenshots, object_keys)

  def _get_manual_timezone(self):
    manual_timezone_name = sg.popup_get_text(
        "Time zone is not available in the session's data files. "
        "Please enter (will use default %s if empty): " %
        DEFAULT_TIMEZONE_NAME)
    return manual_timezone_name

  def get_sessions_stats(self,
                         container_prefix,
                         session_prefixes):
    """Get the summary statistics of the given sessions."""
    num_sessions = 0
    num_complete_sessions = 0
    total_duration_s = 0
    total_keypresses = 0
    total_audio_files = 0
    total_screenshots = 0
    total_objects = 0
    session_keypresses_per_second = dict()
    session_gcs_status = dict()
    start_time_table = np.zeros([7, len(HOUR_RANGES)])

    for session_prefix in session_prefixes:
      (is_session_complete, _,
       start_time, duration_s, num_keypresses, num_audio_files,
       num_screenshots, object_keys) = self.get_session_details(
          container_prefix + session_prefix)
      start_time_table[
          start_time.weekday(), get_hour_index(start_time.hour)] += 1
      num_sessions += 1
      if is_session_complete:
        num_complete_sessions += 1
      total_duration_s += duration_s
      total_keypresses += num_keypresses
      total_audio_files += num_audio_files
      total_screenshots += num_screenshots
      total_objects += len(object_keys)
      session_keypresses_per_second[
          get_base_session_prefix(session_prefix)] = (
              None if duration_s == 0 else num_keypresses / duration_s)
      session_gcs_status[get_base_session_prefix(session_prefix)] = (
          STATE_UPLOADED if self.is_session_uploaded_to_gcs(
              container_prefix + session_prefix)
          else STATE_NOT_UPLOADED)
    self._session_keypresses_per_second = session_keypresses_per_second
    self._session_gcs_status = session_gcs_status
    _print_time_summary_table(start_time_table)
    return (num_sessions, num_complete_sessions, total_duration_s,
            total_keypresses, total_audio_files, total_screenshots,
            total_objects, session_keypresses_per_second, start_time_table)

  def get_session_basename(self, session_prefix):
    path_items = session_prefix.split("/")
    return path_items[-1] if path_items[-1] else path_items[-2]

  def get_local_session_dir(self, session_prefix):
    session_basename = self.get_session_basename(session_prefix)
    return os.path.join(self._local_data_root, session_basename)

  def _nonempty_file_exists(self, dir_path, file_name):
    file_path = os.path.join(dir_path, file_name)
    if not os.path.isfile(file_path):
      return False
    return os.path.getsize(file_path) > 0

  def sync_to_local(self, session_prefix):
    local_dest_dir = self.get_local_session_dir(session_prefix)
    if not os.path.isdir(local_dest_dir):
      os.makedirs(local_dest_dir)
      print("Created session directory: %s" % local_dest_dir)
    print("Sync'ing session to local: %s --> %s" %
          (session_prefix, local_dest_dir))
    command_args = [
        "aws", "s3", "sync", "--profile=%s" % self._aws_profile_name,
        "s3://" + self._s3_bucket_name + "/" + session_prefix, local_dest_dir]
    self._run_command_line(command_args)
    print("Download complete.")
    return "Download complete.", "session"

  def get_local_session_folder_status(self, session_prefix):
    local_dest_dir = self.get_local_session_dir(session_prefix)
    if not os.path.isdir(local_dest_dir):
      return STATE_NOT_DOWNLOADED
    else:
      if (self._nonempty_file_exists(
              local_dest_dir, file_naming.CURATED_PROCESSED_JSON_FILENAME) and
          self._nonempty_file_exists(
              local_dest_dir, file_naming.CURATED_PROCESSED_TSV_FILENAME) and
          self._nonempty_file_exists(
              local_dest_dir, file_naming.CURATED_PROCESSED_SPEECH_ONLY_TSV_FILENAME)):
        return STATE_POSTPROCESSED
      elif self._nonempty_file_exists(
          local_dest_dir, file_naming.CURATED_TSV_FILENAME):
        return STATE_CURATED
      elif (self._nonempty_file_exists(
              local_dest_dir, file_naming.MERGED_TSV_FILENAME) and
          self._nonempty_file_exists(
              local_dest_dir, file_naming.CONCATENATED_AUDIO_FILENAME) and
          self._nonempty_file_exists(
              local_dest_dir, file_naming.SCREENSHOTS_MP4_FILENAME)):
        return STATE_PREPROCESSED
      elif glob.glob(os.path.join(local_dest_dir, "*-SessionEnd.bin")):
        return STATE_DOWNLOADED
      else:
        return STATE_NOT_DOWNLOADED

  def get_session_keypresses_per_second(self, session_prefix):
    session_prefix = get_base_session_prefix(session_prefix)
    if self._session_keypresses_per_second is not None:
      return self._session_keypresses_per_second.get(session_prefix, None)

  def get_session_gcs_status(self, session_prefix):
    session_prefix = get_base_session_prefix(session_prefix)
    if self._session_gcs_status is not None:
      return self._session_gcs_status.get(session_prefix, None)

  def get_session_status_string(self,
                                session_prefix,
                                remote_status,
                                local_status,
                                claiming_username=None):
    keypresses_per_second = self.get_session_keypresses_per_second(
        session_prefix)
    session_prefix = get_base_session_prefix(session_prefix)
    kps_string = ("[? kps]" if keypresses_per_second is None else
                  ("[%.2f kps]" % keypresses_per_second))
    gcs_string = ""
    if remote_status == STATE_POSTPROCESSED:
      session_gcs_status = self.get_session_gcs_status(session_prefix)
      gcs_string = ("" if session_gcs_status is None else
                    ("[GCS: %s]" % session_gcs_status))
    status_string = "%s %s (Remote: %s) (Local: %s)" % (
        kps_string, session_prefix, remote_status, local_status)
    if claiming_username:
      status_string += " (Claimed: %s)" % claiming_username
    if gcs_string:
      status_string += " " + gcs_string
    return status_string

  def _remote_object_exists(self, session_prefix, filename):
    merged_key = session_prefix + filename
    response = self._s3_client.list_objects_v2(
        Bucket=self._s3_bucket_name, Prefix=merged_key)
    return "KeyCount" in response and response["KeyCount"] > 0

  def update_remote_session_objects_status(self, session_container_prefix):
    """Update the status of key remote objects."""
    paginator = self._s3_client.get_paginator("list_objects_v2")
    pages = paginator.paginate(
        Bucket=self._s3_bucket_name, Prefix=session_container_prefix)
    query_string = (
        "Contents[?ends_with(Key, `/%s`) || ends_with(Key, `/%s`)][]" %
        (file_naming.MERGED_TSV_FILENAME,
         file_naming.CURATED_PROCESSED_TSV_FILENAME))
    objects = pages.search(query_string)
    self._sessions_with_merged_tsv = []
    self._sessions_with_curated_processed_tsv = []
    for obj in objects:
      obj_key = obj["Key"]
      session = obj_key[:obj_key.rindex("/") + 1]
      if obj_key.endswith(file_naming.MERGED_TSV_FILENAME):
        self._sessions_with_merged_tsv.append(session)
      elif obj_key.endswith(file_naming.CURATED_PROCESSED_TSV_FILENAME):
        self._sessions_with_curated_processed_tsv.append(session)

  def get_remote_session_folder_status(self, session_prefix, use_cached=False):
    """Get remote session folder status.

    Args:
      session_prefix: Session preifx. This should include the container prefix.
      use_cached: Whether to use cached results.

    Returns:
      The status string.
    """
    if use_cached:
      if session_prefix in self._sessions_with_curated_processed_tsv:
        return STATE_POSTPROCESSED
      elif session_prefix in self._sessions_with_merged_tsv:
        return STATE_PREPROCESSED
      else:
        return STATE_NOT_PREPROCESSED
    else:
      if self._remote_object_exists(
         session_prefix, file_naming.CURATED_PROCESSED_TSV_FILENAME):
        return STATE_POSTPROCESSED
      elif self._remote_object_exists(
        session_prefix, file_naming.MERGED_TSV_FILENAME):
        return STATE_PREPROCESSED
      else:
        return STATE_NOT_PREPROCESSED

  def get_remote_session_claim_username(self, session_prefix):
    f = io.BytesIO()
    if self._remote_object_exists(session_prefix, CLAIM_JSON_FILENAME):
      self._s3_client.download_fileobj(
          self._s3_bucket_name, session_prefix + CLAIM_JSON_FILENAME, f)
      json_obj = json.loads(f.getvalue())
      return json_obj.get("username", None)
    else:
      return None

  def claim_session(self, session_prefix, unclaim=False):
    """Upload a file to the session prefix in S3 to claim this session."""
    existing_claim = self.get_remote_session_claim_username(session_prefix)
    if existing_claim:
      if existing_claim != self._curator_username:
        sg.Popup(
          "The session %s is already claimed by somenoe else: %s" %
          (session_prefix, existing_claim), modal=True)
      if not unclaim:
        return
    remote_json_path = self._get_remote_claim_json_path(session_prefix)
    tmp_json_path = tempfile.mktemp(suffix=".json")
    with open(tmp_json_path, "w") as f:
      json.dump({
          "username": None if unclaim else self._curator_username,
          "timestamp": datetime.datetime.utcnow().strftime("%Y%m%dT%H%M%S.%fZ"),
      }, f)
    self._s3_client.upload_file(
        tmp_json_path, self._s3_bucket_name, remote_json_path)
    os.remove(tmp_json_path)

  def _get_remote_claim_json_path(self, session_prefix):
    remote_json_path = session_prefix
    if not remote_json_path.endswith("/"):
      remote_json_path += "/"
    remote_json_path += CLAIM_JSON_FILENAME
    return remote_json_path

  def is_session_uploaded_to_gcs(self, session_prefix):
    """Check if the postprocessing results of session has been uploaded to GCS."""
    destination_blob_prefix = "/".join(
        [GCS_POSTPROCESSED_UPLOAD_PREFIX] +
        [item for item in session_prefix.split("/") if item])
    return gcloud_utils.remote_objects_exist(
        self.gcs_bucket_name, destination_blob_prefix,
        POSTPROCESSING_FILES_TO_UPLOAD)

  def preprocess_session(self, session_prefix):
    to_run_preproc = True
    if self.get_local_session_folder_status(session_prefix) in (
        STATE_PREPROCESSED, STATE_CURATED, STATE_POSTPROCESSED):
      answer = sg.popup_yes_no(
          "Session %s has already been preprocessed locally. "
          "Do you want to run preprocessing again?" % session_prefix)
      to_run_preproc = answer == "Yes"
    if not to_run_preproc:
      return "Preprocessing was not run.", False

    local_dest_dir = self.get_local_session_dir(session_prefix)
    (_, readable_timezone_name,
     _, _, _, _, _, _) = self.get_session_details(session_prefix)
    timezone = _get_timezone(readable_timezone_name)
    command_args = ["python", "elan_format_raw.py", local_dest_dir, timezone]
    self._run_command_line(command_args)
    message = "Preprocessing complete."
    print(message)
    return message, "session"

  def upload_sesssion_preproc_results(self, session_prefix):
    if self.get_local_session_folder_status(session_prefix) not in  (
        STATE_PREPROCESSED, STATE_CURATED, STATE_POSTPROCESSED):
      sg.Popup(
          "Cannot upload the preprocessing results of session %s, "
          "because no preprocessing results are found" % session_prefix,
          modal=True)
      return "Not uploading preprocessing results", False
    to_upload = True
    if self.get_remote_session_folder_status(session_prefix) != STATE_NOT_PREPROCESSED:
      answer = sg.popup_yes_no(
          "Session %s already contains preprocessing results remotely. "
          "Do you want to upload preprocessing results again?" % session_prefix)
      to_upload = answer == "Yes"
    if not to_upload:
      return "Uploading of preprocessing results canceled", False

    local_dest_dir = self.get_local_session_dir(session_prefix)
    command_args = [
        "aws", "s3", "sync", "--profile=%s" % self._aws_profile_name,
        local_dest_dir, "s3://" + self._s3_bucket_name + "/" + session_prefix,
        "--exclude=*", "--include=*.tsv",
        "--include=%s" % file_naming.CONCATENATED_AUDIO_FILENAME,
        "--include=%s" % file_naming.SCREENSHOTS_MP4_FILENAME]
    self._run_command_line(command_args)
    print("Done uploading the preprocessing results for session %s" %
          session_prefix)
    return "Uploading of preprocessing results complete", "session"

  def postprocess_curation(self, session_prefix):
    local_dest_dir = self.get_local_session_dir(session_prefix)
    local_status = self.get_local_session_folder_status(session_prefix)
    if local_status not in (STATE_CURATED, STATE_POSTPROCESSED):
      sg.Popup(
          "Cannot postprocess the curation results of session %s, "
          "because the local directory for the session doesn't contain "
          "the expected file from ELAN: %s" %
          (session_prefix, file_naming.CURATED_TSV_FILENAME),
          modal=True)
      return ("Not postprocessing curation results: Cannot find %s" %
              file_naming.CURATED_TSV_FILENAME), False
    to_postprocess = True
    if local_status == STATE_POSTPROCESSED:
      answer = sg.popup_yes_no(
          "Session is %s already postprocessed successfully. "
          "Do you want to do postprocessing again?" % session_prefix)
      to_postprocess = answer == "Yes"
    if not to_postprocess:
      return "Not performing postprocessing", False

    local_dest_dir = self.get_local_session_dir(session_prefix)
    try:
      misspelled_words = elan_process_curated.postprocess_curated(
          local_dest_dir, self._speaker_id_config_json_path)
      if misspelled_words:
        answer = sg.popup_yes_no(
            "Found misspelled words: " +
            ", ".join(("\"%s\"" % w) for w in misspelled_words) +
            "\n\nDo you want to ignore them?"
            "\n\nClick Yes to ignore them. Click No to go back and fix them.")
        if answer != "Yes":
          raise ValueError(
              "There are misspelled word(s) that you decided not to ignore. "
              "Please fix them in ELAN or curated.tsv.")

      message = "Postprocessing succeeded!"
      print(message)
      sg.Popup(message, modal=True)
      return message, "session"
    except Exception as e:
      failure_message = "Postprocessing failed with error message:\n\n%s" % e
      print(failure_message)
      sg.Popup(failure_message, title="Postprocessing failed", modal=True)
      return "Postprocessing failed", False

  def upload_session_postproc_results(self, session_prefix, to_gcs=False):
    """Upload post processing results to S3 or GCS."""
    if self.get_local_session_folder_status(session_prefix) != STATE_POSTPROCESSED:
      sg.Popup(
          "Cannot upload the postprocessing results of session %s, "
          "because no postprocessing results are found" % session_prefix,
          modal=True)
      return "Not uploading postprocessing results", False
    to_upload = True
    if (not to_gcs and
        self.get_remote_session_folder_status(session_prefix) == STATE_POSTPROCESSED):
      answer = sg.popup_yes_no(
          "Session %s already contains postprocessing results remotely. "
          "Do you want to upload postprocessing results again?" % session_prefix)
      to_upload = answer == "Yes"
    if not to_upload:
      return "Uploading of postprocessing results canceled.", False

    local_session_dir = self.get_local_session_dir(session_prefix)
    if to_gcs:
      answer = sg.popup_yes_no(
          "Are you sure you want to upload proprocessing results from session %s "
          "to GCS bucket %s?" % (session_prefix, self.gcs_bucket_name))
      to_upload = answer == "Yes"
      if not to_upload:
        return "Not uploading postprocessing results to GCS", False
      destination_blob_prefix = "/".join(
            [GCS_POSTPROCESSED_UPLOAD_PREFIX] +
            [item for item in session_prefix.split("/") if item])
      print("Destination blob prefix: %s" % destination_blob_prefix)
      if self.is_session_uploaded_to_gcs(session_prefix):
        answer = sg.popup_yes_no(
            "This session has already been uploaded to GCS. "
            "Do you want to uploade it again, overwriting files?")
        to_upload = answer == "Yes"
        if not to_upload:
          return "Not uploading postprocessing results to GCS", False
      gcloud_utils.upload_files_as_objects(
          local_session_dir, POSTPROCESSING_FILES_TO_UPLOAD,
          self.gcs_bucket_name, destination_blob_prefix)
      return "Done uploading postprocessing results to GCS", False
    else:
      # Upload to S3.
      command_args = [
          "aws", "s3", "sync", "--profile=%s" % self._aws_profile_name,
          local_session_dir, "s3://" + self._s3_bucket_name + "/" + session_prefix,
          "--exclude=*", "--include=*.tsv",
          "--include=%s" % file_naming.CURATED_PROCESSED_JSON_FILENAME,
          "--include=%s" % file_naming.CURATED_PROCESSED_TSV_FILENAME,
          "--include=%s" % file_naming.CURATED_PROCESSED_SPEECH_ONLY_TSV_FILENAME]
      self._run_command_line(command_args)
      print("Done uploading the postprocessing results for session %s to S3" %
            session_prefix)
      return "Done uploading postprocessing results to S3", "session"

  def _run_command_line(self, command_args):
    print("Calling: %s" % (" ".join(command_args)))
    subprocess.check_call(command_args)


def _get_container_prefix(window, session_container_prefixes):
  if not session_container_prefixes:
    raise ValueError("Found no session container prefixes")
  container_list = window.Element("SESSION_CONTAINER_LIST")
  selection = container_list.Widget.curselection()
  if len(session_container_prefixes) == 1:
    if not selection:
      # Automatically set the selecton if there is only one container and none
      # is selected.
      container_list.update(set_to_index=[0])
    return session_container_prefixes[0]
  if not selection or len(selection) != 1:
    sg.Popup("Please select exactly 1 container first", modal=True)
    return
  selection = selection[0]
  return session_container_prefixes[selection]


def _get_session_prefix(window, session_container_prefixes, session_prefixes):
  container_prefix = _get_container_prefix(window, session_container_prefixes)
  if not container_prefix:
    sg.Popup("Please select exactly 1 container first", modal=True)
    return
  selection = window.Element("SESSION_LIST").Widget.curselection()
  if not selection:
    sg.Popup("Please select exactly 1 session first", modal=True)
    return
  return container_prefix + session_prefixes[selection[0]]


# UI state remembered between operations.
_UI_STATE = {
    "session_select_index": None,
    "session_yview": None,
    "session_colors": None,
}

def _disable_all_buttons(window):
  session_list = window.Element("SESSION_LIST")
  session_selection = session_list.Widget.curselection()
  if session_selection:
    _UI_STATE["session_select_index"] = session_selection[0]
    _UI_STATE["session_yview"] = session_list.Widget.yview()[0]
  window.Element("LIST_SESSIONS").Update(disabled=True)
  window.Element("SUMMARIZE_SESSIONS").Update(disabled=True)
  window.Element("OPEN_SESSION_FOLDER").Update(disabled=True)
  window.Element("REFRESH_SESSION_STATE").Update(disabled=True)
  window.Element("DOWNLOAD_SESSION_TO_LOCAL").Update(disabled=True)
  window.Element("PREPROCESS_SESSION").Update(disabled=True)
  window.Element("UPLOAD_PREPROC").Update(disabled=True)
  window.Element("DOWNLOAD_PREPROCESS_UPLOAD_SESSIONS_BATCH").Update(disabled=True)
  window.Element("POSTPROC_CURATION").Update(disabled=True)
  window.Element("UPLOAD_POSTPROC").Update(disabled=True)
  window.Element("UPLOAD_TO_GCS").Update(disabled=True)
  window.Element("SESSION_CONTAINER_LIST").Update(disabled=True)
  window.Element("SESSION_LIST").Update(disabled=True)
  window.Element("OBJECT_LIST").Update(disabled=True)


def _enable_all_buttons(window):
  window.Element("LIST_SESSIONS").Update(disabled=False)
  window.Element("SUMMARIZE_SESSIONS").Update(disabled=False)
  window.Element("OPEN_SESSION_FOLDER").Update(disabled=False)
  window.Element("REFRESH_SESSION_STATE").Update(disabled=False)
  window.Element("DOWNLOAD_SESSION_TO_LOCAL").Update(disabled=False)
  window.Element("PREPROCESS_SESSION").Update(disabled=False)
  window.Element("UPLOAD_PREPROC").Update(disabled=False)
  window.Element("DOWNLOAD_PREPROCESS_UPLOAD_SESSIONS_BATCH").Update(disabled=False)
  window.Element("POSTPROC_CURATION").Update(disabled=False)
  window.Element("UPLOAD_POSTPROC").Update(disabled=False)
  window.Element("UPLOAD_TO_GCS").Update(disabled=False)
  window.Element("SESSION_CONTAINER_LIST").Update(disabled=False)
  window.Element("SESSION_LIST").Update(disabled=False)
  window.Element("OBJECT_LIST").Update(disabled=False)


def _list_sessions(window,
                   data_manager,
                   session_container_prefixes,
                   restore_session_selection=False):
  t0 = time.time()
  window.Element("STATUS_MESSAGE").Update("Listing sessions. Please wait...")
  window.Element("STATUS_MESSAGE").Update(text_color="yellow")
  window.Element("SESSION_LIST").Update(disabled=True)
  window.refresh()
  container_prefix = _get_container_prefix(window, session_container_prefixes)
  if not container_prefix:
    return
  session_prefixes = data_manager.get_session_prefixes(container_prefix)
  session_prefixes_with_status = []
  session_colors = []
  data_manager.update_remote_session_objects_status(container_prefix)
  for session_prefix in session_prefixes:
    remote_status = data_manager.get_remote_session_folder_status(
        container_prefix + session_prefix, use_cached=True)
    local_status = data_manager.get_local_session_folder_status(
        container_prefix + session_prefix)
    session_prefixes_with_status.append(data_manager.get_session_status_string(
        session_prefix, remote_status, local_status))
    if remote_status == STATE_POSTPROCESSED:
      if data_manager.get_session_gcs_status(session_prefix) == STATE_UPLOADED:
        session_color = "gray"
      else:
        session_color = "green"
    elif remote_status == STATE_PREPROCESSED:
      session_color = "blue"
    else:
      session_color = "black"
    session_colors.append(session_color)
  session_list = window.Element("SESSION_LIST")
  session_list.Update(disabled=False)
  session_list.Update(session_prefixes_with_status)
  _UI_STATE["session_colors"] = session_colors
  _apply_session_colors(window)
  window.Element("SESSION_TITLE").Update(
      "Sessions:\n%d sessions" % len(session_prefixes))
  window.Element("STATUS_MESSAGE").Update("")
  window.Element("STATUS_MESSAGE").Update(text_color="white")
  session_list = window.Element("SESSION_LIST")
  if (restore_session_selection and
      _UI_STATE["session_select_index"] is not None):
    selection_index = _UI_STATE["session_select_index"]
    session_list.update(set_to_index=[selection_index])
  if _UI_STATE["session_yview"] is not None:
    session_list.Widget.yview_moveto(_UI_STATE["session_yview"])
  print("Listing sessions took %.3f seconds" % (time.time() - t0))
  return session_prefixes


def get_base_session_prefix(session_prefix):
  if not session_prefix:
    raise ValueError("session_prefix is empty or None")
  if session_prefix.endswith("/"):
    session_prefix = session_prefix[:-1]
  if "/" in session_prefix:
    session_prefix = session_prefix[session_prefix.rindex("/") + 1:]
  return session_prefix


def _download_preprocess_upload_sessions_from(window,
                                              data_manager,
                                              session_container_prefixes,
                                              session_prefixes):
  """Preprocess & upload sessions that aren't remotely preprocessed, in batch."""
  container_prefix = _get_container_prefix(window, session_container_prefixes)
  session_prefix = _get_session_prefix(
      window, session_container_prefixes, session_prefixes)
  task_session_prefixes = []
  start_index = -1
  for i, prefix in enumerate(session_prefixes):
    if container_prefix + prefix == session_prefix:
      start_index = i
      break
  assert start_index >= 0
  session_prefixes = session_prefixes[start_index:]
  print("List of sessions to run:")
  for session_prefix in session_prefixes:
    if data_manager.get_remote_session_folder_status(
        container_prefix + session_prefix) != STATE_NOT_PREPROCESSED:
      continue
    (_, _, _, _, num_keypresses, num_audio_files,
     _, _) = data_manager.get_session_details(container_prefix + session_prefix)
    if num_keypresses == 0 or num_audio_files == 0:
      continue
    task_session_prefixes.append(container_prefix + session_prefix)
    print("  %s" % session_prefix)
  if not task_session_prefixes:
    print("There are no sessions to preprocess or upload")
    return "No sessions to preprocess or upload", False
  while True:
    answer = input("Do you want to run %d sessions? (y/n): " %
                   len(task_session_prefixes)).strip()
    if answer in ("y", "n"):
      break
  if answer == "n":
    return "Batch preprocessing and uploading is canceled.", False
  for session_prefix in task_session_prefixes:
    print("")
    local_status = data_manager.get_local_session_folder_status(session_prefix)
    if local_status == STATE_NOT_DOWNLOADED:
      print("Downloading %s ..." % session_prefix)
      data_manager.sync_to_local(session_prefix)
    local_status = data_manager.get_local_session_folder_status(session_prefix)
    if local_status == STATE_DOWNLOADED:
      print("Preprocessing %s ..." % session_prefix)
      data_manager.preprocess_session(session_prefix)
    print("Uploading preprocessing results for %s..." % session_prefix)
    data_manager.upload_sesssion_preproc_results(session_prefix)
  return ("Done preprocessing and uploading %d sessions" %
          len(task_session_prefixes), True)


def _process_from(window,
                  data_manager,
                  session_container_prefixes,
                  session_prefixes,
                  processing_type="CHECK_KEYPRESSES"):
  container_prefix = _get_container_prefix(window, session_container_prefixes)
  session_prefix = _get_session_prefix(
      window, session_container_prefixes, session_prefixes)
  task_session_prefixes = []
  start_index = -1
  for i, prefix in enumerate(session_prefixes):
    if container_prefix + prefix == session_prefix:
      start_index = i
      break
  assert start_index >= 0
  session_prefixes = session_prefixes[start_index:]
  for session_prefix in session_prefixes:
    if not session_prefix.startswith(container_prefix):
      session_prefix = (container_prefix if container_prefix.endswith("/")
                        else (container_prefix + "/")) + session_prefix
    if processing_type == "CHECK_KEYPRESSES":
      _check_keypresses(data_manager, session_prefix)
    elif processing_type == "ANALYZE_TRANSCRIPTS":
      _analyze_transcripts(data_manager, session_prefix)
    else:
      raise ValueError("Unsupported processing type: %s" % processing_type)


def _apply_session_colors(window):
  if not _UI_STATE["session_colors"]:
    return
  session_list = window.Element("SESSION_LIST")
  session_widget = session_list.Widget
  for i, session_color in enumerate(_UI_STATE["session_colors"]):
    session_widget.itemconfigure(i, {"fg": session_color})


def _show_session_info(window,
                       data_manager,
                       session_container_prefixes,
                       session_prefixes,
                       user_cached=True):
  session_prefix = _get_session_prefix(
      window, session_container_prefixes, session_prefixes)
  if not session_prefix:
    return
  session_list = window.Element("SESSION_LIST")
  _UI_STATE["session_yview"] = session_list.Widget.yview()[0]
  (is_session_complete, time_zone, start_time, duration_s, num_keypresses,
   num_audio_files, num_screenshots,
   object_keys) = data_manager.get_session_details(session_prefix)
  window.Element("SESSION_NAME").Update(
      data_manager.get_session_basename(session_prefix))
  window.Element("IS_SESSION_COMPLETE").Update(
      "Yes" if is_session_complete else "No")
  window.Element("TIME_ZONE").Update(time_zone)
  window.Element("START_TIME").Update("%s" % start_time)
  if duration_s is not None:
    window.Element("DURATION_MIN").Update("%.2f" % (duration_s / 60))
  window.Element("NUM_KEYPRESSES").Update("%d" % num_keypresses)
  window.Element("NUM_AUDIO_FILES").Update("%d" % num_audio_files)
  window.Element("NUM_SCREENSHOTS").Update("%d" % num_screenshots)
  window.Element("OBJECT_LIST").Update(object_keys)
  window.Element("OBJECTS_TITLE").Update(
      "Remote objects:\n%d objects" % len(object_keys))

  selection_index = session_list.Widget.curselection()
  new_list = session_list.Values[:]
  remote_status = data_manager.get_remote_session_folder_status(
      session_prefix, use_cached=user_cached)
  claiming_username = data_manager.get_remote_session_claim_username(
      session_prefix)
  local_status = data_manager.get_local_session_folder_status(session_prefix)
  new_list[selection_index[0]] = data_manager.get_session_status_string(
      session_prefix, remote_status, local_status, claiming_username)
  session_list.Update(new_list)
  session_list.update(set_to_index=[selection_index])
  _apply_session_colors(window)
  if _UI_STATE["session_yview"] is not None:
    session_list.Widget.yview_moveto(_UI_STATE["session_yview"])


def _open_file_or_folder(file_or_dir_path):
  """Open a file or folder using operating system-specific affordance."""
  if sys.platform == "win32":
    subprocess.Popen(["start", file_or_dir_path], shell=True)
  elif sys.platform == "darwin":
    subprocess.Popen(["open", file_or_dir_path])
  else:  # Linux-like platforms.
    subprocess.Popen(["xdg-open", file_or_dir_path])


def upload_curated_freeform_text(window,
                                 session_container_prefixes,
                                 gcs_bucket_name):
  """Process and upload curated free-form txt files."""
  container_prefix = _get_container_prefix(window,
                                           session_container_prefixes)
  file_dialog = sg.Window(
      "Choose txt file").Layout(
          [[sg.Input(key="_FILES_"),
            sg.FilesBrowse(file_types=(("Text files", "*.txt"),))],
          [sg.OK()]])
  file_dialog_event, file_dialog_values = file_dialog.Read()
  if not file_dialog_values["_FILES_"]:
    raise ValueError("No file is chosen")
  file_dialog.Close()
  freeform_txt_path = file_dialog_values["_FILES_"].split(';')[0]
  with open(freeform_txt_path, "r") as f:
    content = f.read()
    freeform_txt_summary, redacted_freeform_txt = (
        freeform_text.process_curated_freeform_text(content))
  tmp_dir = tempfile.mkdtemp()
  metadata_json_path = os.path.join(tmp_dir, "metadata.json")
  redacted_txt_path = os.path.join(tmp_dir, "redacted.txt")
  with open(metadata_json_path, "w") as f:
    f.write(json.dumps(freeform_txt_summary))
  with open(redacted_txt_path, "w") as f:
    f.write(redacted_freeform_txt)
  destination_blob_prefix = "/".join(
      [GCS_CURATED_FREEFORM_UPLOAD_PREFIX] +
      [item for item in container_prefix.split("/") if item] +
      ["freeform_text_%s" % datetime.datetime.now().isoformat()])
  uploaded_file_names = [
      os.path.relpath(metadata_json_path, tmp_dir),
      os.path.relpath(redacted_txt_path, tmp_dir),
  ]
  gcloud_utils.upload_files_as_objects(
      tmp_dir, uploaded_file_names, gcs_bucket_name, destination_blob_prefix)
  shutil.rmtree(tmp_dir)
  print("Uploaded files to gs://%s/%s:\n%s" % (
      gcs_bucket_name, destination_blob_prefix, uploaded_file_names))


def _prep_for_posthoc_analysis(data_manager, session_prefix):
  remote_status = data_manager.get_remote_session_folder_status(
      session_prefix, use_cached=True)
  local_status = data_manager.get_local_session_folder_status(
       session_prefix)
  if (remote_status == STATE_POSTPROCESSED and
      local_status not in (STATE_POSTPROCESSED,)):
    data_manager.sync_to_local(session_prefix)
  session_dir_path = data_manager.get_local_session_dir(session_prefix)
  merged_path = os.path.join(
      session_dir_path, file_naming.MERGED_TSV_FILENAME)
  curated_path = os.path.join(
      session_dir_path, file_naming.CURATED_TSV_FILENAME)
  processed_path = os.path.join(
      session_dir_path, file_naming.CURATED_PROCESSED_TSV_FILENAME)
  if not os.path.isfile(merged_path):
    print("File not found: %s" % merged_path)
    merged_path = None
  if not os.path.isfile(curated_path):
    print("File not found: %s" % curated_path)
    curated_path = None
  if not os.path.isfile(processed_path):
    print("File not found: %s" % processed_path)
    processed_path = None
  return merged_path, curated_path, processed_path, session_dir_path


def _check_keypresses(data_manager, session_prefix):
  merged_path, _, processed_path, session_dir_path = _prep_for_posthoc_analysis(
      data_manager, session_prefix)
  if not merged_path or not processed_path:
    return
  print("Comparing %s vs. %s" % (merged_path, processed_path))
  merged_keypresses = process_keypresses.load_keypresses_from_tsv_file(
      merged_path)
  processed_keypresses = process_keypresses.load_keypresses_from_tsv_file(
      processed_path)
  (extra_keypresses,
    missing_keypresses) = process_keypresses.check_keypresses(
      merged_keypresses, processed_keypresses)
  print("Extra keypresses:", extra_keypresses)
  print("Missing keypresses:", missing_keypresses)
  keypress_checks_tsv_path = os.path.join(
      session_dir_path, file_naming.KEYPRESS_CHECKS_TSV_FILENAME)
  process_keypresses.write_extra_and_missing_keypresses_to_tsv(
      keypress_checks_tsv_path, extra_keypresses, missing_keypresses)
  print("Wrote keypress check results to %s" % keypress_checks_tsv_path)
  destination_blob_prefix = "/".join(
      [GCS_POSTPROCESSED_UPLOAD_PREFIX] +
      [item for item in session_prefix.split("/") if item])
  gcloud_utils.upload_files_as_objects(
      session_dir_path, [os.path.basename(keypress_checks_tsv_path)],
      data_manager.gcs_bucket_name, destination_blob_prefix)


def _analyze_transcripts(data_manager, session_prefix):
  merged_path, curated_path, _, session_dir_path = _prep_for_posthoc_analysis(
      data_manager, session_prefix)
  if not merged_path or not curated_path:
    return
  merged_transcripts = transcript_lib.load_transcripts_from_tsv_file(
      merged_path)
  curated_transcripts = transcript_lib.load_transcripts_from_tsv_file(
      curated_path)
  merged_transcripts = [
      transcript_lib.remove_markups(
          transcript_lib.extract_speech_content(content))
      for _, content in merged_transcripts]
  curated_transcripts = [
      transcript_lib.remove_markups(
          transcript_lib.extract_speech_content(content))
      for _, content in curated_transcripts]
  asr_transcripts = " ".join(merged_transcripts)
  ref_transcripts = " ".join(curated_transcripts)
  measures = transcript_lib.wer_measures(ref_transcripts, asr_transcripts)
  analysis_json_path = os.path.join(
      session_dir_path, file_naming.TRANSCIPRT_ANALYSIS_JSON_FILENAME)
  with open(analysis_json_path, "wt") as f:
    json.dump(measures, f)
  print("Transcript analysis result:", measures)
  print("Wrote transcript analysis result to %s" % analysis_json_path)
  destination_blob_prefix = "/".join(
      [GCS_POSTPROCESSED_UPLOAD_PREFIX] +
      [item for item in session_prefix.split("/") if item])
  gcloud_utils.upload_files_as_objects(
      session_dir_path, [os.path.basename(analysis_json_path)],
      data_manager.gcs_bucket_name, destination_blob_prefix)


LIST_BOX_WIDTH = 100


def main():
  args = parse_args()
  local_data_root = infer_local_data_root()
  data_manager = DataManager(args.aws_profile_name,
                             args.s3_bucket_name,
                             args.gcs_bucket_name,
                             local_data_root)
  print("Inferred local data root: %s" % local_data_root)
  session_container_prefixes = data_manager.get_session_container_prefixes()
  session_container_listbox = sg.Listbox(
      session_container_prefixes,
      size=(LIST_BOX_WIDTH, 3),
      enable_events=False,
      key="SESSION_CONTAINER_LIST")
  session_listbox = sg.Listbox(
      [],
      size=(LIST_BOX_WIDTH, 12),
      enable_events=True,
      key="SESSION_LIST")
  object_listbox = sg.Listbox(
      [],
      size=(LIST_BOX_WIDTH, 10),
      enable_events=False,
      key="OBJECT_LIST")
  layout = [
      [
          sg.Text("", size=(15, 1)),
          sg.Text(key="STATUS_MESSAGE", font=("Arial", 16)),
      ],
      [
          sg.Text("Local data root:", size=(15, 1)),
          sg.Text(local_data_root),
      ],
      [
          sg.Text("Containers:", size=(15, 1)),
          session_container_listbox,
          sg.Button("List sessions", key="LIST_SESSIONS"),
          sg.Button("Summarize", key="SUMMARIZE_SESSIONS"),
      ],
      [
          sg.Text("Sessions:", size=(15, 2), key="SESSION_TITLE"),
          session_listbox,
          sg.Column([
              [sg.Button("Open session folder", key="OPEN_SESSION_FOLDER")],
              [sg.Button("Refresh session state", key="REFRESH_SESSION_STATE")],
              [sg.Button("Show raw ASR", key="OPEN_RAW_ASR")],
              [sg.Button("Check keypresses", key="CHECK_KEYPRESSES")],
              [sg.Button("Analzye speech transcripts", key="ANALYZE_TRANSCRIPTS")],
          ]),
      ],
      [
          sg.Text("Sessions ownership:", size=(15, 2), key="SESSION_OWNERSHIP_TITLE"),
          sg.Button("Claim session", key="CLAIM_SESSION"),
          sg.Button("Unclaim session", key="UNCLAIM_SESSION"),
      ],
      [
          [
              sg.Text("Session name", size=(15, 1)),
              sg.InputText("", key="SESSION_NAME", readonly=True),
              sg.Text("Is complete?", size=(15, 1)),
              sg.InputText("", key="IS_SESSION_COMPLETE", readonly=True),
          ],
          [
              sg.Text("Time zone", size=(15, 1)),
              sg.InputText("", key="TIME_ZONE", readonly=True),
              sg.Text("Start time", size=(15, 1)),
              sg.InputText("", key="START_TIME", readonly=True),
          ],
          [
              sg.Text("Duration (min)", size=(15, 1)),
              sg.InputText("", key="DURATION_MIN", readonly=True),
              sg.Text("# of keypresses", size=(15, 1)),
              sg.InputText("", key="NUM_KEYPRESSES", readonly=True),
          ],
          [
              sg.Text("# of audio files", size=(15, 1)),
              sg.InputText("", key="NUM_AUDIO_FILES", readonly=True),
              sg.Text("# of screenshots", size=(15, 1)),
              sg.InputText("", key="NUM_SCREENSHOTS", readonly=True),
          ],
      ],
      [
          sg.Text("Remote objects:", size=(15, 2), key="OBJECTS_TITLE"),
          object_listbox,
      ],
      [
          sg.Text("", size=(15, 2)),
          sg.Button("Download session", key="DOWNLOAD_SESSION_TO_LOCAL"),
          sg.Button("Preprocess session", key="PREPROCESS_SESSION"),
          sg.Button("Upload preprocessing data", key="UPLOAD_PREPROC"),
          sg.Button("Postprocess curation", key="POSTPROC_CURATION"),
          sg.Button("Upload postprocessed data", key="UPLOAD_POSTPROC"),
          sg.Button("Upload to GCS", key="UPLOAD_TO_GCS"),
      ],
      [
          sg.Text("", size=(15, 2)),
          sg.Button("Preprocess and upload sessions from here on",
                    key="DOWNLOAD_PREPROCESS_UPLOAD_SESSIONS_BATCH"),
          sg.Button("Check keypresses from here on",
                    key="CHECK_KEYPRESSES_BATCH"),
          sg.Button("Analyze speech transcripts from here on",
                    key="ANALYZE_TRANSCRIPTS_BATCH"),
          sg.Button("Upload curated free-form text",
                    key="UPLOAD_CURATED_FREEFORM_TEXT"),
      ],
  ]
  session_prefixes = None
  window = sg.Window(
      "SpeakFaster Data Manager", layout)
  while True:
    event, values = window.read()
    if event == sg.WIN_CLOSED:
      break
    elif event == "LIST_SESSIONS":
      session_prefixes = _list_sessions(
          window, data_manager, session_container_prefixes)
    elif event == "SUMMARIZE_SESSIONS":
      # Summarize all sessions in a given container.
      _disable_all_buttons(window)
      container_prefix = _get_container_prefix(
          window, session_container_prefixes)
      if container_prefix:
        session_prefixes = _list_sessions(
            window, data_manager, session_container_prefixes)
        window.Element("STATUS_MESSAGE").Update(
            "Generating summary of %d sessions... Please wait." %
            len(session_prefixes), text_color="yellow")
        (num_sessions, num_complete_sessions, total_duration_s,
         total_keypresses, total_audio_files, total_screenshots, total_objects,
         session_keypresses_per_second,
         start_time_table) = data_manager.get_sessions_stats(
            container_prefix, session_prefixes)
        report = {
            "report_generated": datetime.datetime.now(pytz.timezone("UTC")).isoformat(),
            "num_sessions": num_sessions,
            "num_complete_sessions": num_complete_sessions,
            "total_duration_s": total_duration_s,
            "total_keypresses": total_keypresses,
            "total_audio_files": total_audio_files,
            "total_screenshots": total_screenshots,
            "total_objects": total_objects,
        }
        summary_text = json.dumps(report, indent=2)
        print("Summary of sessions:\n%s" % summary_text)
        report["session_prefixes"] = session_prefixes
        report["start_time_table"] = start_time_table.tolist()
        report["weekdays"] = WEEKDAYS
        report["hour_ranges"] = HOUR_RANGES
        destination_blob_name = "/".join(
            [GCS_SUMMARY_PREFIX] +
            [item for item in container_prefix.split("/") if item] +
            [datetime.datetime.now().isoformat() + ".json"])
        try:
          gcloud_utils.upload_text_to_object(json.dumps(report, indent=2),
                                             args.gcs_bucket_name,
                                             destination_blob_name)
        except Exception as e:
          print("Failed to upload report to bucket %s: %s" %
                (args.gcs_bucket_name, str(e)))
        sg.Popup(summary_text,
                 title="Summary of %d sessions" % num_sessions,
                 modal=True)
        session_prefixes = _list_sessions(
            window, data_manager, session_container_prefixes)
      _enable_all_buttons(window)
      window.Element("STATUS_MESSAGE").Update("")
    elif event in ("SESSION_LIST",
                   "OPEN_SESSION_FOLDER",
                   "REFRESH_SESSION_STATE",
                   "OPEN_RAW_ASR",
                   "CHECK_KEYPRESSES",
                   "ANALYZE_TRANSCRIPTS",
                   "CLAIM_SESSION",
                   "UNCLAIM_SESSION",
                   "DOWNLOAD_SESSION_TO_LOCAL",
                   "PREPROCESS_SESSION",
                   "UPLOAD_PREPROC",
                   "DOWNLOAD_PREPROCESS_UPLOAD_SESSIONS_BATCH",
                   "CHECK_KEYPRESSES_BATCH",
                   "ANALYZE_TRANSCRIPTS_BATCH",
                   "POSTPROC_CURATION",
                   "UPLOAD_POSTPROC",
                   "UPLOAD_TO_GCS"):
      if not session_prefixes:
        sg.Popup("Please list sessions first", modal=True)
        continue
      session_prefix = _get_session_prefix(
          window, session_container_prefixes, session_prefixes)
      if not session_prefix:
        sg.Popup("Please select exactly 1 session first", modal=True)
        continue
      _show_session_info(
          window, data_manager, session_container_prefixes, session_prefixes)
      if event == "OPEN_SESSION_FOLDER":
        session_dir_path = data_manager.get_local_session_dir(session_prefix)
        if os.path.isdir(session_dir_path):
          _open_file_or_folder(session_dir_path)
        else:
          sg.Popup(
              "Local session directory not found. Download the session first",
              modal=True)
        continue
      elif event == "REFRESH_SESSION_STATE":
        _show_session_info(window, data_manager, session_container_prefixes,
                           session_prefixes)
        continue
      elif event == "OPEN_RAW_ASR":
        session_dir_path = data_manager.get_local_session_dir(session_prefix)
        asr_tsv_path = os.path.join(session_dir_path, file_naming.ASR_TSV_FILENAME)
        if os.path.isfile(asr_tsv_path):
          _open_file_or_folder(asr_tsv_path)
        else:
          sg.Popup(
              "Local file not found: %s. "
              "Make sure the session is preprocessed and downloaded." % asr_tsv_path,
              modal=True)
        continue
      elif event == "CHECK_KEYPRESSES":
        _check_keypresses(data_manager, session_prefix)
        continue
      elif event == "ANALYZE_TRANSCRIPTS":
        _analyze_transcripts(data_manager, session_prefix)
        continue
      elif event == "CLAIM_SESSION":
        data_manager.claim_session(session_prefix)
        _show_session_info(window, data_manager, session_container_prefixes,
                           session_prefixes, user_cached=False)
        continue
      elif event == "UNCLAIM_SESSION":
        data_manager.claim_session(session_prefix, unclaim=True)
        _show_session_info(window, data_manager, session_container_prefixes,
                           session_prefixes, user_cached=False)
        continue
      elif event == "SESSION_LIST":
        continue
      sessions_changed = True
      status_message = ""
      if event == "DOWNLOAD_SESSION_TO_LOCAL":
        status_message = "Downloading session. Please wait..."
      elif event == "PREPROCESS_SESSION":
        status_message = "Preprocessing session. Please wait..."
      elif event == "UPLOAD_PREPROC":
        status_message = "Uploading session preprocessing results. Please wait..."
      elif event == "DOWNLOAD_PREPROCESS_UPLOAD_SESSIONS_BATCH":
        status_message = "Batch downloading, preprocessing and uploading sessions. Please wait..."
      elif event == "CHECK_KEYPRESSES_BATCH":
        status_message = "Batch checking keypresses. Please wait..."
      elif event == "ANALYZE_TRANSCRIPTS_BATCH":
        status_message = "Batch analyzing speech transcripts. Please wait..."
      elif event == "POSTPROC_CURATION":
        status_message = "Postprocessing curation results. Please wait..."
      elif event == "UPLOAD_POSTPROC":
        status_message = "Uploading session postprocessing results. Please wait..."
      elif event == "UPLOAD_TO_GCS":
        status_message = ("Uploading postprocessing results to GCS (%s). "
                          "Please wait..." % data_manager.gcs_bucket_name)

      window.Element("STATUS_MESSAGE").Update(status_message)
      window.Element("STATUS_MESSAGE").Update(text_color="yellow")
      _disable_all_buttons(window)
      window.refresh()
      if event == "DOWNLOAD_SESSION_TO_LOCAL":
        (status_message,
         sessions_changed) = data_manager.sync_to_local(session_prefix)
        status_message = "Session downloading complete."
      elif event == "PREPROCESS_SESSION":
        (status_message,
         sessions_changed) = data_manager.preprocess_session(session_prefix)
      elif event == "UPLOAD_PREPROC":
        (status_message,
         sessions_changed) = data_manager.upload_sesssion_preproc_results(
            session_prefix)
      elif event == "DOWNLOAD_PREPROCESS_UPLOAD_SESSIONS_BATCH":
        _download_preprocess_upload_sessions_from(
           window, data_manager, session_container_prefixes, session_prefixes)
        status_message = ""
        sessions_changed = True
      elif event == "CHECK_KEYPRESSES_BATCH":
        _process_from(
            window, data_manager, session_container_prefixes, session_prefixes,
            processing_type="CHECK_KEYPRESSES")
        sessions_changed = False
      elif event == "ANALYZE_TRANSCRIPTS_BATCH":
        _process_from(
            window, data_manager, session_container_prefixes, session_prefixes,
            processing_type="ANALYZE_TRANSCRIPTS")
        sessions_changed = False
      elif event == "POSTPROC_CURATION":
        (status_message,
         sessions_changed) = data_manager.postprocess_curation(session_prefix)
      elif event in ("UPLOAD_POSTPROC", "UPLOAD_TO_GCS"):
        (status_message,
         sessions_changed) = data_manager.upload_session_postproc_results(
            session_prefix, to_gcs=(event == "UPLOAD_TO_GCS"))
      window.Element("STATUS_MESSAGE").Update(status_message)
      window.Element("STATUS_MESSAGE").Update(text_color="white")
      _enable_all_buttons(window)
      if sessions_changed == "session":
        # The value of "session" means only refresh the selected session.
        _show_session_info(window, data_manager, session_container_prefixes,
                           session_prefixes)
      elif sessions_changed == True:
        # Refresh all sessions after the selected session has finished downloading.
        session_prefixes = _list_sessions(
            window,
            data_manager,
            session_container_prefixes,
            restore_session_selection=True)
    elif event == "UPLOAD_CURATED_FREEFORM_TEXT":
      upload_curated_freeform_text(window,
                                   session_container_prefixes,
                                   args.gcs_bucket_name)
    else:
      raise ValueError("Invalid event: %s" % event)


if __name__ == "__main__":
  main()
