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


def remote_objects_exist(bucket_name, destination_blob_prefix, file_names):
  """Determine whether all remote file objects exist."""
  storage_client = storage.Client()
  bucket = storage_client.bucket(bucket_name)
  for file_name in file_names:
    destination_blob_name = (
        destination_blob_prefix if destination_blob_prefix.endswith("/")
        else destination_blob_prefix + "/")
    destination_blob_name += "/".join(
        [item for item in os.path.split(file_name) if item])
    blob = bucket.blob(destination_blob_name)
    if not blob.exists():
      return False
  return True


def upload_files_as_objects(local_dir,
                            file_names,
                            bucket_name,
                            destination_blob_prefix):
  """Upload specified files in a local directory as GCS objects.

  Under a common destination prefix.

  Args:
    local_dir: Path to the local directory that contains the files to upload.
    file_names: Names of the files in the local_dir.
    bucket_name: Name of the GCS bucket to upload the files to.
    destination_blob_prefix: Destination blobl prefix.
  """
  storage_client = storage.Client()
  bucket = storage_client.bucket(bucket_name)
  for file_name in file_names:
    file_path = os.path.join(local_dir, file_name)
    if not os.path.isfile(file_path):
      raise ValueError("Cannot find file at %s" % file_path)
    destination_blob_name = (
        destination_blob_prefix if destination_blob_prefix.endswith("/")
        else destination_blob_prefix + "/")
    destination_blob_name += "/".join(
        [item for item in os.path.split(file_name) if item])
    print("Uploading %s --> gs://%s/%s" %
          (file_path, bucket_name, destination_blob_name))
    blob = bucket.blob(destination_blob_name)
    blob.upload_from_filename(file_path)
