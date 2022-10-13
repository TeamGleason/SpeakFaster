"""Unit test for the transcript_lib module."""

import tensorflow as tf

import transcript_lib


class RemoveRedactionMarkupsTest(tf.test.TestCase):

  def testRemovesSinglePairWithTimeAttribute(self):
    input_str = "Hi <RedactedSensitive time=\"00:00:00-00:00:10\">Bob</RedactedSensitive> how are you"
    output = transcript_lib.remove_markups(input_str)
    self.assertEqual(output,  "Hi Bob how are you")

  def testRemovesSinglePairWithoutTimeAttribute(self):
    input_str = "Hi <RedactedName>Bob </RedactedName> how are you"
    output = transcript_lib.remove_markups(input_str)
    self.assertEqual(output,  "Hi Bob  how are you")

  def testRemovesTwoPairs(self):
    input_str = "Hi <RedactedName>Bob</RedactedName> I am <RedactedSensitive>coughing</RedactedSensitive>"
    output = transcript_lib.remove_markups(input_str)
    self.assertEqual(output,  "Hi Bob I am coughing")

  def testRemoveWholePhraseTag(self):
    input_str = "<RedactedSensitive>I have coughs</RedactedSensitive>"
    output = transcript_lib.remove_markups(input_str)
    self.assertEqual(output,  "I have coughs")

  def testReturnsStringAsIsIfNoRedactionTags(self):
    input_str = "Have a good day."
    output = transcript_lib.remove_markups(input_str)
    self.assertEqual(output,  "Have a good day.")

  def testRemovesSingleBackgroundSpeechTag(self):
    input_str = " [BackgroundSpeech] Have a good day."
    output = transcript_lib.remove_markups(input_str)
    self.assertEqual(output,  "  Have a good day.")

  def testRemovesMultipleBackgroundSpeechTags(self):
    input_str = " [BackgroundSpeech] Have a good day. [BackgroundSpeech]"
    output = transcript_lib.remove_markups(input_str)
    self.assertEqual(output,  "  Have a good day. ")

  def testRemovesRedactionAndBackgroundSpeechTag(self):
    input_str = "[BackgroundSpeech]Hi <RedactedSensitive time=\"00:00:00-00:00:10\">Bob</RedactedSensitive> how are you"
    output = transcript_lib.remove_markups(input_str)
    self.assertEqual(output,  "Hi Bob how are you")



class GetUtteranceIdTest(tf.test.TestCase):

  def testReturnsCorrect(self):
    self.assertEqual(transcript_lib.get_utterance_id(42), "[U42]")


class ExtractSpeakerTagTest(tf.test.TestCase):

  def testExtractsTagWithSpaceAndNumberWithoutColon(self):
    tag, tag_type, tag_value = transcript_lib.extract_speaker_tag(
        "Good morning [U1] [Speaker #2]")
    self.assertEqual(tag, "[Speaker #2]")
    self.assertEqual(tag_type, "Speaker")
    self.assertEqual(tag_value, "#2")

  def testExtractsTagWithSpaceAndNumberWithColon(self):
    tag, tag_type, tag_value = transcript_lib.extract_speaker_tag(
        "Good morning [U1] [Speaker: #1]")
    self.assertEqual(tag, "[Speaker: #1]")
    self.assertEqual(tag_type, "Speaker")
    self.assertEqual(tag_value, "#1")

  def testExtractsTagWithRealNameTag(self):
    tag, tag_type, tag_value = transcript_lib.extract_speaker_tag(
        "Good morning [U1] [SpeakerTTS:Sean]")
    self.assertEqual(tag, "[SpeakerTTS:Sean]")
    self.assertEqual(tag_type, "SpeakerTTS")
    self.assertEqual(tag_value, "Sean")

  def testExtractsTagWithPseudonymTag(self):
    tag, tag_type, tag_value = transcript_lib.extract_speaker_tag(
        "Good morning [U1] [SpeakerTTS:User001]")
    self.assertEqual(tag, "[SpeakerTTS:User001]")
    self.assertEqual(tag_type, "SpeakerTTS")
    self.assertEqual(tag_value, "User001")

  def testExtractsTagWithPseudonymTag(self):
    tag, tag_type, tag_value = transcript_lib.extract_speaker_tag(
        "Good morning [U1] [SpeakerTTS:John_D]")
    self.assertEqual(tag, "[SpeakerTTS:John_D]")
    self.assertEqual(tag_type, "SpeakerTTS")
    self.assertEqual(tag_value, "John_D")


class ExtractSpeechContentTest(tf.test.TestCase):

  def testExtractsContent_transcriptWithNoUtteranceIdOrSpeakerId(self):
    content = transcript_lib.extract_speech_content(
        "Hi. What nice weather. ")
    self.assertEqual(content, "Hi. What nice weather.")

  def testExtractsContent_transcriptWithUtteranceIdAndSpeakerId(self):
    content = transcript_lib.extract_speech_content(
        "Hi. What nice weather. [U3] [Speaker: 1]")
    self.assertEqual(content, "Hi. What nice weather.")

  def testExtractsContent_transcriptWithOnlySpeakerId(self):
    content = transcript_lib.extract_speech_content(
        "Hi. What nice weather.[Speaker: 1]")
    self.assertEqual(content, "Hi. What nice weather.")


class ParseUtteranceIdTest(tf.test.TestCase):

  def testParsingSucceeds_hasValidUtteranceId(self):
    utter_id_with_brakets, utter_id = transcript_lib.parse_utterance_id(
        "Hi, there [U2] [Speaker: 1]", expected_counter=2)
    self.assertEqual(utter_id_with_brakets, "[U2]")
    self.assertEqual(utter_id, "U2")

  def testParsingThrowsAssertionError_expectedCounterNotMet(self):
    with self.assertRaises(AssertionError):
      utter_id_with_brakets, utter_id = transcript_lib.parse_utterance_id(
          "Hi, there [U2] [Speaker: 1]", expected_counter=3)

  def testParsingReturnsNone_hasNoValidUtteranceId(self):
    output = transcript_lib.parse_utterance_id("Hi, there [Speaker:Sean]")
    self.assertIsNone(output)


class ParseTimeRangeTest(tf.test.TestCase):

  def testParseTimeRange_noMilliseconds(self):
    tbegin, tend = transcript_lib.parse_time_range("13:00:48-13:01:45")
    self.assertEqual(tbegin, 13 * 3600 + 48)
    self.assertEqual(tend, 13 * 3600 + 60 + 45)

  def testParseTimeRange_withMilliseconds(self):
    tbegin, tend = transcript_lib.parse_time_range("13:00:48.123-13:01:45.789")
    self.assertEqual(tbegin, 13 * 3600 + 48 + 0.123)
    self.assertEqual(tend, 13 * 3600 + 60 + 45 + 0.789)

  def testParseTimeRange_wrongOrderRaisesValueError(self):
    with self.assertRaisesRegex(ValueError, r"Begin and end time out of order"):
      transcript_lib.parse_time_range("13:00:48.123-12:59:45.789")
    with self.assertRaisesRegex(ValueError, r"Begin and end time out of order"):
      transcript_lib.parse_time_range("13:00:48-12:59:45")
    with self.assertRaisesRegex(ValueError, r"Begin and end time out of order"):
      transcript_lib.parse_time_range("13:00:00.500-13:00:00")

  def testParseTimeRange_invalidFormat_raisesValueError(self):
    with self.assertRaises(ValueError):
      transcript_lib.parse_time_range("")
    with self.assertRaises(ValueError):
      transcript_lib.parse_time_range("00:01:23-")
    with self.assertRaises(ValueError):
      transcript_lib.parse_time_range("00:01:23- ")
    with self.assertRaises(ValueError):
      transcript_lib.parse_time_range("-00:01:23")
    with self.assertRaises(ValueError):
      transcript_lib.parse_time_range("-00:01:23")


class ParseRedactedSegmentsTest(tf.test.TestCase):

  def testParseZeroRedactedSegments(self):
    input_string = "I had a great day [Speaker:Tim]"
    segments = transcript_lib.parse_redacted_segments(input_string)
    self.assertEqual(segments, [])

  def testParseOneRedactedSegmentSuccessfully_noTimeSpan(self):
    input_string = "Who is <RedactedName>Ellis</RedactedName>? [Speaker:Tim]"
    segments = transcript_lib.parse_redacted_segments(input_string)
    self.assertEqual(segments, [(7, 41, "RedactedName", "Ellis", None)])

  def testParseTwoRedactedSegmentsSuccessfully_noTimeSpan(self):
    input_string = (
        "Who are <RedactedName>Ellis</RedactedName>, "
        "who lives in <RedactedInfo>130 Pine St</RedactedInfo>? [Speaker:Tim]")
    segments = transcript_lib.parse_redacted_segments(input_string)
    self.assertEqual(
        segments, [(8, 42, "RedactedName", "Ellis", None),
                   (57, 97, "RedactedInfo", "130 Pine St", None)])

  def testParseOneRedactedSegment_withTimeSpanSecondsPrecision(self):
    input_string = (
        "Who is <RedactedName time=\"00:01:23-00:01:53\">Ellis</RedactedName>?"
        " [Speaker:Tim]")
    segments = transcript_lib.parse_redacted_segments(input_string)
    self.assertEqual(
        segments, [(7, 66, "RedactedName", "Ellis", (83.0, 113.0))])

  def testParsOneRedactedSegment_withTimeSpanMillisecondPrecision(self):
    input_string = (
        "Who is <RedactedName time=\"00:01:23.123-00:01:53.234\">"
        "Mr. Miller</RedactedName>? [Speaker:Tim]")
    segments = transcript_lib.parse_redacted_segments(input_string)
    self.assertEqual(
        segments, [(7, 79, "RedactedName", "Mr. Miller", (83.123, 113.234))])

  def testRaisesError_forMissingClosingTag(self):
    input_string = "Who is <RedactedName>Ellis [Speaker:Tim]"
    with self.assertRaisesRegex(ValueError, r"Cannot find closing tag"):
      transcript_lib.parse_redacted_segments(input_string)

  def testRaisesError_forMissingClosingBracket(self):
    input_string = "Who is <RedactedName Ellis</RedactedName> [Speaker:Tim]"
    with self.assertRaisesRegex(ValueError, r"Invalid syntax in tag"):
      transcript_lib.parse_redacted_segments(input_string)

  def testRaisesError_unsupportedAttributeType(self):
    input_string = (
        "Who is <RedactedName location=\"foo\">Ellis</RedactedName>? "
        "[Speaker:Tim]")
    with self.assertRaisesRegex(
        ValueError, r"Unsupported attribute type location"):
      transcript_lib.parse_redacted_segments(input_string)

  def testRaisesReror_invalidAttributeSyntax(self):
    input_string = (
        "Who is <RedactedName time=00:01:23-00:01:54>Ellis</RedactedName>? "
        "[Speaker:Tim]")
    with self.assertRaisesRegex(
        ValueError, r"Invalid syntax \(missing quotes\) in tag"):
      transcript_lib.parse_redacted_segments(input_string)



class SummarizeSpeechContentTest(tf.test.TestCase):

  def testSummarizeSpeechContent_singleSentenceWithoutRedactedSegments(self):
    input_string = "This is a pipe.[U3] [Speaker:Tim]"
    summary = transcript_lib.summarize_speech_content(input_string)
    self.assertEqual(summary, {
        "char_length": len("This is a pipe."),
        "num_tokens": 5,
        "token_lengths": [4, 2, 1, 4, 1],
        "pos_tags": ["DT", "VBZ", "DT", "NN", "."],
    })

  def testSummarizeSpeechContent_singleSentenceWithRedactedSegment(self):
    input_string = (
        "This is a <RedactedSensitive>pipe</RedactedSensitive> [U3] "
        "[Speaker:Tim]")
    summary = transcript_lib.summarize_speech_content(input_string)
    self.assertEqual(summary, {
        "char_length": len("This is a pipe"),
        "num_tokens": 4,
        "token_lengths": [4, 2, 1, 4],
        "pos_tags": ["DT", "VBZ", "DT", "NN"],
    })

  def testSummarizeSpeechContent_singleSentenceWithTwoRedactedSegments(self):
    input_string = (
        "<RedactedName>Jim</RedactedName> gave me a "
        "<RedactedSensitive>pipe</RedactedSensitive> [Speaker:Tim]")
    summary = transcript_lib.summarize_speech_content(input_string)
    self.assertEqual(summary, {
        "char_length": len("Jim gave me a pipe"),
        "num_tokens": 5,
        "token_lengths": [3, 4, 2, 1, 4],
        "pos_tags": ["NNP", "VBD", "PRP", "DT", "NN"],
    })

  def testSummarizeSpeechContent_twoSentencesWithRedactedSegment(self):
    input_string = (
        "What is this? This is a <RedactedSensitive>pipe</RedactedSensitive> [U3] "
        "[Speaker:Tim]")
    summary = transcript_lib.summarize_speech_content(input_string)
    self.assertEqual(summary, {
        "char_length": len("What is this? This is a pipe"),
        "num_tokens": 8,
        "token_lengths": [4, 2, 4, 1, 4, 2, 1, 4],
        "pos_tags": ["WP", "VBZ", "DT", ".", "DT", "VBZ", "DT", "NN"],
    })

  def testRaisesError_ifRedactionMasksAreFound(self):
    input_string = "This is a [RedactedSensitive] [U3] [Speaker:Partner002]"
    with self.assertRaisesRegex(ValueError, r"Found redaction mask"):
      transcript_lib.summarize_speech_content(input_string)


class WerTest(tf.test.TestCase):

  def testWerTranscriptsWithUtteranceIdsAndSpeakerIds(self):
    ref_string = "I like watermelon. [U1] [Speaker:Sean]"
    string = "I like water [U1] [Speaker: 1]"
    self.assertEqual(transcript_lib.wer(ref_string, string), 1 / 3)


class WerMeasuresTest(tf.test.TestCase):

  def testWerMeasuresReturnsZeroWerIgnoringWhitespaceaAndPunc(self):
    ref_string = "Hi Bob."
    asr_string = "Hi  Bob"
    measures = transcript_lib.wer_measures(ref_string, asr_string)
    self.assertEqual(measures["truth_length"], 7)
    self.assertEqual(measures["hypothesis_length"], 7)
    self.assertEqual(measures["wer"], 0)
    self.assertEqual(measures["hits"], 2)
    self.assertEqual(measures["deletions"], 0)
    self.assertEqual(measures["insertions"], 0)
    self.assertEqual(measures["substitutions"], 0)

  def testWerMeasuresWithEmptyTruth(self):
    ref_string = ""
    asr_string = "Hi, Bob"
    measures = transcript_lib.wer_measures(ref_string, asr_string)
    self.assertEqual(measures["truth_length"], 0)
    self.assertEqual(measures["hypothesis_length"], 7)

  def testWerMeasuresWithEmptyTruthAndHypothesis(self):
    ref_string = ""
    asr_string = ""
    measures = transcript_lib.wer_measures(ref_string, asr_string)
    self.assertEqual(measures["truth_length"], 0)
    self.assertEqual(measures["hypothesis_length"], 0)


if __name__ == "__main__":
  tf.test.main()
