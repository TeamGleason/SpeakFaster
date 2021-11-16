"""Enroll speaker for speaker ID with Azure Cognitive Speech Service."""
import argparse
import json
import os
import requests
import tempfile

import librosa
import numpy as np
from scipy.io import wavfile

MIN_WAV_LENGTH_SECONDS = 20
REQUIRED_SAMPLE_RATE_HZ = 16000
ENROLL_MAX_WAV_LENGTH_SECONDS = 90


def parse_args():
  parser = argparse.ArgumentParser("Azure Speaker ID enrollment")
  parser.add_argument(
      "action", choices=("enroll", "list", "delete"),
      help="Action to perform")
  parser.add_argument(
      "--azure_region", type=str, default="westus",
      help="Region for Azure Speech Cloud API")
  parser.add_argument(
      "--azure_subscription_key", type=str, required=True,
      help="Subscription key for Azure Speech Cloud API")
  parser.add_argument(
      "--wav_path", type=str,
      help="Path to the wav file used for speaker enrollment. Must be provided "
      "if action is enroll")
  parser.add_argument(
      "--profile_id", type=str,
      help="Profile of an already-enrolled voice. Must be provided "
      "if action is delete")
  return parser.parse_args()


def _get_azure_endpoint(region):
  return "https://%s.api.cognitive.microsoft.com" % region


def list_profiles(region, subscription_key):
  list_url = "%s/speaker/identification/v2.0/text-independent/profiles" % (
      _get_azure_endpoint(region))
  headers = {
      "Ocp-apim-subscription-key": subscription_key,
  }
  session = requests.Session()
  resp = session.get(list_url, headers=headers)
  print(json.dumps(json.loads(resp.content), indent=2))


def _add_profile(region, subscription_key):
  headers = {
      "Ocp-apim-subscription-key": subscription_key,
      "Content-Type": "application/json",
  }
  data = b"{\"locale\":\"en-us\"}"
  url = "%s/speaker/identification/v2.0/text-independent/profiles" % (
      _get_azure_endpoint(region))
  session = requests.Session()
  resp = session.post(url, headers=headers, data=data)
  resp_json = json.loads(resp.content)
  profile_id = resp_json["profileId"]
  print("New speaker profile ID: %s" % profile_id)
  return profile_id


def _check_and_load_wav_file_length(wav_path):
  fs, xs = wavfile.read(wav_path)
  if len(xs.shape) != 1:
    raise ValueError("Only single-channel (mono) WAV files are supported")
  duration_sec = len(xs) / fs
  if duration_sec < MIN_WAV_LENGTH_SECONDS:
    raise ValueError(
        "Requires WAV file to be at least %f seconds long; "
        "Got %f seconds." % (MIN_WAV_LENGTH_SECONDS, duration_sec))
  to_delete_wav = False
  if fs != REQUIRED_SAMPLE_RATE_HZ:
    if fs > REQUIRED_SAMPLE_RATE_HZ:
      # Resample the audio to 16000 Hz.
      print("Resampling audio file %s from %d to %d Hz" %
             (wav_path, fs, REQUIRED_SAMPLE_RATE_HZ))
      xs_hat = librosa.resample(
          xs.astype(np.float32), fs, REQUIRED_SAMPLE_RATE_HZ).astype(np.int16)
      max_length = int(ENROLL_MAX_WAV_LENGTH_SECONDS * REQUIRED_SAMPLE_RATE_HZ)
      if len(xs_hat) > max_length:
        xs_hat = xs_hat[:max_length]
      wav_path = tempfile.mktemp(suffix=".wav")
      to_delete_wav = True
      wavfile.write(wav_path, REQUIRED_SAMPLE_RATE_HZ, xs_hat)
    else:
      raise ValueError(
          "Sampling rate mismatch (%d != %d); upsampling is not supported" %
          (fs, REQUIRED_SAMPLE_RATE_HZ))
  with open(wav_path, "rb") as f:
    audio_data = f.read()
  if to_delete_wav:
    os.remove(wav_path)
  return fs, audio_data


def enroll_profile(region, subscription_key, wav_path):
  """Enroll a new profile to Azure Speaker ID.

  Args:
    region: Azure speech service region. At the time of this writing,
      only "westus" is supported.
    subscription_key: Azure speech service subscription key.
    wav_path: Path to the WAV file. Must be 20 seconds or longer.
  """
  fs, audio_data = _check_and_load_wav_file_length(wav_path)
  profile_id = _add_profile(region, subscription_key)

  url = "%s/speaker/identification/v2.0/text-independent/profiles/%s/enrollments" % (
      _get_azure_endpoint(region), profile_id)
  headers = {
      "Ocp-apim-subscription-key": subscription_key,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=%s" % fs,
  }
  session = requests.Session()
  resp = session.post(url, headers=headers, data=audio_data)
  print("Enrollment response status code: %s\n" % resp.status_code)
  print(json.dumps(json.loads(resp.content), indent=2))


def delete_profile(region, subscription_key, profile_id):
  delete_url = "%s/speaker/identification/v2.0/text-independent/profiles/%s" % (
      _get_azure_endpoint(region), profile_id)
  headers = {
      "Ocp-apim-subscription-key": subscription_key,
  }
  session = requests.Session()
  resp = session.delete(delete_url, headers=headers)
  print("Deletion response status code: %s\n" % resp.status_code)


def main(args):
  if args.action == "list":
    list_profiles(args.azure_region, args.azure_subscription_key)
  elif args.action == "enroll":
    if not args.wav_path:
      raise ValueError("You must provide --wav_path for action is enroll")
    enroll_profile(
        args.azure_region, args.azure_subscription_key, args.wav_path)
  elif args.action == "delete":
    if not args.profile_id:
      raise ValueError("You must provide --profile_id for action is delete")
    while True:
      confirmation = input(
          "Are you sure you want to delete voice profile %s? (yes/no): " %
          args.profile_id)
      if confirmation.lower() in ("no", "yes"):
        break
    if confirmation.lower() == "yes":
      delete_profile(
          args.azure_region, args.azure_subscription_key, args.profile_id)


if __name__ == "__main__":
  main(parse_args())

