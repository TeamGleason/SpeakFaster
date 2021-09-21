using Google.Cloud.Speech.V1;
using NAudio.Wave;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Http;
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
        private static readonly float SPEAKER_ID_MIN_DURATION_SECONDS = 4f;
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
        private SpeechClient.StreamingRecognizeStream recogStream;
        // Buffer for holding samples for speech recognition.
        private readonly BufferedWaveProvider recogBuffer;
        // Buffer for holding samples for speaker ID. Refreshed on when
        // STREAMING_RECOG_MAX_DURATION_SECONDS has been reached. 
        //private readonly BufferedWaveProvider speakerIdBuffer;
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
            //speakerIdBuffer = new BufferedWaveProvider(audioFormat);
            //speakerIdBuffer.BufferLength =
            speakerIdBuffer = new byte[
                (int)(STREAMING_RECOG_MAX_DURATION_SECONDS * audioFormat.SampleRate
                      * (audioFormat.BitsPerSample / 8) * 1.1)];  // Add some safety room.
            speechClient = SpeechClient.Create();
            ReInitStreamRecognizer();
            InitializeSpeakerIdentifier();
        }

        private void InitializeSpeakerIdentifier()
        {
            string configPath = Environment.GetEnvironmentVariable("SPEAK_FASTER_SPEAKER_ID_CONFIG");
            if (configPath != null && configPath.Length > 0)
            {
                // TODO(cais): Check path exists.
                string configString = File.ReadAllText(configPath);
                JObject configObj = JObject.Parse(configString);
                // TODO(cais): Check type.
                speakerIdEndpoint = configObj.GetValue("azure_endpoint").ToString();
                speakerIdSubscriptionKey = configObj.GetValue("azure_subscription_key").ToString();
                // Read speaker map.
                speakerMap = new Dictionary<string, string>();
                JObject speakerMapObj = (JObject) configObj.GetValue("speaker_map");
                foreach (var speakerEntry in speakerMapObj)
                {
                    speakerMap.Add(speakerEntry.Key, speakerEntry.Value.ToString());
                }
                Debug.WriteLine($"Loaded {speakerMap.Count} speakers into speaker map");
            }
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
                //speakerIdBuffer.AddSamples(samples, 0, numBytes);
                //Debug.WriteLine($"Added {numBytes / 2} samples");  // DEBUG
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
                            recognizeSpeaker(transcript, bestAlt);
                        }
                        //Debug.WriteLine(transcriptInfo);
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
                    // TODO(cais): Log a warning.
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
                // TODO(cais): Log a warning.
                Debug.WriteLine($"Utterance duration too short for speaker ID: {endTime - startTime} < {SPEAKER_ID_MIN_DURATION_SECONDS}");
                return;
            }
            Debug.WriteLine($"Speaker ID candidate: \"{lastUtterance}\": {startTime} - {endTime}");  // DEBUG

            int bytesPerSample = audioFormat.BitsPerSample / 8;
            int bufferStartIndex = bytesPerSample * (int)(audioFormat.SampleRate * startTime);
            int bufferEndIndex = bytesPerSample * (int)(audioFormat.SampleRate * endTime);
            float bufferedSeconds = (float)speakerIdBufferPos / bytesPerSample / audioFormat.SampleRate;
            //Debug.WriteLine($"buffered seconds = {bufferedSeconds}");  // DEBUG
            //byte[] tempBuffer = new byte[bufferEndIndex];
            byte[] snippetBuffer = new byte[bufferEndIndex - bufferStartIndex];
            lock (speakerIdBufferLock)
            {
                //speakerIdBuffer.Read(tempBuffer, 0, bufferEndIndex);
                Array.Copy(
                    speakerIdBuffer, bufferStartIndex, snippetBuffer, 0,
                    bufferEndIndex - bufferStartIndex);
            }
            //Array.Copy(tempBuffer, bufferStartIndex, snippetBuffer, 0, bufferEndIndex - bufferStartIndex);
            MemoryStream snippetStream = new MemoryStream(snippetBuffer);
            string tempWavFilePath = Path.GetTempFileName();
            using (FileStream fs = File.Create(tempWavFilePath))
            {
                WaveFileWriter.WriteWavFileToStream(fs, new RawSourceWaveStream(snippetStream, audioFormat));
            }
            //Debug.WriteLine("Wrote to .wav file: " + tempWavFilePath);  // DEBUG
            if (File.Exists(tempWavFilePath))
            {
                SendSpeakerIdHttpRequest(tempWavFilePath);
            } else 
            {
                Debug.WriteLine("Failed to write file: " + tempWavFilePath);  // DEBUG
            }
        }

        private async void SendSpeakerIdHttpRequest(string wavFilePath)
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
                    $"identifySingleSpeaker?profileIds={String.Join(",", profileIds)}";
                byte[] fileContent = File.ReadAllBytes(wavFilePath);
                ByteArrayContent byteArrayContent = new ByteArrayContent(fileContent);
                byteArrayContent.Headers.Add(
                    "ContentType",
                    $"audio/wav; codecs=audio/pcm; samplerate={audioFormat.SampleRate}");
                byteArrayContent.Headers.Add("Ocp-Apim-Subscription-Key", speakerIdSubscriptionKey);
                //Debug.WriteLine("Sending speaker ID HTTP request");  // DEBUG
                var response = await client.PostAsync(url, byteArrayContent);
                File.Delete(wavFilePath);
                GetWinningSpeakerName(response);
            }
        }

        private async void GetWinningSpeakerName(HttpResponseMessage speakerIdResponse)
        {
            if (speakerIdResponse.StatusCode != HttpStatusCode.OK)
            {
                string errorString = await speakerIdResponse.Content.ReadAsStringAsync();
                Debug.WriteLine("Erorr: HTTP response status: " + speakerIdResponse.StatusCode);  // DEBUG
                Debug.WriteLine("Erorr: HTTP response string: " + errorString);  // DEBUG
                return;
            }
            string responseString = await speakerIdResponse.Content.ReadAsStringAsync();
            //Debug.WriteLine(responseString);  // DEBUG
            JObject responseObj = JObject.Parse(responseString);
            if (!responseObj.ContainsKey("identifiedProfile"))
            {
                Debug.WriteLine($"*** Unknown speaker\n");
                return;
            }
            JObject profile = (JObject)responseObj.GetValue("identifiedProfile");
            if (!profile.ContainsKey("profileId"))
            {
                Debug.WriteLine($"*** Unknown speaker\n");
                return;
            }
            string profileId = (string)profile.GetValue("profileId");
            if (profileId.StartsWith("00000000"))
            {
                Debug.WriteLine($"*** Unknown speaker\n");
                return;
            }
            float score = (float)profile.GetValue("score");
            if (score < 0.5f)
            {
                Debug.WriteLine($"*** Unknown speaker (low confidence score={score})\n");
                return;
            }
            Debug.WriteLine($"*** Detected known speaker: {speakerMap[profileId]} (score={score})\n");
        }
    }
}

