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
        // How long each output audio file is (unit: second).
        private static int PER_FILE_DURATION_SEC = 10;  // TODO(cais): Change to 60.

        private WaveIn waveIn = null;
        private bool isRecording = false;  // TODO(cais): Thread safety?
        private int[] buffer = null;
        private int bufferPointer = 0;

        public AudioInput() {}
        public void StartRecordingFromMicrophone()
        {
            if (isRecording)
            {
                throw new Exception("Already recording from microphone");
            }
            waveIn = new WaveIn();
            waveIn.WaveFormat = new WaveFormat(AUDIO_SAMPLE_RATE_HZ, AUDIO_NUM_CHANNELS);
            if (waveIn.WaveFormat.BitsPerSample != AUDIO_BITS_PER_SAMPLE)
            {
                throw new NotSupportedException(
                    String.Format(
                        "Expected wave-in bits per sample to be {0}, but got {1}",
                        AUDIO_BITS_PER_SAMPLE, waveIn.WaveFormat.BitsPerSample));
            }
            waveIn.DataAvailable += new EventHandler<WaveInEventArgs>(WaveDataAvailable);
            // TODO(cais): Do not hard code path. Remove wav file writing.
            //waveFileWriter = new WaveFileWriter(@"C:\Temp\Test0001.wav", waveIn.WaveFormat);
            buffer = new int[AUDIO_SAMPLE_RATE_HZ * PER_FILE_DURATION_SEC];
            bufferPointer = 0;
            waveIn.StartRecording();
            isRecording = true;
        }
        public void StopRecordingFromMicrophone()
        {
            if (!isRecording)
            {
                throw new Exception("Not recording from microphone");
            }
            waveIn.StopRecording();
            isRecording = false;
        }

        private void WaveDataAvailable(object sender, WaveInEventArgs e)
        {
            //int sumSquares = 0;  // TODO(cais): Clean up.
            for (int i = 0; i < e.Buffer.Length; i += 2)
            {
                if (bufferPointer >= buffer.Length)
                {
                    WriteBufferToFlacFile();
                    Debug.WriteLine("Wrote to .flac file");
                    bufferPointer = 0;
                }
                buffer[bufferPointer++] = BitConverter.ToInt16(e.Buffer, i);
            }
            //if (waveFileWriter != null)  //TODO(cais): Remove this.
            //{
            //    waveFileWriter.Write(e.Buffer, 0, e.BytesRecorded);
            //    waveFileWriter.Flush();
            //}
        }

        private void WriteBufferToFlacFile()
        {
            using (var flacStream = File.Create(@"C:\Temp\Test0001.flac"))
            {
                FlacWriter flacWriter = new FlacWriter(flacStream);
                FlacStreaminfo streamInfo = new FlacStreaminfo();
                streamInfo.ChannelsCount = AUDIO_NUM_CHANNELS;
                streamInfo.BitsPerSample = AUDIO_BITS_PER_SAMPLE;
                streamInfo.SampleRate = AUDIO_SAMPLE_RATE_HZ;
                streamInfo.TotalSampleCount = AUDIO_SAMPLE_RATE_HZ * PER_FILE_DURATION_SEC;
                streamInfo.MaxBlockSize = AUDIO_SAMPLE_RATE_HZ;
                flacWriter.StartStream(streamInfo);
                flacWriter.WriteSamples(buffer);
                flacWriter.EndStream();
            }
        }
    }
}
