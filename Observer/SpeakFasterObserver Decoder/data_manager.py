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
import os
import pathlib
import pytz
import subprocess
import tempfile
import time

import boto3
import PySimpleGUI as sg

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
  if "Eastern Time (US & Canada)" in readable_timezone_name:
    return "US/Eastern"
  elif "Central Time (US & Canada)" in readable_timezone_name:
    return "US/Central"
  else:
    raise ValueError("Unimplemented time zone: %s" % time_zone)


class DataManager(object):

  def __init__(self, aws_profile_name, s3_bucket_name, local_data_root):
    self._s3_client = boto3.Session(profile_name=aws_profile_name).client("s3")
    self._aws_profile_name = aws_profile_name
    self._s3_bucket_name = s3_bucket_name
    self._local_data_root = local_data_root

  def get_session_container_prefixes(self):
    """Find the prefixes that hold the session folders as children.

    Returns:
      A list of prefixes, each of which ends with '/'. The bucket name
      itself is not included.
    """
    prefixes = []
    current_prefixes = [
        OBSERVER_DATA_PREFIX + "/" + DATA_SCHEMA_NAME + "/"]
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

  def get_session_details(self, session_prefix):
    """Get the details about a session."""
    utc_timezone = pytz.timezone("UTC")
    response = self._s3_client.list_objects_v2(
        Bucket=self._s3_bucket_name, Prefix=session_prefix)
    print("get_session_details(): is_truncated = %s" % response["IsTruncated"])
    objects = response["Contents"]
    object_keys = []
    time_zone = None
    first_timestamp = datetime.datetime.now().timestamp()
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
      if timestamp < first_timestamp:
        first_timestamp = timestamp
      if timestamp > last_timestamp:
        last_timestamp = timestamp
      if obj_key.endswith("-SessionEnd.bin"):
        tmp_filepath = self._download_to_temp_file(obj_key)
        session_metadata = metadata_pb2.SessionMetadata()
        with open(tmp_filepath, "rb") as f:
          session_metadata.ParseFromString(f.read())
        time_zone = session_metadata.timezone
        os.remove(tmp_filepath)
      elif obj_key.endswith("-Keypresses.protobuf"):
        tmp_filepath = self._download_to_temp_file(obj_key)
        keypresses = process_keypresses.load_keypresses_from_file(tmp_filepath)
        num_keypresses += len(keypresses.keyPresses)
    if time_zone:
      tz = pytz.timezone(_get_timezone(time_zone))
      start_time = utc_timezone.localize(
          datetime.datetime.fromtimestamp(first_timestamp)).astimezone(tz)
      duration_s = last_timestamp - first_timestamp
    return (time_zone, start_time, duration_s, num_keypresses, num_audio_files,
            num_screenshots, object_keys)

  def _get_session_basename(self, session_prefix):
    path_items = session_prefix.split("/")
    return path_items[-1] if path_items[-1] else path_items[-2]

  def _get_local_session_dir(self, session_prefix):
    session_basename = self._get_session_basename(session_prefix)
    return os.path.join(self._local_data_root, session_basename)

  def _nonempty_file_exists(self, file_path):
    if not os.path.isfile(file_path):
      return False
    return os.path.getsize(file_path) > 0

  def sync_to_local(self, session_prefix):
    local_dest_dir = self._get_local_session_dir(session_prefix)
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
    # TODO(cais): Add CURATED and POSTPROCESSED states.
    local_dest_dir = self._get_local_session_dir(session_prefix)
    if not os.path.isdir(local_dest_dir):
      return "NOT_DOWNLOADED"
    else:
      session_end_bin_path = glob.glob(os.path.join(
          local_dest_dir, "*-SessionEnd.bin"))
      if (self._nonempty_file_exists(
              os.path.join(local_dest_dir, file_naming.MERGED_TSV_FILENAME)) and
          self._nonempty_file_exists(
              os.path.join(local_dest_dir, file_naming.CONCATENATED_AUDIO_FILENAME)) and
          self._nonempty_file_exists(
              os.path.join(local_dest_dir, file_naming.SCREENSHOTS_MP4_FILENAME))):
        return "PREPROCESSED"
      elif glob.glob(os.path.join(local_dest_dir, "*-SessionEnd.bin")):
        return "DOWNLOADED"
      else:
        return "NOT_DOWNLOADED"

  def get_remote_session_folder_status(self, session_prefix):
    merged_tsv_key = session_prefix + file_naming.MERGED_TSV_FILENAME
    response = self._s3_client.list_objects_v2(
        Bucket=self._s3_bucket_name, Prefix=merged_tsv_key)
    if response["KeyCount"] == 1:
      return "PREPROCESSED"
    else:
      return "NOT_PREPROCESSED"

  def preprocess_session(self, session_prefix):
    local_dest_dir = self._get_local_session_dir(session_prefix)
    (readable_timezone_name,
     _, _, _, _, _, _) = self.get_session_details(session_prefix)
    timezone = _get_timezone(readable_timezone_name)
    command_args = ["python", "elan_format_raw.py", local_dest_dir, timezone]
    self._run_command_line(command_args)
    print("Preprocessing complete.")

  def upload_sesssion_preproc_results(self, session_prefix):
    local_dest_dir = self._get_local_session_dir(session_prefix)
    command_args = [
        "aws", "s3", "sync", "--profile=%s" % self._aws_profile_name,
        local_dest_dir, "s3://" + self._s3_bucket_name + "/" + session_prefix,
        "--exclude=*", "--include=*.tsv",
        "--include=%s" % file_naming.CONCATENATED_AUDIO_FILENAME,
        "--include=%s" % file_naming.SCREENSHOTS_MP4_FILENAME]
    self._run_command_line(command_args)

  def _run_command_line(self, command_args):
    print("Calling: %s" % (" ".join(command_args)))
    subprocess.check_call(command_args)


def _get_container_prefix(window, session_container_prefixes):
  selection = window.Element("SESSION_CONTAINER_LIST").Widget.curselection()
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


def _disable_all_buttons(window):
  window.Element("LIST_SESSIONS").Update(disabled=True)
  window.Element("SHOW_SESSION_INFO").Update(disabled=True)
  window.Element("DOWNLOAD_SESSION_TO_LOCAL").Update(disabled=True)
  window.Element("PREPROCESS_SESSION").Update(disabled=True)
  window.Element("UPLOAD_PREPROC").Update(disabled=True)
  window.Element("SESSION_CONTAINER_LIST").Update(disabled=True)
  window.Element("SESSION_LIST").Update(disabled=True)
  window.Element("OBJECT_LIST").Update(disabled=True)


def _enable_all_buttons(window):
  window.Element("LIST_SESSIONS").Update(disabled=False)
  window.Element("SHOW_SESSION_INFO").Update(disabled=False)
  window.Element("DOWNLOAD_SESSION_TO_LOCAL").Update(disabled=False)
  window.Element("PREPROCESS_SESSION").Update(disabled=False)
  window.Element("UPLOAD_PREPROC").Update(disabled=False)
  window.Element("SESSION_CONTAINER_LIST").Update(disabled=False)
  window.Element("SESSION_LIST").Update(disabled=False)
  window.Element("OBJECT_LIST").Update(disabled=False)


def _list_sessions(window, data_manager, session_container_prefixes):
  window.Element("STATUS_MESSAGE").Update("Listing sessions. Please wait...")
  window.Element("STATUS_MESSAGE").Update(text_color="yellow")
  window.Element("SESSION_LIST").Update(disabled=True)
  window.refresh()
  container_prefix = _get_container_prefix(window, session_container_prefixes)
  if not container_prefix:
    return
  session_prefixes = data_manager.get_session_prefixes(container_prefix)
  session_prefixes_with_status = []
  for session_prefix in session_prefixes:
    session_prefixes_with_status.append(
        "%s (Remote: %s) (Local: %s)" %
        (session_prefix,
        data_manager.get_remote_session_folder_status(
            container_prefix + session_prefix),
        data_manager.get_local_session_folder_status(
            container_prefix + session_prefix)))
  window.Element("SESSION_LIST").Update(disabled=False)
  window.Element("SESSION_LIST").Update(session_prefixes_with_status)
  window.Element("SESSION_TITLE").Update(
      "Sessions:\n%d sessions" % len(session_prefixes))
  window.Element("STATUS_MESSAGE").Update("")
  window.Element("STATUS_MESSAGE").Update(text_color="white")
  return session_prefixes


def _show_session_info(window,
                       data_manager,
                       session_container_prefixes,
                       session_prefixes):
  session_prefix = _get_session_prefix(
      window, session_container_prefixes, session_prefixes)
  if not session_prefix:
    return
  (time_zone, start_time, duration_s, num_keypresses, num_audio_files,
    num_screenshots,
    object_keys) = data_manager.get_session_details(session_prefix)
  window.Element("IS_SESSION_COMPLETE").Update("Yes" if time_zone else "No")
  if time_zone:
    window.Element("TIME_ZONE").Update(time_zone)
    window.Element("START_TIME").Update("%s" % start_time)
    window.Element("DURATION_MIN").Update("%.2f" % (duration_s / 60))
    window.Element("NUM_KEYPRESSES").Update("%d" % num_keypresses)
    window.Element("NUM_AUDIO_FILES").Update("%d" % num_audio_files)
    window.Element("NUM_SCREENSHOTS").Update("%d" % num_screenshots)
    window.Element("OBJECT_LIST").Update(object_keys)
  else:
    window.Element("TIME_ZONE").Update("")
    window.Element("START_TIME").Update("")
    window.Element("DURATION_MIN").Update("")
    window.Element("NUM_KEYPRESSES").Update("")
    window.Element("NUM_AUDIO_FILES").Update("")
    window.Element("NUM_SCREENSHOTS").Update("")
    window.Element("OBJECT_LIST").Update([])


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
      size=(120, 3),
      enable_events=False,
      key="SESSION_CONTAINER_LIST")
  session_listbox = sg.Listbox(
      [],
      size=(120, 15),
      enable_events=False,
      key="SESSION_LIST")
  object_listbox = sg.Listbox(
      [],
      size=(120, 10),
      enable_events=False,
      key="OBJECT_LIST")
  layout = [
      [
          sg.Text("", size=(15, 1)),
          sg.Text(key="STATUS_MESSAGE"),
      ],
      [
          sg.Text("Local data root:", size=(15, 1)),
          sg.Text(local_data_root),
      ],
      [
          sg.Text("Containers:", size=(15, 1)),
          session_container_listbox,
          sg.Button("List sessions", key="LIST_SESSIONS"),
      ],
      [
          sg.Text("Sessions:", size=(15, 2), key="SESSION_TITLE"),
          session_listbox,
          sg.Button("Show session", key="SHOW_SESSION_INFO"),
      ],
      [
          [
              sg.Text("Is complete?", size=(15, 1)),
              sg.InputText("", key="IS_SESSION_COMPLETE", readonly=True),
          ],
          [
              sg.Text("Time zone", size=(15, 1)),
              sg.InputText("", key="TIME_ZONE", readonly=True),
          ],
          [
              sg.Text("Start time", size=(15, 1)),
              sg.InputText("", key="START_TIME", readonly=True),
          ],
          [
              sg.Text("Duration (min)", size=(15, 1)),
              sg.InputText("", key="DURATION_MIN", readonly=True),
          ],
          [
              sg.Text("# of keypresses", size=(15, 1)),
              sg.InputText("", key="NUM_KEYPRESSES", readonly=True),
          ],
          [
              sg.Text("# of audio files", size=(15, 1)),
              sg.InputText("", key="NUM_AUDIO_FILES", readonly=True),
          ],
          [
              sg.Text("# of screenshots", size=(15, 1)),
              sg.InputText("", key="NUM_SCREENSHOTS", readonly=True),
          ],
      ],
      [
          sg.Text("Remote objects:", size=(15, 2), key="OBBJECTS_TITLE"),
          object_listbox,
      ],
      [
          sg.Text("", size=(15, 2)),
          sg.Button("Download session", key="DOWNLOAD_SESSION_TO_LOCAL"),
          sg.Button("Proprocess session", key="PREPROCESS_SESSION"),
          sg.Button("Upload preprocessing data", key="UPLOAD_PREPROC"),
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
    elif event in ("SHOW_SESSION_INFO",
                   "DOWNLOAD_SESSION_TO_LOCAL",
                   "PREPROCESS_SESSION",
                   "UPLOAD_PREPROC"):
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
      if event == "SHOW_SESSION_INFO":
        continue
      if event == "DOWNLOAD_SESSION_TO_LOCAL":
        status_message = "Downloading session. Please wait..."
      elif event == "PREPROCESS_SESSION":
        status_message = "Preprocessing session. Please wait..."
      else:
        status_message = "Uploading session preprocessing results. Please wait..."
      window.Element("STATUS_MESSAGE").Update(status_message)
      window.Element("STATUS_MESSAGE").Update(text_color="yellow")
      _disable_all_buttons(window)
      window.refresh()
      if event == "DOWNLOAD_SESSION_TO_LOCAL":
        data_manager.sync_to_local(session_prefix)
        status_message = "Session downloading complete."
      elif event == "PREPROCESS_SESSION":
        to_run_preproc = True
        if data_manager.get_local_session_folder_status(
            session_prefix) == "PREPROCESSED":
          answer = sg.popup_yes_no(
              "Session %s has already been preprocessed locally. "
              "Do you want to run preprocessing again?" % session_prefix)
          to_run_preproc = answer == "Yes"
        if to_run_preproc:
          data_manager.preprocess_session(session_prefix)
          status_message = "Session preprocessing complete."
        else:
          status_message = "Preprocessing was not run."
      else:
        if data_manager.get_local_session_folder_status(
            session_prefix) != "PREPROCESSED":
          # TODO(cais): Accommodate CURATED and POSTPROCESSED states.
          sg.Popup(
              "Cannot upload the preprocessing results of session %s, "
              "because no preprocessing results are found" % session_prefix,
              modal=True)
          status_message = "Not uploading preprocessing results"
        else:
          to_upload = True
          if data_manager.get_remote_session_folder_status(
              session_prefix) != "NOT_PREPROCESSED":
            answer = sg.popup_yes_no(
                "Session %s already contains preprocessing results remotely. "
                "Do you want to upload preprocessing results again?" % session_prefix)
            to_upload = answer == "Yes"
          if to_upload:
            data_manager.upload_sesssion_preproc_results(session_prefix)
            status_message = "Uploading of precessing results complete."
          else:
            status_message = "Uploading of precessing results canceled."
      window.Element("STATUS_MESSAGE").Update(status_message)
      window.Element("STATUS_MESSAGE").Update(text_color="white")
      _enable_all_buttons(window)
      # Refresh all sessions after the selected session has finished downloading.
      session_prefixes = _list_sessions(
          window, data_manager, session_container_prefixes)
    else:
      raise ValueError("Invalid event: %s" % event)


if __name__ == "__main__":
  main()
