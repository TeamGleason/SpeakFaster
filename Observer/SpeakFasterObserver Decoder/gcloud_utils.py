"""Google Cloud-related utilites."""
import os
import tempfile
import uuid

from google.cloud import storage


def create_temp_gcs_bucket(prefix):
  """Creates a temporary GCS bucket.

  Args:
    prefix: The name prefix for the bucket. The actual bucket name will consist
      of this prefix plus a random suffix.

  Returns:
    Name of the bucket created by this call.
  """
  storage_client = storage.Client()
  bucket_name = prefix + "_" + str(uuid.uuid4())
  bucket = storage_client.bucket(bucket_name)
  bucket.storage_class = "COLDLINE"
  new_bucket = storage_client.create_bucket(bucket, location="us")
  print("Created GCS bucket %s in %s" % (new_bucket.name, new_bucket.location))
  return bucket_name


def delete_gcs_bucket(bucket_name):
  """Delete a GCS bucket."""
  storage_client = storage.Client()
  bucket = storage_client.get_bucket(bucket_name)
  bucket.delete()
  print("Deleted GCS bucket %s" % bucket_name)


def upload_text_to_object(text, bucket_name, destination_blob_name):
  """Upload a text string to a GCS bucket.

  Args:
    text: The text content to upload.
    bucket_name: Name of the bucket to upload to.
    destination_blob_name: Blob path under the bucket.
  """
  storage_client = storage.Client()
  bucket = storage_client.bucket(bucket_name)
  blob = bucket.blob(destination_blob_name)
  temp_path = tempfile.mktemp()
  with open(temp_path, "wt") as f:
    f.write(text)
  try:
    blob.upload_from_filename(temp_path)
    print("Uploaded text to gs://%s/%s" % (bucket_name, destination_blob_name))
  finally:
    os.remove(temp_path)
