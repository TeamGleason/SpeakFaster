import keypresses_pb2
import sys
import datetime

mingazetime = datetime.timedelta(milliseconds=100)
maxdeltatime = datetime.timedelta(days=1)

def datetimeFromTimestamp(timestamp):
    return datetime.datetime.fromtimestamp(timestamp.seconds + timestamp.nanos/1e9)

def ListKeypresses(keypresses):
    previousTimestamp = datetime.datetime.min

    totalKeysPressed = len(keypresses.keyPresses)

    currentKeyIndex = 0
    gazeKeyPressCount = 0

    while currentKeyIndex < totalKeysPressed:
        keypress = keypresses.keyPresses[currentKeyIndex]

        currentTimestamp = datetimeFromTimestamp(keypress.Timestamp)

        isGazeTyped = False
        isChar = (len(keypress.KeyPress) == 1)

        isGazeTyped, deltaTimestamp = isKeyGazeInitiated(keypresses, currentKeyIndex, totalKeysPressed)
        if isGazeTyped:
            gazeKeyPressCount += 1

        print(f"Key:{keypress.KeyPress:13} Timestamp:{keypress.Timestamp.seconds:12}.{keypress.Timestamp.nanos:09} Delta:{deltaTimestamp} Gaze:{isGazeTyped:2} Character:{isChar:2}")

        currentKeyIndex += 1

    print(f"{totalKeysPressed} pressed, {gazeKeyPressCount} human initiated - {(gazeKeyPressCount/totalKeysPressed):.2%}")

def isKeyGazeInitiated(keypresses, currentKeyIndex, totalKeypressCount):
    isGazeInitiated = True
    deltaTimestamp = datetime.timedelta(0)

    if currentKeyIndex > 0 and currentKeyIndex < totalKeypressCount - 1:
        currentTimestamp = datetimeFromTimestamp(keypresses.keyPresses[currentKeyIndex].Timestamp)
        previousTimestamp = datetimeFromTimestamp(keypresses.keyPresses[currentKeyIndex-1].Timestamp)
        deltaTimestamp = currentTimestamp - previousTimestamp
        
        if deltaTimestamp < mingazetime:
            isGazeInitiated = False

    return isGazeInitiated, deltaTimestamp

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