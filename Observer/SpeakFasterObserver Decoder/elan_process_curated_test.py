"""Unit tests for elan_process_curated."""
import os
import shutil

import tensorflow as tf

import elan_process_curated


class LoadSpeakerMapTest(tf.test.TestCase):

  def testLoadSpeakerMap_success(self):
    speaker_map_tsv_path = os.path.join("testdata", "speaker_map.tsv")
    realname_to_pseudonym = elan_process_curated.load_speaker_map(
        speaker_map_tsv_path)
    self.assertItemsEqual(realname_to_pseudonym, {
        "Sean": "User001",
        "Sherry": "Partner001",
        "Tim": "Partner002",
        "Jenny": "Partner003",
        "Mike": "Partner004",
        "Danielle": "Partner005",
    })

  def testLoadSpeakerMap_duplicateRealNamesRaisesValueError(self):
    original_speaker_map_tsv_path = os.path.join("testdata", "speaker_map.tsv")
    modified_speaker_map_tsv_path = os.path.join(
        self.get_temp_dir(), "modified_speaker_map.tsv")
    shutil.copy(original_speaker_map_tsv_path, modified_speaker_map_tsv_path)
    with open(modified_speaker_map_tsv_path, "a") as f:
      f.write("Danielle\tPartner006\n")
    with self.assertRaisesRegex(
        ValueError, r"Duplicate real name.*modified.*tsv: Danielle"):
      elan_process_curated.load_speaker_map(modified_speaker_map_tsv_path)

  def testLoadSpeakerMap_duplicatePseudonymRaisesValueError(self):
    original_speaker_map_tsv_path = os.path.join("testdata", "speaker_map.tsv")
    modified_speaker_map_tsv_path = os.path.join(
        self.get_temp_dir(), "modified_speaker_map.tsv")
    shutil.copy(original_speaker_map_tsv_path, modified_speaker_map_tsv_path)
    with open(modified_speaker_map_tsv_path, "a") as f:
      f.write("John\tPartner002\n")
    with self.assertRaisesRegex(
        ValueError, r"Duplicate pseudonym.*modified.*tsv: Partner002"):
      elan_process_curated.load_speaker_map(modified_speaker_map_tsv_path)


class InferColumnsTest(tf.test.TestCase):

  def testInferColumns_success(self):
    tsv_path = os.path.join("testdata", "curated_1.tsv")
    column_order = elan_process_curated.infer_columns(tsv_path)
    self.assertEqual(column_order, (1, 2, 0, 3))

  def testCheckTierNames_detectsWrongTierName(self):
    tsv_path = os.path.join("testdata", "curated_with_wrong_tier_name.tsv")
    with self.assertRaisesRegex(
        ValueError, "Cannot find a tier column.*invalid tier names."):
      elan_process_curated.infer_columns(tsv_path)


if __name__ == "__main__":
  tf.test.main()
