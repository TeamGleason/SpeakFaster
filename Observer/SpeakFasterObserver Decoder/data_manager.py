import boto3
import PySimpleGUI as sg

S3_BUCKET_NAME = "speak-faster-cais-test"
OBSERVER_DATA_PREFIX = "observer_data"
DATA_SCHEMA_NAME = "SPO-2111"


def get_session_container_prefixes():
  """Find the prefixes that hold the session folders as children.

  Returns:
    A list of prefixes, each of which ends with '/'. The bucket name
     itself is not included.
  """
  s3_client = boto3.client("s3")
  prefixes = []
  current_prefixes = [
      OBSERVER_DATA_PREFIX + "/" + DATA_SCHEMA_NAME + "/"]
  for i in range(3):
    new_prefixes = []
    for current_prefix in current_prefixes:
      paginator = s3_client.get_paginator("list_objects")
      results = list(paginator.paginate(
          Bucket=S3_BUCKET_NAME,
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


def get_session_prefixes(session_container_prefix):
  """Get the prefixes that correspond to the sessions."""
  s3_client = boto3.client("s3")
  paginator = s3_client.get_paginator("list_objects")
  results = list(paginator.paginate(
      Bucket=S3_BUCKET_NAME,
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



def main():
  session_container_prefixes = get_session_container_prefixes()
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
  layout = [
      [
          sg.Text("Containers:", size=(15, 1)),
          session_container_listbox,
          sg.Button("List sessions"),
      ],
      [
          sg.Text("Sessions:", size=(15, 2), key="SESSION_TITLE"),
          session_listbox,
      ]
  ]
  window = sg.Window(
      "SpeakFaster Data Manager", layout)
  while True:
    event, values = window.read()
    if event == sg.WIN_CLOSED:
      break
    elif event == "List sessions":
      print("List sessions")
      selection = window.Element("SESSION_CONTAINER_LIST").Widget.curselection()
      if not selection:
        sg.Popup("Please select exactly 1 container first", modal=True)
        continue
      selection = selection[0]
      session_prefixes = get_session_prefixes(
          session_container_prefixes[selection])
      window.Element("SESSION_LIST").Update(session_prefixes)
      window.Element("SESSION_TITLE").Update(
          "Sessions:\n%d sessions" % len(session_prefixes))





if __name__ == "__main__":
  main()

