"""Module for processing curated free-form text."""

import transcript_lib


def process_curated_freeform_text(text):
  if not text.strip():
    raise ValueError("Empty text")
  summary = transcript_lib.summarize_speech_content(text)
  redacted_segments = transcript_lib.parse_redacted_segments(text)
  redacted_text = text
  for begin, end, redaction_tag, _, tspan in reversed(redacted_segments):
    if tspan:
      raise ValueError(
          "time range is not allowed in the redaction tags for free-form text")
    redaction_mask = "[%s]" % redaction_tag
    redacted_text = redacted_text[:begin] + redaction_mask + redacted_text[end:]
  return summary, redacted_text
