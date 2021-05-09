import keypresses_pb2
import sys
import os

def listFilesWithExtension(dirname,extension):
    return (f for f in os.listdir(dirname) if f.endswith('.' + extension))

if len(sys.argv) != 3:
  print(f"Usage: {sys.argv[0]} input_dir output_file")
  sys.exit(-1)

keypresses = keypresses_pb2.KeyPresses()
mergedKeypresses = keypresses_pb2.KeyPresses()

filepath = sys.argv[1]
outputFile = sys.argv[2]

files = listFilesWithExtension(filepath, "protobuf")

sortedfiles = sorted(files)

for filename in sortedfiles:
    f = open(os.path.join(filepath,filename), "rb")
    bytes = f.read()
    keypresses.ParseFromString(bytes)
    f.close()

    for keypress in keypresses.keyPresses:
        mergedKeypresses.keyPresses.append(keypress)

with open(outputFile, "wb") as fd:
    fd.write(mergedKeypresses.SerializeToString())
