import keypresses_pb2
import sys
import datetime

minhumantime = datetime.timedelta(milliseconds=60)
maxdeltatime = datetime.timedelta(days=1)

def datetimeFromTimestamp(timestamp):
    return datetime.datetime.fromtimestamp(timestamp.seconds + timestamp.nanos/1e9)

def ListKeypresses(keypresses):
    previousTimestamp = datetime.datetime.min

    for keypress in keypresses.keyPresses:
        currentTimestamp = datetimeFromTimestamp(keypress.Timestamp)
        deltaTimestamp = currentTimestamp - previousTimestamp

        isHuman = True

        if deltaTimestamp < minhumantime:
            isHuman = False

        print(f"Key:{keypress.KeyPress} Timestamp:{keypress.Timestamp.seconds}.{keypress.Timestamp.nanos} Delta:{deltaTimestamp} {isHuman}")
        previousTimestamp = currentTimestamp

if len(sys.argv) != 2:
  print(f"Usage: {sys.argv[0]} input_file")
  sys.exit(-1)

keypresses = keypresses_pb2.KeyPresses()

filename = sys.argv[1]

f = open(filename, "rb")
bytes = f.read()
keypresses.ParseFromString(bytes)
f.close()

ListKeypresses(keypresses)