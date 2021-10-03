"""Module for natural language processing (NLP)."""

import nltk


def init():
  nltk.download("punkt")
  nltk.download("averaged_perceptron_tagger")


def tokenize(input_string):
  return nltk.tokenize.word_tokenize(input_string)


def pos_tag(tokens):
  return nltk.pos_tag(tokens)
