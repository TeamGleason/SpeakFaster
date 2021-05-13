import keypresses_pb2
import sys
import os
import datetime

def listFilesWithExtension(dirname,extension):
    return (f for f in os.listdir(dirname) if f.endswith('.' + extension))

def datetimeFromTimestamp(timestamp):
    return datetime.datetime.fromtimestamp(timestamp.seconds + timestamp.nanos/1e9)

if len(sys.argv) != 3:
  print(f"Usage: {sys.argv[0]} input_dir output_file")
  sys.exit(-1)

keypresses = keypresses_pb2.KeyPresses()
mergedKeypresses = keypresses_pb2.KeyPresses()

filepath = sys.argv[1]
outputFile = sys.argv[2]

files = listFilesWithExtension(filepath, "protobuf")

sortedfiles = sorted(files)

print(f"Merging directory: \"{filepath}\"")

for filename in sortedfiles:
    f = open(os.path.join(filepath,filename), "rb")
    bytes = f.read()
    keypresses.ParseFromString(bytes)
    f.close()

    mergedKeypresses.keyPresses.extend(keypresses.keyPresses)

mergedKeypresses.keyPresses.sort(key=lambda x:datetimeFromTimestamp(x.Timestamp))

print(f"Serializing {len(mergedKeypresses.keyPresses)} keypresses to \"{outputFile}\"")
with open(outputFile, "wb") as fd:
    fd.write(mergedKeypresses.SerializeToString())
