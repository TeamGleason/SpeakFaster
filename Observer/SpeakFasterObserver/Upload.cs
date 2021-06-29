using Amazon.Runtime.CredentialManagement;
using Amazon.S3;
using Amazon.S3.Model;
using System;
using System.Diagnostics;
using System.IO;
using System.Net;

namespace SpeakFasterObserver
{
    internal class Upload
    {
        private static string _schemaVersion = "SPO-2105";
        private static string _bucketName = "speak-faster";
        private static AmazonS3Client _client;

        internal static string _dataDirectory;
        internal static string _gazeDevice;

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

        static bool _uploading = false;
        public static async void Timer_Tick(object? state)
        {
            // If we're still uploading, don't double-start
            if (_uploading) return;
            _uploading = true;

            Debug.Assert(_client != null);
            Debug.Assert(_dataDirectory != null);

            var dataDirectory = new DirectoryInfo(_dataDirectory);
            foreach(var fileInfo in dataDirectory.GetFiles())
            {
                var putRequest = new PutObjectRequest
                {
                    BucketName = _bucketName,
                    Key = $"observer_data/{_schemaVersion}/{Environment.MachineName}-{_gazeDevice ?? "none"}/{Environment.UserName}/{fileInfo.Name}"
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
