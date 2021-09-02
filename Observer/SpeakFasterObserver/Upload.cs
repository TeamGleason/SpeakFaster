using Amazon.Runtime.CredentialManagement;
using Amazon.S3;
using Amazon.S3.Model;
using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading.Tasks;

namespace SpeakFasterObserver
{
    internal class Upload
    {
        private const string SCHEMA_VERSION = "SPO-2105";
        private const string BUCKET_NAME = "speak-faster";

        private static readonly AmazonS3Client _client;

        internal static string _dataDirectory;
        internal static string _gazeDevice;
        internal static string _salt;

        static Upload()
        {
            var sf = new SharedCredentialsFile();
            if (!sf.TryGetProfile("spo", out CredentialProfile spo))
            {
                return;
            }

            Debug.Assert(spo.Region != null);
            _client = new AmazonS3Client(spo.GetAWSCredentials(sf), spo.Region);
        }

        private static async Task<string> ReadSalt()
        {
            if (_client != null)
            {
                try
                {
                    var getRequest = new GetObjectRequest
                    {
                        BucketName = BUCKET_NAME,
                        Key = $"salt"
                    };

                    GetObjectResponse getResponse = await _client.GetObjectAsync(getRequest);
                    if (getResponse.HttpStatusCode == HttpStatusCode.OK)
                    {
                        using StreamReader reader = new(getResponse.ResponseStream);
                        return reader.ReadToEnd();
                    }
                }
                catch
                {
                }
            }

            return null;
        }

        static bool _uploading = false;
        public static async void Timer_Tick(object? state)
        {
            // If we're still uploading, don't double-start
            if (_uploading) return;
            _uploading = true;

            Debug.Assert(_client != null);
            Debug.Assert(_dataDirectory != null);
            Debug.Assert(_gazeDevice != null);

            if (_salt == null)
            {
                _salt = await ReadSalt();

                if (_salt == null)
                    return;
            }

            var dataDirectory = new DirectoryInfo(_dataDirectory);
            foreach (var fileInfo in dataDirectory.GetFiles())
            {
                if (FileNaming.IsInProgress(fileInfo.FullName))
                {
                    // Skip uploading in-progress file.
                    continue;
                }

                var putRequest = new PutObjectRequest
                {
                    BucketName = BUCKET_NAME,
                    Key = $"observer_data/{SCHEMA_VERSION}/{FileNaming.CloudStoragePath(fileInfo, _gazeDevice, _salt)}"
                };

                PutObjectResponse putResponse;
                using (var inputStream = fileInfo.OpenRead())
                {
                    putRequest.InputStream = inputStream;
                    putResponse = await _client.PutObjectAsync(putRequest);
                }

                if (putResponse.HttpStatusCode == HttpStatusCode.OK)
                {
                    fileInfo.Delete();
                }
            }

            _uploading = false;
        }
    }
}
