using Google.Cloud.Speech.V1;
using NAudio.Wave;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

/**
 * For speech recognition, speaker diarization, and potentially other analyses on
 * an audio input stream.
 */
namespace SpeakFasterObserver
{
    class SpeechAnalyzer
    {
        private static readonly float RECOG_PERIOD_SECONDS = 2f;
        private static readonly float STREAMING_RECOG_MAX_DURATION_SECONDS = 4 * 60f;
        private static readonly string LANGUAGE_CODE = "en-US";

        private readonly WaveFormat audioFormat;
        private readonly SpeechClient speechClient;
        private SpeechClient.StreamingRecognizeStream recogStream;
        private BufferedWaveProvider recogBuffer;
        private float cummulativeRecogSeconds;

        public SpeechAnalyzer(WaveFormat audioFormat)
        {
            this.audioFormat = audioFormat;
            recogBuffer = new BufferedWaveProvider(audioFormat);
            speechClient = SpeechClient.Create();
            reInitStreamRecognizer();
        }

        public void addSamples(byte[] samples, int numBytes)
        {
            recogBuffer.AddSamples(samples, 0, numBytes);
            float bufferedSeconds = (float) recogBuffer.BufferedBytes / (
                audioFormat.BitsPerSample / 8) / audioFormat.SampleRate;
            if (bufferedSeconds >= RECOG_PERIOD_SECONDS)
            {
                int bufferNumBytes = recogBuffer.BufferedBytes;
                byte[] frameBuffer = new byte[bufferNumBytes];
                recogBuffer.Read(frameBuffer, 0, bufferNumBytes);
                Debug.WriteLine("Sending streaming recog request");  // DEBUG
                try
                {
                    recogStream.WriteAsync(new StreamingRecognizeRequest()
                    {
                        AudioContent = Google.Protobuf.ByteString.CopyFrom(
                            frameBuffer, 0, bufferNumBytes)
                    });
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"Streaming recog exception: {ex.Message}");
                }

                cummulativeRecogSeconds += bufferedSeconds;
                recogBuffer.ClearBuffer();
                if (cummulativeRecogSeconds > STREAMING_RECOG_MAX_DURATION_SECONDS)
                {
                    Debug.WriteLine("Reinitializing recognizer stream");  // DEBUG
                    reInitStreamRecognizer();
                }
            }
        }

        /** (Re-)initializes the Cloud-based streaming speech recognizer. */
        private void reInitStreamRecognizer()
        {
            recogStream = speechClient.StreamingRecognize();
            Debug.WriteLine($"recogStream = {recogStream}");  // DEBUG
            recogStream.WriteAsync(new StreamingRecognizeRequest()
            {
                StreamingConfig = new StreamingRecognitionConfig()
                {
                    Config = new RecognitionConfig()
                    {
                        Encoding = RecognitionConfig.Types.AudioEncoding.Linear16,
                        AudioChannelCount = 1,
                        SampleRateHertz = audioFormat.SampleRate,
                        LanguageCode = LANGUAGE_CODE,
                    },
                    SingleUtterance = false,
                },
            });
            Task.Run(async () =>
            {
                string saidWhat = "";
                while (await recogStream.GetResponseStream().MoveNextAsync())
                {
                    foreach (var result in recogStream.GetResponseStream().Current.Results)
                    {
                        foreach (var alternative in result.Alternatives)
                        {
                            saidWhat = alternative.Transcript;
                            string timestamp = DateTime.Now.ToString();
                            Debug.WriteLine($"Speech transcript: {timestamp}: \"{saidWhat}\"");
                        }
                    }
                }
            });
            cummulativeRecogSeconds = 0f;
        }
    }
}
