"""Unit tests for the freeform_text."""
import tensorflow as tf

import freeform_text


class FreeFormTextTest(tf.test.TestCase):

  def testProcessCuratedFreeFormText_withRedaction(self):
    input_text = """The quick fox jumped over the lazy dog.
The lazy dog belongs to <RedactedName>Mr. Johnson</RedactedName>.
The quick fox then walked away laissez-faire."""
    summary, redacted_text = freeform_text.process_curated_freeform_text(
        input_text)
    self.assertIsInstance(summary, dict)
    self.assertEqual(summary["char_length"], 122)
    self.assertGreater(summary["num_tokens"], 0)
    self.assertIsInstance(summary["token_lengths"], list)
    self.assertTrue(summary["token_lengths"])
    self.assertIsInstance(summary["pos_tags"], list)
    self.assertTrue(summary["pos_tags"])
    self.assertLen(summary["pos_tags"], summary["num_tokens"])
    self.assertEqual(redacted_text, """The quick fox jumped over the lazy dog.
The lazy dog belongs to [RedactedName].
The quick fox then walked away laissez-faire.""")

  def testProcessCuratedFreeFormTask_noRedaction(self):
    input_text = """The quick fox jumped over the lazy dog.
The quick fox then walked away laissez-faire.
"""
    summary, redacted_text = freeform_text.process_curated_freeform_text(
        input_text)
    self.assertIsInstance(summary, dict)
    self.assertEqual(summary["char_length"], 85)
    self.assertGreater(summary["num_tokens"], 0)
    self.assertIsInstance(summary["token_lengths"], list)
    self.assertTrue(summary["token_lengths"])
    self.assertIsInstance(summary["pos_tags"], list)
    self.assertTrue(summary["pos_tags"])
    self.assertLen(summary["pos_tags"], summary["num_tokens"])
    self.assertEqual(redacted_text, """The quick fox jumped over the lazy dog.
The quick fox then walked away laissez-faire.
""")

  def testProcessCuratedFreeFormTask_incorrectTagsRaisesError(self):
    input_text = """The quick fox jumped over the lazy dog.
The lazy dog belongs to <RedactedName>Mr. Johnson</Foo>.
The quick fox then walked away laissez-faire."""
    with self.assertRaises(ValueError):
      freeform_text.process_curated_freeform_text(input_text)

  def testProcessCuratedFreeFormTask_emptyStringRaisesError(self):
    with self.assertRaisesRegex(ValueError, "Empty text"):
      freeform_text.process_curated_freeform_text("")
    with self.assertRaisesRegex(ValueError, "Empty text"):
      freeform_text.process_curated_freeform_text("  ")
    with self.assertRaisesRegex(ValueError, "Empty text"):
      freeform_text.process_curated_freeform_text("\n")
    with self.assertRaisesRegex(ValueError, "Empty text"):
      freeform_text.process_curated_freeform_text("\n\n")



if __name__ == "__main__":
  tf.test.main()
