## Python environment

It is highly recommended that you do Python development in a virtualenv.

In install the required dependencies in the virtualenv, do:

```sh
python install -r requirements.txt
```

## Postprocessing

### Audio Event Classification

We use [YAMNet](https://tfhub.dev/google/lite-model/yamnet/tflite/1)
to extract audio event labels from input audio files.

Command line example:

```sh
python extract_audio_events.py testdata/test_audio_1.wav /tmp/audio_events.tsv
```

## Running unit tests in this folder

Use:

```sh
./run_tests.sh
```
