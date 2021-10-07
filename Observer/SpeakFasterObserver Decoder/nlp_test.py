"""Unit tests for the NLP module."""
import tensorflow as tf

import nlp


class NlpTest(tf.test.TestCase):

  @classmethod
  def setUpClass(cls):
    nlp.init()

  def testTokenize_singleSentenceWithoutPunctuation(self):
    tokens = nlp.tokenize("This is  a pipe ")
    self.assertEquals(tokens, ["This", "is", "a", "pipe"])

  def testTokenize_singleSentenceWithPunctuation(self):
    tokens = nlp.tokenize("As far as I can see, this is  a pipe made in 1965.")
    self.assertEquals(
        tokens,
        ["As", "far", "as", "I", "can", "see", ",", "this", "is", "a", "pipe",
         "made", "in", "1965."])

  def testTokenize_twoSentencesWithPunctuation(self):
    tokens = nlp.tokenize("What is this?\nThis is a pipe.")
    self.assertEquals(
        tokens, ["What", "is", "this", "?", "This", "is", "a", "pipe", "."])

  def testPosTag_singleSentenceWithPunctuation(self):
    tokens = nlp.tokenize("This is a pipe!")
    tags = nlp.pos_tag(tokens)
    self.assertEqual(
        tags, [("This", "DT"), ("is", "VBZ"), ("a", "DT"), ("pipe", "NN"), ("!", ".")])

  def testPosTag_twoSentencesWithPunctuation(self):
    tokens = nlp.tokenize("What is this?\nThis is a pipe")
    tags = nlp.pos_tag(tokens)
    self.assertEqual(
        tags, [("What", "WP"), ("is", "VBZ"), ("this", "DT"), ("?", "."),
               ("This", "DT"), ("is", "VBZ"), ("a", "DT"), ("pipe", "NN")])


if __name__ == "__main__":
  tf.test.main()
