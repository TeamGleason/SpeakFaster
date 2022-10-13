"""Module for speech transcripts."""
import csv
import re
from datetime import datetime

import jiwer
import nlp

import elan_process_curated
import tsv_data

_DUMMY_DATETIME_FORMAT_NO_MILLIS = "%Y-%m-%dT%H:%M:%S"
_DUMMY_DATETIME_FORMAT_WITH_MILLIS = "%Y-%m-%dT%H:%M:%S.%f"
_REDACTION_MASK_REGEX = r"\[Redacted.*\]"
_SPEAKER_ID_REGEX = r"\[(Speaker:|SpeakerTTS:).*\]"
_SPEECH_TRANSCRIPT_CONTENT_REGEX = re.compile(
    ".+(\[(Speaker|SpeakerTTS):?\s?([A-Za-z0-9_#]+)\])$")
_UTTERANCE_ID_REGEX = r"\[U[0-9]+\]"
_BACKGROUND_SPEECH_TAG_REGEX = re.compile("\[BackgroundSpeech\]")


def load_transcripts_from_tsv_file(tsv_filepath):
  """Loads keypresses from a TSV file.

  Args:
    tsv_filepath: Path to the TSV file.

  Returns:
    A list of (timestamp_s, key_content) tuples.
  """
  column_order, has_header = elan_process_curated.infer_columns(tsv_filepath)
  rows = elan_process_curated.load_rows(
      tsv_filepath, column_order, has_header=has_header)
  timestamps_s = []
  key_contents = []
  for t_begin, t_end, tier, content in rows:
    if tier != tsv_data.SPEECH_TRANSCRIPT_TIER:
      continue
    timestamps_s.append(float(t_begin))
    key_contents.append(content)
  return list(zip(timestamps_s, key_contents))


def remove_markups(input_str):
  """Removes redaction and BackgroundSpeech markups."""
  redacted_segments = parse_redacted_segments(input_str)
  for begin, end, _, redacted_text, _ in reversed(redacted_segments):
    input_str = input_str[:begin] + redacted_text + input_str[end:]
  input_str = re.sub(_BACKGROUND_SPEECH_TAG_REGEX, "", input_str)
  return input_str


def get_utterance_id(index):
  """Get a string utterance ID.

  Args:
    index: The index as an integer, 1-based.

  Returns:
    The utterance string.
  """
  return "[U%d]" % index


def extract_speaker_tag(transcript):
  """Extract speaker tag, tag type, and tag_value."""
  match = re.match(_SPEECH_TRANSCRIPT_CONTENT_REGEX, transcript.strip())
  if not match:
    raise ValueError(
        "Invalid SpeechTranscripts content: '%s'. "
        "Make sure to add Speaker or SpeakerTTS tag at the end "
        "(e.g., '[Speaker:John]')" % transcript)
  speaker_tag, tag_type, tag_value = match.groups()
  return speaker_tag, tag_type, tag_value


def extract_speech_content(transcript):
  """Extract speech content from a transcript.

  Discarding utterance ID and speaker ID (if any).
  """
  match = re.search(_UTTERANCE_ID_REGEX, transcript)
  if match:
    return transcript[:match.span()[0]].strip()
  match = re.search(_SPEAKER_ID_REGEX, transcript)
  if match:
    return transcript[:match.span()[0]].strip()
  return transcript.strip()


def parse_utterance_id(transcript, expected_counter=None):
  """Extracts the utterance ID from a transcript."""
  match = re.search(_UTTERANCE_ID_REGEX, transcript)
  if not match:
    return None
  match_begin, match_end = match.span()
  utterance_id_with_brackets = transcript[match_begin : match_end]
  if expected_counter is not None:
    assert utterance_id_with_brackets == get_utterance_id(expected_counter)
  utterance_id = utterance_id_with_brackets[1:-1]
  return utterance_id_with_brackets, utterance_id


def _parse_time_string(time_str):
  time_str = time_str.strip()
  base_time = ("2000-01-01T00:00:00.000" if ("." in time_str)
               else "2000-01-01T00:00:00")
  time_format = (_DUMMY_DATETIME_FORMAT_WITH_MILLIS if ("." in time_str)
                 else _DUMMY_DATETIME_FORMAT_NO_MILLIS)
  t0 = datetime.strptime(base_time, time_format)
  t1 = datetime.strptime("2000-01-01T" + time_str, time_format)
  dt = t1 - t0
  return dt.seconds + dt.microseconds / 1e6


def parse_time_range(tag):
  original_tag = tag
  if tag.count("-") != 1:
    raise ValueError(
        "Invalid redaction tag with time range: '%s'" % original_tag)
  index_hyphen = tag.index("-")
  if index_hyphen == 0:
    raise ValueError(
        "Invalid redaction tag with time range: '%s'" % original_tag)
  tbegin_str = tag[:index_hyphen]
  tend_str = tag[index_hyphen + 1:]
  tbegin = _parse_time_string(tbegin_str)
  tend = _parse_time_string(tend_str)
  if tend <= tbegin:
    raise ValueError(
        "Begin and end time out of order in tag: '%s'" % original_tag)
  return tbegin, tend


def parse_redacted_segments(transcript):
  """Given an utterance transcript, parse all segments with redaction.

  Args:
    transcript: The transcript of an utterance, as a string.

  Returns:
    A list of (begin, end, redaction_tag, redacted_text, (tbegin, tend))
      tuples, wherein,
      - begin is the beginning index of the redacted segment in the input
        string.
      - end is the ending index (exclusive).
      - redaction_tag is the name of the redaction tag, e.g., RedactedSensitive.
      - redacted_text is the text body of the redacted text.
      - (tbegin, tend) is the optional keystroke time range, which is applicable
        only to speech utterance from AAC user's TTS. If not applicable, this is
        None.
  """
  output = []
  offset = 0
  while True:
    if "<Redacted" not in transcript:
      break
    begin = transcript.index("<Redacted")
    if ">" not in transcript[begin:]:
      raise ValueError("Invalid redaction syntax in %s" % transcript)
    begin_tag = transcript[begin:transcript.index(">") + 1]
    tag_tokens = begin_tag[1:-1].split(" ")
    redaction_tag = tag_tokens.pop(0)
    t_span = None
    for token in tag_tokens:
      if token.count("=") != 1:
        raise ValueError("Invalid syntax in tag: %s" % begin_tag)
      attr_type, attr_value = token.split("=")
      if not (attr_value.startswith("\"") and attr_value.endswith("\"")):
        raise ValueError(
            "Invalid syntax (missing quotes) in tag: %s" % begin_tag)
      if attr_type == "time":
        t_span = parse_time_range(attr_value[1:-1])
      else:
        raise ValueError(
            "Unsupported attribute type %s in tag %s" % (attr_type, begin_tag))
    end_tag = "</%s>" % redaction_tag
    if end_tag not in transcript[begin:]:
      raise ValueError(
          "Cannot find closing tag '%s' in '%s'" % (end_tag, transcript))
    end_tag_index = transcript[begin:].index(end_tag)
    if end_tag_index < len(begin_tag):
      raise ValueError("Invalid tag syntax in: %s" % transcript)
    end = begin + end_tag_index + len(end_tag)
    redacted_text = transcript[begin + len(begin_tag):begin + end_tag_index]
    output.append(
        (begin + offset, end + offset, redaction_tag, redacted_text, t_span))
    offset += end
    transcript = transcript[end:]
  return output


def summarize_speech_content(transcript, hypothesis_transcript=None):
  """Extract the speech content from a transcript.

  Tags for redacted segments are removed before commuting the summary metrics.

  Args:
    transcript: Transcript as a string. Assumes that transcript is
      either from the original merged.tsv file or the curation result
      (curated.tsv), and does *not* contain redaction masks. It can
      contain utterance IDs (e.g., "[U23]") and speaker IDs
      (e.g., "[Speaker:Sean]"), which are ignored during the summarization.
    hypothesis_transcript: The hypothesis truth phrase as a string (e.g.,
      from ASR). If provided, will cause the "wer" field to be populated in the
      output.

  Returns:
    Summaries about the speech content of the transcript as a dict.

  Raises:
    ValueError, if there are any redaction masks.
  """
  content = extract_speech_content(transcript)
  if re.search(_REDACTION_MASK_REGEX, content):
    raise ValueError("Found redaction mask(s) in transcript: %s" % transcript)
  # Remove the redaction tags.
  redacted_segments = parse_redacted_segments(content)
  for begin, end, _, redacted_text, _ in reversed(redacted_segments):
    content = content[:begin] + redacted_text + content[end:]
  tokens = nlp.tokenize(content)
  pos_tags = [tag for _, tag in nlp.pos_tag(tokens)]
  output = {
      "char_length": len(content),
      "num_tokens": len(tokens),
      "token_lengths": [len(token) for token in tokens],
      "pos_tags": pos_tags,
  }
  if hypothesis_transcript is not None:
    output["wer"] = wer(content, hypothesis_transcript)
  return output


JIWER_TRANSFORM = jiwer.Compose([
    jiwer.RemovePunctuation(),
    jiwer.RemoveMultipleSpaces(),
    jiwer.Strip(),
    jiwer.SentencesToListOfWords(),
    jiwer.RemoveEmptyStrings()
])


def wer(ref_string, string):
  ref_speech_content = extract_speech_content(ref_string)
  speech_content = extract_speech_content(string)
  return jiwer.wer(
      ref_speech_content,
      speech_content,
      truth_transform=JIWER_TRANSFORM,
      hypothesis_transform=JIWER_TRANSFORM)


def wer_measures(ref_string, string):
  ref_speech_content = extract_speech_content(ref_string)
  speech_content = extract_speech_content(string)
  if not ref_speech_content:
    measures = {}
  else:
    measures = jiwer.compute_measures(
        ref_speech_content,
        speech_content,
        truth_transform=JIWER_TRANSFORM,
        hypothesis_transform=JIWER_TRANSFORM)
  measures["truth_length"] = len(ref_speech_content)
  measures["hypothesis_length"] = len(speech_content)
  return measures
