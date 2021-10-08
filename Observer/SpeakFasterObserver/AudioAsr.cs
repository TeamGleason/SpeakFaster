using Google.Cloud.Speech.V1;
using NAudio.Wave;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

/**
 * For speech recognition, speaker diarization, and potentially other real-time
 * analyses on an audio input stream.
 */
namespace SpeakFasterObserver
{
    class AudioAsr
    {
        private const float RECOG_PERIOD_SECONDS = 2f;
        private const float SPEAKER_ID_MIN_DURATION_SECONDS = 4f;
        // The streaming ASR API of Google Cloud has a length limit, beyond
        // which the recognition object must be re-initialized. For details,
        // see:
        // https://cloud.google.com/speech-to-text/quotas#content
        private const float STREAMING_RECOG_MAX_DURATION_SECONDS = 4 * 60f;
        private const string LANGUAGE_CODE = "en-US";

        // NOTE: To disable speaker diarization, set ENABLE_SPEKAER_DIARIZATION
        // to false. For speaker diarization, the max and min # of speakers
        // must be specified beforehand.
        private const bool ENABLE_SPEAKER_DIARIZATION = true;
        private const int MAX_SPEAKER_COUNT = 2;
        private const int MIN_SPEAKER_COUNT = 0;

        // Enable speaker ID with Azure Cognitive Service.
        // Be sure to set ENABLE_SPEAKER_DIARIZATION to true to enable speaker ID.
        // To enable this feature, you must have a config JSON file located at
        // "speak_faster_speaker_id_config.json" under your home directory (see
        // Settings.settings).
        // The JSON file must contains the following fields:
        //   - "azure_subscription_key": The subscription fee for the Azure speech service.
        //   - "azure_endpoint": The endpoint URL for Azure speech service, e.g.,
        //     "https://{AZURE_REGION}.api.cognitive.microsoft.com"
        //   - "id_to_realname": An object mapping enrolled profile IDs to speaker's names.
        //   - Potentially other fields used by other programs and scripts.
        private const bool ENABLE_SPEAKER_ID = true;
        private const string SPEAKER_ID_CONFIG_ENV_VAR_NAME =
            "SPEAK_FASTER_SPEAKER_ID_CONFIG";

        private readonly WaveFormat audioFormat;
        private readonly SpeechClient speechClient;
        private SpeechClient.StreamingRecognizeStream recogStream;
        // Buffer for holding samples for speech recognition.
        private readonly BufferedWaveProvider recogBuffer;
        // Buffer for holding samples for speaker ID. Refreshed on when
        // STREAMING_RECOG_MAX_DURATION_SECONDS has been reached.
        private readonly byte[] speakerIdBuffer;
        private int speakerIdBufferPos = 0;
        private readonly object speakerIdBufferLock = new object();
        private float cummulativeRecogSeconds;

        private string speakerIdEndpoint;
        private string speakerIdSubscriptionKey;
        private Dictionary<string, string> speakerMap;

        public AudioAsr(WaveFormat audioFormat)
        {
            this.audioFormat = audioFormat;
            recogBuffer = new BufferedWaveProvider(audioFormat);
            speakerIdBuffer = new byte[
                (int)(STREAMING_RECOG_MAX_DURATION_SECONDS * audioFormat.SampleRate *
                      (audioFormat.BitsPerSample / 8) * 1.1)];  // Add some safety room.
            speechClient = SpeechClient.Create();
            ReInitStreamRecognizer();
            if (ENABLE_SPEAKER_ID)
            {
                InitializeSpeakerIdentification();
            }
        }

        private void InitializeSpeakerIdentification()
        {
            string configPath = Path.Join(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                Properties.Settings.Default.SpeakerIdConfigPath);
            if (!File.Exists(configPath))
            {
                return;
            }
            string configString = File.ReadAllText(configPath);
            JsonDocument jsonDoc = JsonDocument.Parse(configString);
            JsonElement jsonRoot = jsonDoc.RootElement;
            speakerIdEndpoint = jsonRoot.GetProperty("azure_endpoint").GetString();
            speakerIdSubscriptionKey = jsonRoot.GetProperty("azure_subscription_key").GetString();
            // Read speaker map.
            speakerMap = new Dictionary<string, string>();
            JsonElement speakerMapObj = jsonRoot.GetProperty("id_to_realname");
            foreach (var speakerEntry in speakerMapObj.EnumerateObject())
            {
                speakerMap.Add(speakerEntry.Name, speakerEntry.Value.GetString());
            }
            Debug.WriteLine($"Loaded {speakerMap.Count} speakers into speaker map");
        }

        /**
         * Feed samples to ASR and other analyses.
         * The caller should call this whenever a new frame of PCM samples
         * become available.
         */
        public void AddSamples(byte[] samples, int numBytes)
        {
            lock (speakerIdBufferLock)
            {
                Array.Copy(samples, 0, speakerIdBuffer, speakerIdBufferPos, numBytes);
                speakerIdBufferPos += numBytes;
            }
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
            lock (speakerIdBufferLock)
            {
                speakerIdBufferPos = 0;
            }
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
                        if (ENABLE_SPEAKER_DIARIZATION && ENABLE_SPEAKER_ID)
                        {
                            recognizeSpeaker(transcript, bestAlt);
                        }
                    }
                }
            });
            cummulativeRecogSeconds = 0f;
        }

        private void recognizeSpeaker(string lastUtterance, SpeechRecognitionAlternative alt)
        {
            string[] utteranceWords = lastUtterance.Split(" ");
            int numWords = utteranceWords.Length;
            if (numWords == 0)
            {
                return;
            }
            double startTime = 0;
            double endTime = 0;
            for (int i = 0; i < utteranceWords.Length; ++i)
            {
                string utteranceWord = utteranceWords[utteranceWords.Length - 1 - i].Trim();
                WordInfo wordInfo = alt.Words[alt.Words.Count - 1 - i];
                if (wordInfo.Word.Trim() != utteranceWord)
                {
                    // Word mismatch: this is not expected.
                    return;
                }
                if (i == 0)
                {
                    endTime = wordInfo.EndTime.Seconds + wordInfo.EndTime.Nanos / 1e9;
                }
                if (i == utteranceWords.Length - 1)
                {
                    startTime = wordInfo.StartTime.Seconds + wordInfo.StartTime.Nanos / 1e9;
                }
            }
            if (endTime - startTime < SPEAKER_ID_MIN_DURATION_SECONDS)
            {
                Debug.WriteLine(
                    $"Utterance duration too short for speaker ID: " +
                    $"{endTime - startTime} < {SPEAKER_ID_MIN_DURATION_SECONDS}");
                return;
            }

            int bytesPerSample = audioFormat.BitsPerSample / 8;
            int bufferStartIndex = bytesPerSample * (int)(audioFormat.SampleRate * startTime);
            int bufferEndIndex = bytesPerSample * (int)(audioFormat.SampleRate * endTime);
            byte[] snippetBuffer = new byte[bufferEndIndex - bufferStartIndex];
            lock (speakerIdBufferLock)
            {
                Array.Copy(
                    speakerIdBuffer, bufferStartIndex, snippetBuffer, 0,
                    bufferEndIndex - bufferStartIndex);
            }
            SendSpeakerIdHttpRequest(snippetBuffer);
        }

        private async void SendSpeakerIdHttpRequest(byte[] snippetBuffer)
        {
            if (speakerIdEndpoint == null || speakerIdSubscriptionKey == null ||
                speakerMap.Count == 0)
            {
                return;
            }
            using (var client = new HttpClient())
            {
                string[] profileIds = new string[speakerMap.Count];
                speakerMap.Keys.CopyTo(profileIds, 0);
                string url =
                    $"{speakerIdEndpoint}/speaker/identification/v2.0/text-independent/profiles/" +
                    $"identifySingleSpeaker?profileIds={string.Join(",", profileIds)}";
                ByteArrayContent byteArrayContent = new(snippetBuffer);
                byteArrayContent.Headers.Add(
                    "ContentType",
                    $"audio/wav; codecs=audio/pcm; samplerate={audioFormat.SampleRate}");
                byteArrayContent.Headers.Add("Ocp-Apim-Subscription-Key", speakerIdSubscriptionKey);
                var response = await client.PostAsync(url, byteArrayContent);
                PrintDetectedSpeakerName(response);
            }
        }

        private async void PrintDetectedSpeakerName(HttpResponseMessage speakerIdResponse)
        {
            if (speakerIdResponse.StatusCode != HttpStatusCode.OK)
            {
                string errorString = await speakerIdResponse.Content.ReadAsStringAsync();
                // TODO: throw error and catch the error in UI code to display an error
                // message box.
                Debug.WriteLine(
                    $"Erorr in Speaker ID HTTP response: {speakerIdResponse.StatusCode}: " +
                    $"{errorString}");
                return;
            }
            string responseString = await speakerIdResponse.Content.ReadAsStringAsync();
            JsonDocument responseObj = JsonDocument.Parse(responseString);
            JsonElement responseRoot = responseObj.RootElement;
            JsonElement profile;
            try
            {
                profile = responseRoot.GetProperty("identifiedProfile");
            }
            catch (KeyNotFoundException e)
            {
                Debug.WriteLine($"*** Unknown speaker\n");
                return;
            }
            string profileId;
            try
            {
                profileId = profile.GetProperty("profileId").GetString();
            }
            catch (KeyNotFoundException)
            {
                Debug.WriteLine($"*** Unknown speaker\n");
                return;
            }
            if (profileId.StartsWith("00000000"))
            {
                Debug.WriteLine($"*** Unknown speaker\n");
                return;
            }
            double score = profile.GetProperty("score").GetDouble();
            Debug.WriteLine(
                $"*** Detected known speaker: {speakerMap[profileId]} (score={score})\n");
        }
    }
}

