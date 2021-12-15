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
import json
import os
import pathlib
import pytz
import subprocess
import sys
import tempfile
import time

import boto3
import numpy as np
import PySimpleGUI as sg

import elan_process_curated
import file_naming
import metadata_pb2
import process_keypresses

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


def _get_hour_index(hour):
  for i, (hour_min, hour_max) in enumerate(HOUR_RANGES):
    if hour >= hour_min and hour < hour_max:
      return i
  return len(HOUR_RANGES) - 1


def _print_time_summary_table(table):
  print("=== Distribution of session start times ===")
  print("\t" + "\t".join(["%d-%d" %
      (hour_min, hour_max) for hour_min, hour_max in HOUR_RANGES]))
  for i, weekday in enumerate(WEEKDAYS):
    print(weekday + "\t" + "\t".join(["%d" % n for n in table[i, :].tolist()]))


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

  def __init__(self, aws_profile_name, s3_bucket_name, local_data_root):
    self._s3_client = boto3.Session(profile_name=aws_profile_name).client("s3")
    self._aws_profile_name = aws_profile_name
    self._s3_bucket_name = s3_bucket_name
    self._local_data_root = local_data_root
    self._speaker_id_config_json_path = find_speaker_id_config_json()
    self._session_keypresses_per_second = None
    self._manual_timezone_name = None
    self._check_aws_cli()

  def _check_aws_cli(self):
    try:
      self._run_command_line(["aws", "--version"])
    except subprocess.CalledProcessError:
      raise ValueError(
          "It appears that you don't have aws cli installed and on the path. "
          "Please install it and make sure it is on the path.")

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
        keypresses = process_keypresses.load_keypresses_from_file(tmp_filepath)
        num_keypresses += len(keypresses.keyPresses)
        os.remove(tmp_filepath)
    if not time_zone:
      # Time zone is not found. Ask for it with a PySimpleGUI get-text dialog.
      if not self._manual_timezone_name:
        self._manual_timezone_name = sg.popup_get_text(
            "Time zone is not available in the session's data files. "
            "Please enter (will use default US/Central if empty): ")
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

  def get_sessions_stats(self, container_prefix, session_prefixes):
    """Get the summary statistics of the given sessions."""
    num_sessions = 0
    num_complete_sessions = 0
    total_duration_s = 0
    total_keypresses = 0
    total_audio_files = 0
    total_screenshots = 0
    total_objects = 0
    session_keypresses_per_second = dict()
    start_time_table = np.zeros([7, len(HOUR_RANGES)])

    for session_prefix in session_prefixes:
      (is_session_complete, _,
       start_time, duration_s, num_keypresses, num_audio_files,
       num_screenshots, object_keys) = self.get_session_details(
          container_prefix + session_prefix)
      start_time_table[
          start_time.weekday(), _get_hour_index(start_time.hour)] += 1
      num_sessions += 1
      if is_session_complete:
        num_complete_sessions += 1
      total_duration_s += duration_s
      total_keypresses += num_keypresses
      total_audio_files += num_audio_files
      total_screenshots += num_screenshots
      total_objects += len(object_keys)
      session_keypresses_per_second[session_prefix] = (
          None if duration_s == 0 else num_keypresses / duration_s)
    self._session_keypresses_per_second = session_keypresses_per_second
    return (num_sessions, num_complete_sessions, total_duration_s,
            total_keypresses, total_audio_files, total_screenshots,
            total_objects, session_keypresses_per_second)

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

  def get_local_session_folder_status(self, session_prefix):
    local_dest_dir = self.get_local_session_dir(session_prefix)
    if not os.path.isdir(local_dest_dir):
      return "NOT_DOWNLOADED"
    else:
      if (self._nonempty_file_exists(
              local_dest_dir, file_naming.CURATED_PROCESSED_JSON_FILENAME) and
          self._nonempty_file_exists(
              local_dest_dir, file_naming.CURATED_PROCESSED_TSV_FILENAME) and
          self._nonempty_file_exists(
              local_dest_dir, file_naming.CURATED_PROCESSED_SPEECH_ONLY_TSV_FILENAME)):
        return "POSTPROCESSED"
      elif self._nonempty_file_exists(
          local_dest_dir, file_naming.CURATED_TSV_FILENAME):
        return "CURATED"
      elif (self._nonempty_file_exists(
              local_dest_dir, file_naming.MERGED_TSV_FILENAME) and
          self._nonempty_file_exists(
              local_dest_dir, file_naming.CONCATENATED_AUDIO_FILENAME) and
          self._nonempty_file_exists(
              local_dest_dir, file_naming.SCREENSHOTS_MP4_FILENAME)):
        return "PREPROCESSED"
      elif glob.glob(os.path.join(local_dest_dir, "*-SessionEnd.bin")):
        return "DOWNLOADED"
      else:
        return "NOT_DOWNLOADED"

  def get_session_keypresses_per_second(self, session_prefix):
    if self._session_keypresses_per_second is not None:
      return self._session_keypresses_per_second.get(session_prefix, None)

  def _remote_object_exists(self, session_prefix, filename):
    merged_tsv_key = session_prefix + filename
    response = self._s3_client.list_objects_v2(
        Bucket=self._s3_bucket_name, Prefix=merged_tsv_key)
    return "KeyCount" in response and response["KeyCount"] > 0

  def update_remote_session_objects_status(self, session_container_prefix):
    """Update the status of key remote objects."""
    paginator = self._s3_client.get_paginator("list_objects")
    pages = paginator.paginate(
        Bucket=self._s3_bucket_name, Prefix=session_container_prefix)
    self._sessions_with_merged_tsv = []
    self._sessions_with_curated_tsv = []
    for page in pages:
      for content in page["Contents"]:
        session = content["Key"][:content["Key"].rindex("/") + 1]
        if os.path.basename(content["Key"]) == file_naming.MERGED_TSV_FILENAME:
          self._sessions_with_merged_tsv.append(session)
        elif  os.path.basename(content["Key"]) == file_naming.CURATED_TSV_FILENAME:
          self._sessions_with_merged_tsv.append(session)

  def get_remote_session_folder_status(self, session_prefix, use_cached=False):
    if use_cached:
      if session_prefix in self._sessions_with_curated_tsv:
        return "POSTPROCESSED"
      elif session_prefix in self._sessions_with_merged_tsv:
        return "PREPROCESSED"
      else:
        return "NOT_PREPROCESSED"
    else:
      if self._remote_object_exists(
         session_prefix, file_naming.CURATED_PROCESSED_TSV_FILENAME):
        return "POSTPROCESSED"
      elif self._remote_object_exists(
        session_prefix, file_naming.MERGED_TSV_FILENAME):
        return "PREPROCESSED"
      else:
        return "NOT_PREPROCESSED"

  def preprocess_session(self, session_prefix):
    to_run_preproc = True
    if self.get_local_session_folder_status(session_prefix) in (
        "PREPROCESSED", "CURATED", "POSTPROCESSED"):
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
    return message, True

  def upload_sesssion_preproc_results(self, session_prefix):
    if self.get_local_session_folder_status(session_prefix) not in  (
        "PREPROCESSED", "CURATED", "POSTPROCESSED"):
      sg.Popup(
          "Cannot upload the preprocessing results of session %s, "
          "because no preprocessing results are found" % session_prefix,
          modal=True)
      return "Not uploading preprocessing results", False
    to_upload = True
    if self.get_remote_session_folder_status(session_prefix) != "NOT_PREPROCESSED":
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
        "--include=%s" % file_naming.CURATED_PROCESSED_JSON_FILENAME,
        "--include=%s" % file_naming.CURATED_PROCESSED_TSV_FILENAME,
        "--include=%s" % file_naming.CURATED_PROCESSED_SPEECH_ONLY_TSV_FILENAME]
    self._run_command_line(command_args)
    print("Done uploading the preprocessing results for session %s" %
          session_prefix)
    return "Uploading of preprocessing results complete", True

  def postprocess_curation(self, session_prefix):
    local_dest_dir = self.get_local_session_dir(session_prefix)
    local_status = self.get_local_session_folder_status(session_prefix)
    if local_status not in ("CURATED", "POSTPROCESSED"):
      sg.Popup(
          "Cannot postprocess the curation results of session %s, "
          "because the local directory for the session doesn't contain "
          "the expected file from ELAN: %s" %
          (session_prefix, file_naming.CURATED_TSV_FILENAME),
          modal=True)
      return ("Not postprocessing curation results: Cannot find %s" %
              file_naming.CURATED_TSV_FILENAME), False
    to_postprocess = True
    if local_status == "POSTPROCESSED":
      answer = sg.popup_yes_no(
          "Session is %s already postprocessed successfully. "
          "Do you want to do postprocessing again?" % session_prefix)
      to_postprocess = answer == "Yes"
    if not to_postprocess:
      return "Not performing postprocessing", False

    local_dest_dir = self.get_local_session_dir(session_prefix)
    try:
      elan_process_curated.postprocess_curated(
          local_dest_dir, self._speaker_id_config_json_path)
      message = "Postprocessing succeeded!"
      print(message)
      sg.Popup(message, modal=True)
      return message
    except Exception as e:
      failure_message = "Postprocessing failed with error message:\n\n%s" % e
      print(failure_message)
      sg.Popup(failure_message, title="Postprocessing failed", modal=True)
      return "Postprocessing failed", True

  def upload_session_postproc_results(self, session_prefix):
    if self.get_local_session_folder_status(session_prefix) != "POSTPROCESSED":
      sg.Popup(
          "Cannot upload the postprocessing results of session %s, "
          "because no postprocessing results are found" % session_prefix,
          modal=True)
      return "Not uploading postprocessing results", False
    to_upload = True
    if self.get_remote_session_folder_status(session_prefix) == "POSTPROCESSED":
      answer = sg.popup_yes_no(
          "Session %s already contains postprocessing results remotely. "
          "Do you want to upload postprocessing results again?" % session_prefix)
      to_upload = answer == "Yes"
    if not to_upload:
      return "Uploading of postprocessing results canceled.", False

    local_dest_dir = self.get_local_session_dir(session_prefix)
    command_args = [
        "aws", "s3", "sync", "--profile=%s" % self._aws_profile_name,
        local_dest_dir, "s3://" + self._s3_bucket_name + "/" + session_prefix,
        "--exclude=*", "--include=*.tsv",
        "--include=%s" % file_naming.CURATED_PROCESSED_JSON_FILENAME,
        "--include=%s" % file_naming.CURATED_PROCESSED_TSV_FILENAME,
        "--include=%s" % file_naming.CURATED_PROCESSED_SPEECH_ONLY_TSV_FILENAME]
    self._run_command_line(command_args)
    print("Done uploading the postprocessing results for session %s" %
          session_prefix)
    return "Down uploading postprocessing results", True

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
}

def _disable_all_buttons(window):
  session_selection = window.Element("SESSION_LIST").Widget.curselection()
  if session_selection:
    _UI_STATE["session_select_index"] = session_selection[0]
  window.Element("LIST_SESSIONS").Update(disabled=True)
  window.Element("SUMMARIZE_SESSIONS").Update(disabled=True)
  window.Element("OPEN_SESSION_FOLDER").Update(disabled=True)
  window.Element("DOWNLOAD_SESSION_TO_LOCAL").Update(disabled=True)
  window.Element("PREPROCESS_SESSION").Update(disabled=True)
  window.Element("UPLOAD_PREPROC").Update(disabled=True)
  window.Element("POSTPROC_CURATION").Update(disabled=True)
  window.Element("UPLOAD_POSTPROC").Update(disabled=True)
  window.Element("SESSION_CONTAINER_LIST").Update(disabled=True)
  window.Element("SESSION_LIST").Update(disabled=True)
  window.Element("OBJECT_LIST").Update(disabled=True)


def _enable_all_buttons(window):
  window.Element("LIST_SESSIONS").Update(disabled=False)
  window.Element("SUMMARIZE_SESSIONS").Update(disabled=False)
  window.Element("OPEN_SESSION_FOLDER").Update(disabled=False)
  window.Element("DOWNLOAD_SESSION_TO_LOCAL").Update(disabled=False)
  window.Element("PREPROCESS_SESSION").Update(disabled=False)
  window.Element("UPLOAD_PREPROC").Update(disabled=False)
  window.Element("POSTPROC_CURATION").Update(disabled=False)
  window.Element("UPLOAD_POSTPROC").Update(disabled=False)
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
    keypresses_per_second = data_manager.get_session_keypresses_per_second(
        session_prefix)
    kps_string = ("[? kps]" if keypresses_per_second is None else
                  ("[%.2f kps]" % keypresses_per_second))
    session_prefixes_with_status.append(
        "%s %s (Remote: %s) (Local: %s)" %
        (kps_string, session_prefix, remote_status, local_status))
    if remote_status == "POSTPROCESSED":
      session_color = "green"
    elif remote_status == "PREPROCESSED":
      session_color = "blue"
    else:
      session_color = "black"
    session_colors.append(session_color)
  session_list = window.Element("SESSION_LIST")
  session_list.Update(disabled=False)
  session_list.Update(session_prefixes_with_status)
  session_widget = session_list.Widget
  for i, session_color in enumerate(session_colors):
    session_widget.itemconfigure(i, {"fg": session_color})
  window.Element("SESSION_TITLE").Update(
      "Sessions:\n%d sessions" % len(session_prefixes))
  window.Element("STATUS_MESSAGE").Update("")
  window.Element("STATUS_MESSAGE").Update(text_color="white")
  if (restore_session_selection and
      _UI_STATE["session_select_index"] is not None):
    selection_index = _UI_STATE["session_select_index"]
    window.Element("SESSION_LIST").update(
        set_to_index=[selection_index],
        scroll_to_index=selection_index)
  print("Listing sessions took %.3f seconds" % (time.time() - t0))
  return session_prefixes


def _show_session_info(window,
                       data_manager,
                       session_container_prefixes,
                       session_prefixes):
  session_prefix = _get_session_prefix(
      window, session_container_prefixes, session_prefixes)
  if not session_prefix:
    return
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


def _open_folder(dir_path):
  """Open a folder using operating system-specific affordance."""
  if sys.platform == "win32":
    subprocess.Popen(["start", dir_path], shell=True)
  elif sys.platform == "darwin":
    subprocess.Popen(["open", dir_path])
  else:  # Linux-like platforms.
    subprocess.Popen(["xdg-open", dir_path])


LIST_BOX_WIDTH = 100


def main():
  args = parse_args()
  local_data_root = infer_local_data_root()
  data_manager = DataManager(args.aws_profile_name,
                             args.s3_bucket_name,
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
          sg.Button("Open session folder", key="OPEN_SESSION_FOLDER"),
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
      ]
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
         session_keypresses_per_second) = data_manager.get_sessions_stats(
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
        sg.Popup(summary_text,
                 title="Summary of %d sessions" % num_sessions,
                 modal=True)
        session_prefixes = _list_sessions(
            window, data_manager, session_container_prefixes)
      _enable_all_buttons(window)
      window.Element("STATUS_MESSAGE").Update("")
    elif event in ("SESSION_LIST",
                   "OPEN_SESSION_FOLDER",
                   "DOWNLOAD_SESSION_TO_LOCAL",
                   "PREPROCESS_SESSION",
                   "UPLOAD_PREPROC",
                   "POSTPROC_CURATION",
                   "UPLOAD_POSTPROC"):
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
          _open_folder(session_dir_path)
        else:
          sg.Popup(
              "Local session directory not found. Download the session first",
              modal=True)
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
      elif event == "POSTPROCESS_CURATION":
        status_message = "Postprocessing curation results. Please wait..."
      elif event == "UPLOAD_POSTPROC":
        status_message = "Uploading session postprocessing results. Please wait..."
      window.Element("STATUS_MESSAGE").Update(status_message)
      window.Element("STATUS_MESSAGE").Update(text_color="yellow")
      _disable_all_buttons(window)
      window.refresh()
      if event == "DOWNLOAD_SESSION_TO_LOCAL":
        data_manager.sync_to_local(session_prefix)
        status_message = "Session downloading complete."
      elif event == "PREPROCESS_SESSION":
        (status_message,
         sessions_changed) = data_manager.preprocess_session(session_prefix)
      elif event == "UPLOAD_PREPROC":
        (status_message,
         sessions_changed) = data_manager.upload_sesssion_preproc_results(
            session_prefix)
      elif event == "POSTPROC_CURATION":
        (status_message,
         sessions_changed) = data_manager.postprocess_curation(session_prefix)
      elif event == "UPLOAD_POSTPROC":
        (status_message,
         sessions_changed) = data_manager.upload_session_postproc_results(
            session_prefix)
      window.Element("STATUS_MESSAGE").Update(status_message)
      window.Element("STATUS_MESSAGE").Update(text_color="white")
      _enable_all_buttons(window)
      # Refresh all sessions after the selected session has finished downloading.
      if sessions_changed:
        session_prefixes = _list_sessions(
            window,
            data_manager,
            session_container_prefixes,
            restore_session_selection=True)
    else:
      raise ValueError("Invalid event: %s" % event)


if __name__ == "__main__":
  main()
