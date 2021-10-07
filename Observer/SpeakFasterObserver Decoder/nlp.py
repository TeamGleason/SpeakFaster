"""Module for natural language processing (NLP)."""

import nltk
import tensorflow_text as tf_text


def init():
  nltk.download("punkt")
  nltk.download("averaged_perceptron_tagger")


DEFAULT_TOKENIZER_TYPE = "unicode_script"
_tokenizers = dict()


def _create_or_get_tokenizer():
  if DEFAULT_TOKENIZER_TYPE not in _tokenizers:
    _tokenizers[DEFAULT_TOKENIZER_TYPE]  = tf_text.UnicodeScriptTokenizer()
  return _tokenizers[DEFAULT_TOKENIZER_TYPE]


def tokenize(input_string):
  """Tokenize input string into tokens.

  This uses tensorflow_text's default "unicode_script" tokenization method,
  which causes punctuation to be their own separate tokens.
  """
  tokenizer = _create_or_get_tokenizer()
  tokens = tokenizer.tokenize(input_string).numpy()
  return [token.decode('utf-8') for token in tokens]


def pos_tag(tokens):
  return nltk.pos_tag(tokens)
