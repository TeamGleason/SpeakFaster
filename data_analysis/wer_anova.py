"""Performs mixed-effect ANOVA on word error rates."""
from absl import app
from absl import flags
import pandas as pd
import pingouin as pg

flags.DEFINE_string("csv_path", None, "Input csv path")

FLAGS = flags.FLAGS


def main(_):
  scripted_wer_df = pd.read_csv(FLAGS.csv_path)
  results = pg.mixed_anova(data=scripted_wer_df,
                 dv="wer",
                 within="is_ae",
                 subject="subject",
                 between="is_one_finger")
  print(results)


if __name__ == "__main__":
  app.run(main)
