using Amazon;
using Amazon.Runtime.CredentialManagement;
using Amazon.S3;
using Amazon.S3.Model;
using System.Diagnostics;

namespace SpeakFasterObserver
{
    internal class Upload
    {
        public static async void Go()
        {
            var sf = new SharedCredentialsFile();
            CredentialProfile spo;
            if (!sf.TryGetProfile("spo", out spo))
            {
                return;
            }

            var client = new AmazonS3Client(spo.GetAWSCredentials(sf), spo.Region);

            var listRequest = new ListObjectsV2Request
            {
                BucketName = "speak-faster",
            };

            ListObjectsV2Response listResponse;
            do
            {
                // Get a list of objects
                listResponse = await client.ListObjectsV2Async(listRequest);
                foreach (S3Object obj in listResponse.S3Objects)
                {
                    Debug.WriteLine("Object - " + obj.Key);
                    Debug.WriteLine(" Size - " + obj.Size);
                    Debug.WriteLine(" LastModified - " + obj.LastModified);
                    Debug.WriteLine(" Storage class - " + obj.StorageClass);
                }

            } while (listResponse.IsTruncated);

        }
    }
}
