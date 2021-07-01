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

        private readonly string dataDir;
        private WaveIn waveIn = null;
        private string flacFilePath = null;
        private FileStream flacStream = null; 
        private FlacWriter flacWriter = null;
        private int[] buffer = null;
        private bool isRecording = false;  // TODO(cais): Thread safety?
        private static readonly object flacLock = new object();

        public AudioInput(string dataDir) {
            this.dataDir = dataDir;
        }

        public void StartRecordingFromMicrophone()
        {
            if (isRecording)
            {
                return;
            }
            waveIn = new WaveIn
            {
                WaveFormat = new WaveFormat(AUDIO_SAMPLE_RATE_HZ, AUDIO_NUM_CHANNELS)
            };
            if (waveIn.WaveFormat.BitsPerSample != AUDIO_BITS_PER_SAMPLE)
            {
                throw new NotSupportedException(
                    $"Expected wave-in bits per sample to be {AUDIO_BITS_PER_SAMPLE}, " +
                    $"but got {waveIn.WaveFormat.BitsPerSample}");
            }
            CreateFlacWriter();
            waveIn.DataAvailable += new EventHandler<WaveInEventArgs>(WaveDataAvailable);
            waveIn.StartRecording();
            isRecording = true;
        }

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
                flacWriter.WriteSamples(buffer);
            }
        }

        public void RotateFlacWriter()
        {
            MaybeEndCurrentFlacWriter();
            CreateFlacWriter();
        }

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
                    FileNaming.removeInProgressSuffix(flacFilePath));
                flacFilePath = null;
                flacStream = null;
                flacWriter = null;
            }
        }

        private void CreateFlacWriter()
        {
            lock (flacLock)
            {
                if (flacWriter != null)
                {
                    return;
                }
                flacFilePath = flacFilePath = FileNaming.addInProgressSuffix(
                        FileNaming.getMicWavInFilePath(dataDir));
                flacStream = File.Create(flacFilePath);
                flacWriter = new FlacWriter(flacStream);
                FlacStreaminfo streamInfo = new FlacStreaminfo
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
}
