import keypresses_pb2
import sys
import datetime

minhumantime = datetime.timedelta(milliseconds=60)
maxdeltatime = datetime.timedelta(days=1)

def datetimeFromTimestamp(timestamp):
    return datetime.datetime.fromtimestamp(timestamp.seconds + timestamp.nanos/1e9)

def ListKeypresses(keypresses):
    previousTimestamp = datetime.datetime.min

    totalKeysPressed = len(keypresses.keyPresses)

    currentKeyIndex = 0
    humanKeyPressCount = 0

    while currentKeyIndex < totalKeysPressed:
        keypress = keypresses.keyPresses[currentKeyIndex]

        currentTimestamp = datetimeFromTimestamp(keypress.Timestamp)

        deltaTimestamp = datetime.timedelta(0)
        if currentKeyIndex > 0:
            previousTimestamp = datetimeFromTimestamp(keypresses.keyPresses[currentKeyIndex - 1].Timestamp)
            deltaTimestamp = currentTimestamp - previousTimestamp

        isHuman = False
        isChar = (len(keypress.KeyPress) == 1)

        if deltaTimestamp > minhumantime:
            isHuman = True
            humanKeyPressCount += 1

        print(f"Key:{keypress.KeyPress:13} Timestamp:{keypress.Timestamp.seconds:12}.{keypress.Timestamp.nanos:09} Delta:{deltaTimestamp} Human:{isHuman:2} Character:{isChar:2}")

        currentKeyIndex += 1

    print(f"{totalKeysPressed} pressed, {humanKeyPressCount} human initiated - {(humanKeyPressCount/totalKeysPressed):.2%}")

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