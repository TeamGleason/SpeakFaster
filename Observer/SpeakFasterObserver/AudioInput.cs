using FlacBox;
using NAudio.Wave;
using System;
using System.IO;
using System.Diagnostics;

namespace SpeakFasterObserver
{
    class AudioInput
    {
        private static int AUDIO_NUM_CHANNELS = 1;
        private static int AUDIO_BITS_PER_SAMPLE = 16;
        private static int AUDIO_SAMPLE_RATE_HZ = 16000;
        // NOTE: Due to limited buffer size, using a write timer of with a
        // period of 120 s or greater will cause data loss, which will throw an
        // exception.
        private static int MAX_BUFFER_LENGTH = AUDIO_SAMPLE_RATE_HZ * 120;

        private WaveIn waveIn = null;
        private bool isRecording = false;  // TODO(cais): Thread safety?
        private int[] buffer = null;
        private int bufferPointer = 0;
        private static readonly object lockObj = new object();

        public AudioInput() {}
        public void StartRecordingFromMicrophone()
        {
            if (isRecording)
            {
                return;
            }
            waveIn = new WaveIn();
            waveIn.WaveFormat = new WaveFormat(AUDIO_SAMPLE_RATE_HZ, AUDIO_NUM_CHANNELS);
            if (waveIn.WaveFormat.BitsPerSample != AUDIO_BITS_PER_SAMPLE)
            {
                throw new NotSupportedException(
                    $"Expected wave-in bits per sample to be {AUDIO_BITS_PER_SAMPLE}, " +
                    $"but got {waveIn.WaveFormat.BitsPerSample}");
            }
            waveIn.DataAvailable += new EventHandler<WaveInEventArgs>(WaveDataAvailable);
            buffer = new int[MAX_BUFFER_LENGTH];
            bufferPointer = 0;
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
            isRecording = false;
        }

        private void WaveDataAvailable(object sender, WaveInEventArgs e)
        {
            lock (lockObj)
            {
                for (int i = 0; i < e.Buffer.Length; i += 2)
                {
                    if (bufferPointer >= buffer.Length)
                    {
                        throw new OverflowException("Audio buffer overflowed");
                    }
                    buffer[bufferPointer++] = BitConverter.ToInt16(e.Buffer, i);
                }
            }
        }

        public void WriteBufferToFlacFile(string flacFilePath)
        {
            lock (lockObj)
            {
                if (bufferPointer == 0)
                {
                    // No data to write.
                    return;
                }
                using (var flacStream = File.Create(flacFilePath))
                {
                    FlacWriter flacWriter = new FlacWriter(flacStream);
                    FlacStreaminfo streamInfo = new FlacStreaminfo();
                    streamInfo.ChannelsCount = AUDIO_NUM_CHANNELS;
                    streamInfo.BitsPerSample = AUDIO_BITS_PER_SAMPLE;
                    streamInfo.SampleRate = AUDIO_SAMPLE_RATE_HZ;
                    streamInfo.TotalSampleCount = bufferPointer;
                    streamInfo.MaxBlockSize = AUDIO_SAMPLE_RATE_HZ;
                    flacWriter.StartStream(streamInfo);
                    int[] samples = new int[bufferPointer];
                    Array.Copy(buffer, samples, bufferPointer);
                    flacWriter.WriteSamples(samples);
                    flacWriter.EndStream();
                }
                bufferPointer = 0;
            }
        }
    }
}
