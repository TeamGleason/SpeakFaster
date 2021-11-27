using FlacBox;
using NAudio.Wave;
using System;
using System.IO;

namespace SpeakFasterObserver
{
    class AudioInput
    {
        private static readonly int AUDIO_NUM_CHANNELS = 1;
        private static readonly int AUDIO_BITS_PER_SAMPLE = 16;
        private static readonly int AUDIO_SAMPLE_RATE_HZ = 16000;

        private WaveIn waveIn = null;
        private string flacFilePath = null;
        private FileStream flacStream = null; 
        private FlacWriter flacWriter = null;
        private int[] buffer = null;
        private volatile bool isRecording = false;
        private static readonly object flacLock = new object();
        // For speech recognition, diarization, and other real-time analyses 
        // on the audio input stream. Currently it is disabled by default. To
        // enable it, change useAudioAsr to true and make sure that the Google
        // Cloud credentials for authentication are set properly. For details,
        // see:
        // https://cloud.google.com/speech-to-text/docs/libraries#setting_up_authentication
        private AudioAsr audioAsr;
        private readonly bool useAudioAsr = false;

        public AudioInput() {}

        /**
         * Start recording audio waveform from the built-in microphone.
         * 
         * Creates a new InProgress .flac file to save the data to.
         */
        public void StartRecordingFromMicrophone(string flacPath)
        {
            if (isRecording)
            {
                return;
            }
            SetNewFlacPath(flacPath);
            WaveFormat waveFormat = new(AUDIO_SAMPLE_RATE_HZ, AUDIO_NUM_CHANNELS);
            waveIn = new WaveIn
            {
                WaveFormat = waveFormat
            };
            if (useAudioAsr)
            {
                audioAsr = new AudioAsr(waveFormat);
            }
            if (waveIn.WaveFormat.BitsPerSample != AUDIO_BITS_PER_SAMPLE)
            {
                // TODO(#64): Handle this exception add the app level.
                throw new NotSupportedException(
                    $"Expected wave-in bits per sample to be {AUDIO_BITS_PER_SAMPLE}, " +
                    $"but got {waveIn.WaveFormat.BitsPerSample}");
            }
            waveIn.DataAvailable += new EventHandler<WaveInEventArgs>(WaveDataAvailable);
            waveIn.StartRecording();
            isRecording = true;
        }

        /**
         * Stops any ongoing recording from microphone.
         * 
         * If a current InProgress .flac exists. Rename it to make it final.
         */
        public void StopRecordingFromMicrophone()
        {
            if (!isRecording)
            {
                return;
            }
            waveIn.StopRecording();
            MaybeEndCurrentFlacWriter();
            isRecording = false;
        }

        private void WaveDataAvailable(object sender, WaveInEventArgs e)
        {
            lock (flacLock)
            {
                if (buffer == null || buffer.Length != e.Buffer.Length / 2)
                {
                    // Reuse the buffer whenever we can.
                    buffer = new int[e.Buffer.Length / 2];
                }
                for (int i = 0; i < e.Buffer.Length; i += 2)
                {
                    buffer[i / 2] = BitConverter.ToInt16(e.Buffer, i);
                }
                MaybeCreateFlacWriter();
                if (flacWriter != null)
                {
                    flacWriter.WriteSamples(buffer);
                }
            }
            if (audioAsr != null)
            {
                audioAsr.AddSamples(e.Buffer, e.BytesRecorded);
            }
        }

        /**
         * Marks the current InProgress .flac file final and starts a new
         * InProgress .flac file.
         */
        public void RotateFlacWriter()
        {
            MaybeEndCurrentFlacWriter();
        }

        /** Sets the path to a new flac file. */
        public void SetNewFlacPath(string flacPath)
        {
            lock (flacLock)
            {
                flacFilePath = flacPath;
            }
        }

        /**
         * If a FlacWriter object currently exists, stops it and removes the
         * InProgress suffix from its file name.
         */
        private void MaybeEndCurrentFlacWriter()
        {
            lock (flacLock)
            {
                if (flacWriter == null)
                {
                    return;
                }
                flacWriter.EndStream();
                flacStream.Close();
                File.Move(
                    flacFilePath,
                    FileNaming.RemoveInProgressSuffix(flacFilePath));
                flacFilePath = null;
                flacStream = null;
                flacWriter = null;
            }
        }

        /** Creates a FlacWriter object if none currently exists. */
        private void MaybeCreateFlacWriter()
        {
            if (flacFilePath == null)
            {
                return;
            }
            if (flacWriter != null)
            {
                return;
            }
            flacFilePath = FileNaming.AddInProgressSuffix(flacFilePath);
            flacStream = File.Create(flacFilePath);
            flacWriter = new FlacWriter(flacStream);
            FlacStreaminfo streamInfo = new()
            {
                ChannelsCount = AUDIO_NUM_CHANNELS,
                BitsPerSample = AUDIO_BITS_PER_SAMPLE,
                SampleRate = AUDIO_SAMPLE_RATE_HZ,
                MaxBlockSize = AUDIO_SAMPLE_RATE_HZ,
            };
            flacWriter.StartStream(streamInfo);
        }
    }
}
