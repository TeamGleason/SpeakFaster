using Google.Cloud.Speech.V1;
using NAudio.Wave;
using System;
using System.Diagnostics;
using System.Threading.Tasks;

/**
 * For speech recognition, speaker diarization, and potentially other real-time
 * analyses on an audio input stream.
 */
namespace SpeakFasterObserver
{
    class AudioAsr
    {
        private static readonly float RECOG_PERIOD_SECONDS = 2f;
        // The streaming ASR API of Google Cloud has a length limit, beyond
        // which the recognition object must be re-initialized. For details,
        // see:
        // https://cloud.google.com/speech-to-text/quotas#content
        private static readonly float STREAMING_RECOG_MAX_DURATION_SECONDS = 4 * 60f;
        private static readonly string LANGUAGE_CODE = "en-US";

        // NOTE: To disable speaker diarization, set ENABLE_SPEKAER_DIARIZATION
        // to false. For speaker diarization, the max and min # of speakers
        // must be specified beforehand.
        private static readonly bool ENABLE_SPEAKER_DIARIZATION = true;
        private static readonly int MAX_SPEAKER_COUNT = 2;
        private static readonly int MIN_SPEAKER_COUNT = 0;

        private readonly WaveFormat audioFormat;
        private readonly SpeechClient speechClient;
        private readonly BufferedWaveProvider recogBuffer;
        private SpeechClient.StreamingRecognizeStream recogStream;
        private float cummulativeRecogSeconds;

        public AudioAsr(WaveFormat audioFormat)
        {
            this.audioFormat = audioFormat;
            recogBuffer = new BufferedWaveProvider(audioFormat);
            speechClient = SpeechClient.Create();
            ReInitStreamRecognizer();
        }

        /**
         * Feed samples to ASR and other analyses.
         * The caller should call this whenever a new frame of PCM samples
         * become available.
         */
        public void AddSamples(byte[] samples, int numBytes)
        {
            recogBuffer.AddSamples(samples, 0, numBytes);
            float bufferedSeconds = (float)recogBuffer.BufferedBytes / (
                audioFormat.BitsPerSample / 8) / audioFormat.SampleRate;
            if (bufferedSeconds >= RECOG_PERIOD_SECONDS)
            {
                int bufferNumBytes = recogBuffer.BufferedBytes;
                byte[] frameBuffer = new byte[bufferNumBytes];
                recogBuffer.Read(frameBuffer, 0, bufferNumBytes);
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
                    ReInitStreamRecognizer();
                }
            }
        }

        /** (Re-)initializes the Cloud-based streaming speech recognizer. */
        private void ReInitStreamRecognizer()
        {
            recogStream = speechClient.StreamingRecognize();
            SpeakerDiarizationConfig diarizationConfig = new SpeakerDiarizationConfig()
            {
                EnableSpeakerDiarization = ENABLE_SPEAKER_DIARIZATION,
                MaxSpeakerCount = MAX_SPEAKER_COUNT,
                MinSpeakerCount = MIN_SPEAKER_COUNT,
            };
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
                        DiarizationConfig = diarizationConfig,
                    },
                    SingleUtterance = false,
                },
            }); ;
            Task.Run(async () =>
            {
                while (await recogStream.GetResponseStream().MoveNextAsync())
                {
                    foreach (var result in recogStream.GetResponseStream().Current.Results)
                    {
                        if (result.Alternatives.Count == 0)
                        {
                            continue;
                        }
                        // Identify the alternative with the highest confidence.
                        SpeechRecognitionAlternative bestAlt = null;
                        foreach (var alternative in result.Alternatives)
                        {
                            if (bestAlt == null || alternative.Confidence > bestAlt.Confidence)
                            {
                                bestAlt = alternative;
                            }
                        }
                        string transcript = bestAlt.Transcript.Trim();
                        if (transcript.Length == 0)
                        {
                            continue;
                        }
                        string transcriptInfo =
                            $"Speech transcript: {DateTime.Now}: \"" +
                            $"{transcript}\" (confidence={bestAlt.Confidence})";
                        if (ENABLE_SPEAKER_DIARIZATION)
                        {
                            int speakerTag = bestAlt.Words[bestAlt.Words.Count - 1].SpeakerTag;
                            transcriptInfo += $" (speakerTag={speakerTag})";
                        }
                        Debug.WriteLine(transcriptInfo);
                    }
                }
            });
            cummulativeRecogSeconds = 0f;
        }
    }
}
