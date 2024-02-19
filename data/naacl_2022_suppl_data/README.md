# Supplemental Data for "Context-Aware Abbreviation Expansion Using Large Language Models"

Presented at NAACL 2022:

Shanqing Cai, Subhashini Venugopalan, Katrin Tomanek, Ajit Narayanan, Meredith
Morris, and Michael Brenner. 2022. Context-Aware Abbreviation Expansion Using
Large Language Models. In Proceedings of the 2022 Conference of the North
American Chapter of the Association for Computational Linguistics: Human
Language Technologies, pages 1261–1275, Seattle, United States. Association
for Computational Linguistics.

- https://aclanthology.org/2022.naacl-main.91/
- https://arxiv.org/abs/2205.03767

## The Turk Dialogues Corrected (TDC) dataset

The Turk Dialogues dataset is originally described in

Vertanen, K. (2017, October). Towards improving predictive aac using
crowdsourced dialogues and partner context. In Proceedings of the 19th
International ACM SIGACCESS Conference on Computers and Accessibility
(pp. 347-348).

We downloaded the original data from
https://www.keithv.com/data/turk-dialogues.txt

The file `turk_dialogues_corrections.txt` contains the per-line
corrections in the `sed` format.

The Python script `correct_turk_dialogues.py` can be used to
apply the corrections on the original dataset, which should be downloaded
manually prior to running the script.

## DailyDialog dataset deduplication

The DailyDialog dataset is originally described in

Li, Y., Su, H., Shen, X., Li, W., Cao, Z., & Niu, S. (2017). Dailydialog:
A manually labelled multi-turn dialogue dataset. arXiv preprint
arXiv:1710.03957.

The file `daily_dialog_deduplications.csv` contains the list of
dialogs in its validation (which we refer to as "dev" in the paper)
and test splits that are identical or nearly identical to dialogs in the
train split of the dataset.

