import argparse
import datetime
import glob
import jsonpickle
import keypresses_pb2
import os
import sys

# Assuming that eye gaze activation faster than 300ms is faster than
# realistically possible.  This is useful for detecting automatic insertion of
# characters as opposed to manually typed characters.  A prime example is when
# predictions are used.  A rapid series of backspace keys followed by rapid
# typing of characters
mingazetime = datetime.timedelta(milliseconds=300)

# Assume that after 90 seconds of inactivity we are doing a new utterance
longdeltatime = datetime.timedelta(seconds=90)

class Prediction:
    def __init__(self, keypresses, currentKeyIndex, totalKeyspresses):
        self.length = 0 # the number of keypresses used in the prediction, 8 in the case of
                        # "🗩🠠🠠HELLO "
        self.gain = -1 # the number of extra characters contributed to the actual output, 3 in the
                       # case of "🗩🠠🠠HELLO "
        self.startIndex = currentKeyIndex
        self.endIndex = 0
        self.predictionStr = ""

        startIndex = currentKeyIndex

        index = currentKeyIndex
        isNextGazeInitiated = False

        while index < totalKeyspresses and not isNextGazeInitiated:
            currentKeypress = keypresses.keyPresses[index]

            self.predictionStr += outputForKeypress(currentKeypress.KeyPress, False)

            # Just keep eating automatic keypresses until next gaze initiated
            # key
            isNextGazeInitiated, deltaTimestamp = isKeyGazeInitiated(keypresses, index + 1, totalKeyspresses)
            index += 1
            self.length += 1

            if currentKeypress.KeyPress == "Back":
                self.gain -= 1
            elif (currentKeypress.KeyPress == "LShiftKey" or isCharacter(currentKeypress.KeyPress) or currentKeypress.KeyPress == "Space"):
                self.gain += 1

        endIndex = index - 1

    def __str__(self):
        return f"🗩{self.predictionStr}"

# A phrase is defined as a series of keypresses over a period of time
# The phrase may end with it being spoken or not spoken
class Phrase:
    def __init__(self):
        self.startIndex = 0  # Index of the first keypress in the phrase
        self.endIndex = 0    # Index of the last keypress in the phrase
        self.startTimestamp = None
        self.endTimestamp = None
        self.visualizedStr = ""
        self.endingStr = ""
        self.wasSpoken = False
        self.wasCancelled = False
        self.wasTimeout = False
        self.characterCount = 0
        self.backspaceCount = 0
        self.delwordCount = 0
        self.gazeKeyPressCount = 0
        self.machineKeyPressCount = 0
        self.predictions = []
        self.wpm = 0.0
        self.ksr = 0.0
        self.error = 0.0

    def finalize(self):
        # When the phrase is complete, we want to run various calculations for
        # WPM, KSR, and Error rate.  We also validate to ensure there are no
        # missing Keypresses in the range.
        self.calculateWpm()
        self.calculateKsr()
        self.calculateError()
        self.validate()

    def calculateError(self):
        # Error rate relates the number of corrections in comparison to the
        # number of keys the user pressed.  Backspace count includes both
        # direct backspaces as well as delword (which counts as one backspace).
        # Similarly, Gaze KeyPress count includes the keypresses that were done
        # via gaze.  For predictions, it will be one gaze keypress.
        if self.wasSpoken and self.gazeKeyPressCount > 0:
            self.error = (self.backspaceCount + self.delwordCount) / self.gazeKeyPressCount

    def calculateKsr(self):
        # KSR is Keystroke Savings Rate
        # (total_chars - actual_num_of_keystrokes) / total_chars
        if self.wasSpoken and self.characterCount > 0:
            self.ksr = (self.characterCount - self.gazeKeyPressCount) / self.characterCount

    def calculateWpm(self):
        if self.wasSpoken and self.characterCount > 1:
            self.wpm = (self.characterCount / 5) / ((self.endTimestamp - self.startTimestamp).total_seconds() / 60)

    def validate(self):
        if not self.keypressCount() == self.gazeKeyPressCount + self.machineKeyPressCount:
            raise Exception(f"Missing Keypresses KeyPress:{self.keypressCount()} Gaze:{self.gazeKeyPressCount} Machine:{self.machineKeyPressCount}")

    def cancel(self, endingStr):
        self.wasCancelled = True
        self.endingStr = endingStr

    def timeout(self):
        self.wasTimeout = True
        self.endingStr = "⏰"

    def speak(self):
        self.wasSpoken = True
        self.endingStr = "💬"

    def keypressCount(self):
        return self.endIndex - self.startIndex + 1

    def printVal(self):
        print(self.val)

    def __str__(self):
        returnString = f"[{self.startIndex:8}:{self.endIndex:8}] Time:{self.endTimestamp} {self.endingStr} ␂{self.visualizedStr}␃ {self.endingStr}"
        if self.wasSpoken:
            returnString += f" ⏲{self.wpm:0.2f} wpm ⌨️{self.error:0.2f} ksr 🤦{self.error:0.2%} error"
        returnString += f" back:{self.backspaceCount} delword:{self.delwordCount} gaze:{self.gazeKeyPressCount} prediction:{len(self.predictions)} chars:{self.characterCount}"

        return returnString

def VisualizeKeypresses(keypresses, args):
    phrases = []
    currentPhrase = None
    isPhraseStart = True
    isPhraseEnd = False

    totalKeyspresses = len(keypresses.keyPresses)

    currentKeyIndex = 0

    while currentKeyIndex < totalKeyspresses:
        keypress = keypresses.keyPresses[currentKeyIndex]
        currentTimestamp = datetimeFromTimestamp(keypress.Timestamp)
        isNextGazeInitialized, nextCharacterDelta = isKeyGazeInitiated(keypresses, currentKeyIndex + 1, totalKeyspresses)

        if isPhraseStart:
            currentPhrase = Phrase()
            currentPhrase.startIndex = currentKeyIndex
            isPhraseStart = False
            isPhraseEnd = False
            currentPhrase.startTimestamp = currentTimestamp

        if not isNextGazeInitialized:
            # there is a subsequent character, and it was inserted
            # programmatically
            if (keypress.KeyPress == "LControlKey" and currentKeyIndex + 3 < totalKeyspresses and keypresses.keyPresses[currentKeyIndex + 1].KeyPress == "LShiftKey" and keypresses.keyPresses[currentKeyIndex + 2].KeyPress == "Left" and keypresses.keyPresses[currentKeyIndex + 3].KeyPress == "Back"):
                # Scenario 1: ctrl-shift-left-back == DelWord
                currentPhrase.visualizedStr += "↞"
                currentKeyIndex += 4
                currentPhrase.delwordCount += 1
                currentPhrase.gazeKeyPressCount += 1
                currentPhrase.machineKeyPressCount += 3
            elif (keypress.KeyPress == "LWin" and currentKeyIndex + 1 < totalKeyspresses):
                # Automated windows hotkeys
                nextKeypress = keypresses.keyPresses[currentKeyIndex + 1]
                if (nextKeypress.KeyPress == "A"        # Win+A = Action Center
                    or nextKeypress.KeyPress == "S"     # Win+S = Search
                    or nextKeypress.KeyPress == "Tab"): # Win+Tab = Task View
                    isPhraseEnd = True
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.machineKeyPressCount += 1
                    currentPhrase.cancel("🗔")
                else:
                    raise Exception(f"Unknown windows key combo Win+{nextKeypress.KeyPress}")
            else:
                # Scenario 2a: backspaces followed by characters then space =
                # Prediction
                # Scenario 2b: characters then space = Prediction
                currentPrediction = Prediction(keypresses, currentKeyIndex, totalKeyspresses)
                currentKeyIndex += currentPrediction.length
                currentPhrase.characterCount += currentPrediction.gain + 1
                currentPhrase.gazeKeyPressCount += 1
                currentPhrase.machineKeyPressCount += currentPrediction.length - 1

                currentPhrase.visualizedStr += str(currentPrediction)

                currentPhrase.predictions.append(currentPrediction)
        else:
            # next character is gaze initated
            if ((keypress.KeyPress == "LControlKey" or keypress.KeyPress == "RControlKey") and currentKeyIndex + 1 < totalKeyspresses):
                nextKeypress = keypresses.keyPresses[currentKeyIndex + 1]
                if nextKeypress.KeyPress == "W":    # Ctrl-W == Speak
                    isPhraseEnd = True
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.machineKeyPressCount += 1
                    currentPhrase.speak()
                elif nextKeypress.KeyPress == "Q":  # Ctrl-Q == Pause
                    isPhraseEnd = True
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.machineKeyPressCount += 1
                    currentPhrase.cancel("⏸")
                elif nextKeypress.KeyPress == "Q":  # Ctrl-E == Stop
                    isPhraseEnd = True
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.machineKeyPressCount += 1
                    currentPhrase.cancel("🛑")
                elif nextKeypress.KeyPress == "A":  # Ctrl-A == Select All
                    isPhraseEnd = True              # TODO If ctrl-A is followed by ctrl-W, phrase wasn't cancelled
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.machineKeyPressCount += 1
                    currentPhrase.cancel("␘")
                elif nextKeypress.KeyPress == "Left":
                    currentPhrase.visualizedStr +="↶"
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.machineKeyPressCount += 1
                elif nextKeypress.KeyPress == "Right":
                    currentPhrase.visualizedStr +="↷"
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.machineKeyPressCount += 1
                elif nextKeypress.KeyPress == "X":  # Ctrl-X == Cut
                    currentPhrase.visualizedStr += "✂️"
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.machineKeyPressCount += 1
                elif nextKeypress.KeyPress == "C":  # Ctrl-C == Copy
                    currentPhrase.visualizedStr += "📄"
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.machineKeyPressCount += 1
                elif nextKeypress.KeyPress == "V":  # Ctrl-V == Paste
                    currentPhrase.visualizedStr += "📋"
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.machineKeyPressCount += 1
                elif nextKeypress.KeyPress == "Z":  # Ctrl-Z == Undo
                    currentPhrase.visualizedStr += "↺"
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.machineKeyPressCount += 1
                else:
                    currentPhrase.visualizedStr += outputForKeypress(keypress.KeyPress, False)
                    currentPhrase.characterCount += 1
                    currentPhrase.gazeKeyPressCount += 1
                    currentKeyIndex += 1
            elif keypress.KeyPress == "LShiftKey":
                if (currentKeyIndex + 1 < totalKeyspresses and not keypresses.keyPresses[currentKeyIndex + 1].KeyPress == "LShiftKey" and not keypresses.keyPresses[currentKeyIndex + 1].KeyPress == "LControlKey"):
                    currentPhrase.visualizedStr += outputForKeypress(keypresses.keyPresses[currentKeyIndex + 1].KeyPress, True)
                    currentKeyIndex += 2
                    currentPhrase.characterCount += 1
                    currentPhrase.gazeKeyPressCount += 2
                else:
                    currentPhrase.visualizedStr += outputForKeypress(keypress.KeyPress, False)
                    currentPhrase.characterCount += 1
                    currentKeyIndex += 1
                    currentPhrase.gazeKeyPressCount += 1
            else:
                if keypress.KeyPress == "Back":
                    currentPhrase.backspaceCount += 1
                    currentPhrase.characterCount -= 1
                    currentPhrase.gazeKeyPressCount += 1
                else:
                    currentPhrase.characterCount += 1
                    currentPhrase.gazeKeyPressCount += 1

                currentPhrase.visualizedStr += outputForKeypress(keypress.KeyPress, False)
                currentKeyIndex += 1

                if currentKeyIndex >= totalKeyspresses:
                    isPhraseEnd = True

        if nextCharacterDelta > longdeltatime:
            isPhraseEnd = True
            currentPhrase.timeout()

        if not isPhraseEnd and currentKeyIndex >= totalKeyspresses:
            # If we have run out of keypresses, but have not otherwise ended
            # the phrase, ensure the phrase is ended
            isPhraseEnd = True
            currentPhrase.cancel("␘")

        if isPhraseEnd:
            # The currentKeyIndex is pointing to the beginning of the next
            # phrase.  Grab the timestamp from the keypress just before it,
            # which is the end of the current phrase.
            currentPhrase.endIndex = currentKeyIndex - 1
            endKeypress = keypresses.keyPresses[currentPhrase.endIndex]
            currentPhrase.endTimestamp = datetimeFromTimestamp(endKeypress.Timestamp)
            currentPhrase.finalize()

            phrases.append(currentPhrase)

            currentPhrase = None
            isPhraseEnd = False
            isPhraseStart = True

    keyIndex = 0
    totalGazeKeyPressCount = 0
    totalMachineKeyPressCount = 0
    totalCharacterCount = 0
    totalPhraseKeypressCount = 0
    timeoutCount = 0
    cancelledCount = 0
    spokenCount = 0
    phraseCount = len(phrases)
    wpms = []

    visualizationStr = ""
    
    for phrase in phrases:
        totalGazeKeyPressCount += phrase.gazeKeyPressCount
        totalMachineKeyPressCount += phrase.machineKeyPressCount
        totalCharacterCount += phrase.characterCount
        totalPhraseKeypressCount += phrase.keypressCount()

        if not phrase.startIndex == keyIndex:
            raise Exception(f"Index mismatch. Expected {keyIndex} but got {phrase.startIndex}")
        else:
            keyIndex = phrase.endIndex + 1

        if phrase.wasCancelled:
            cancelledCount += 1
        if phrase.wasTimeout:
            timeoutCount += 1
        if phrase.wasSpoken:
            spokenCount += 1
            wpms.append(phrase.wpm)

        visualizationStr += f"{phrase}\n"

    avgWpms, topWpm = averageWpm(wpms)

    predictions = []
    predictionsCount = 0
    averagePredictionLength = 0.0
    averagePredictionGain = 0.0
    for phrase in phrases:
        predictionsCount += len(phrase.predictions)
        predictions.extend(phrase.predictions)
    for pred in predictions:
        averagePredictionLength += pred.length
        averagePredictionGain += pred.gain
    averagePredictionLength /= predictionsCount
    averagePredictionGain /= predictionsCount

    # The totalPhraseKeypressCount is a bug check, it MUST equal
    # totalKeyspresses.  Otherwise we have lost keypresses somehow
    if not totalPhraseKeypressCount == totalKeyspresses:
        raise Exception(f"Keypress mismatch, {totalKeyspresses - totalPhraseKeypressCount} keypresses missing from phrases. PhraseKeypressCount:{totalPhraseKeypressCount} KeypressCount:{totalKeyspresses}")

    if not totalPhraseKeypressCount == totalGazeKeyPressCount + totalMachineKeyPressCount:
        raise Exception(f"Missing Keypresses KeyPress:{totalPhraseKeypressCount} Gaze:{totalGazeKeyPressCount} Machine:{totalMachineKeyPressCount}")

    if not phraseCount == spokenCount + timeoutCount + cancelledCount:
        raise Exception(f"Phrase mismatch, {phraseCount - (spokenCount + timeoutCount + cancelledCount)} phrases missing.")

    if not predictionsCount == len(predictions):
        raise Exception(f"Predictions mismatch, {predictionsCount} predicitons but found {len(predictions)}")

    visualizationStr += f"{phrase}\n"
    visualizationStr += "\n"
    visualizationStr += f"🗪[Speak: {spokenCount}, AverageWPM: {avgWpms:5.1f}, TopWPM: {topWpm:5.1f}]\n"
    visualizationStr += f"Total Keypresses: {totalKeyspresses} Gaze: {totalGazeKeyPressCount} Characters: {totalCharacterCount}\n"
    visualizationStr += f"Total Phrases:{phraseCount} Spoken:{spokenCount}({spokenCount/phraseCount:0.2%}) Cancelled:{cancelledCount}({cancelledCount/phraseCount:0.2%}) Timeouts:{timeoutCount}({timeoutCount/phraseCount:0.2%})\n"
    visualizationStr += f"Total Predictions: {predictionsCount} Average Length: {averagePredictionLength:0.3f} Average Gain: {averagePredictionGain:0.3f}\n"
    #wpmsStr = f"{wpms}"
    predictionsStr = jsonpickle.encode(predictions)
    phrasesStr = jsonpickle.encode(phrases)

    if args.visualizePath:
        saveStringToFile(args.visualizePath, visualizationStr)
        print(f"Keypress visualization saved to {args.visualizePath}")

    if args.predictionPath:
        saveStringToFile(args.predictionPath, predictionsStr)
        print(f"Keypress predictions saved to {args.predictionPath}")

    if args.phrasesPath:
        saveStringToFile(args.phrasesPath, phrasesStr)
        print(f"Keypress phrases saved to {args.phrasesPath}")

def ListKeypresses(keypresses, args):
    previousTimestamp = datetime.datetime.min

    totalKeysPressed = len(keypresses.keyPresses)

    currentKeyIndex = 0
    gazeKeyPressCount = 0
    keypressesStr = ""

    while currentKeyIndex < totalKeysPressed:
        keypress = keypresses.keyPresses[currentKeyIndex]

        currentTimestamp = datetimeFromTimestamp(keypress.Timestamp)

        isGazeTyped = False
        isChar = (len(keypress.KeyPress) == 1)

        isGazeTyped, deltaTimestamp = isKeyGazeInitiated(keypresses, currentKeyIndex, totalKeysPressed)
        if isGazeTyped:
            gazeKeyPressCount += 1

        isLongPause = False
        if deltaTimestamp > longdeltatime:
            isLongPause = True

        keypressesStr += f"Key:{keypress.KeyPress:13} Timestamp:{keypress.Timestamp.seconds:12}.{keypress.Timestamp.nanos:09} Delta:{deltaTimestamp} Gaze:{isGazeTyped:2} Character:{isChar:2} isLongPause:{isLongPause}\n"

        currentKeyIndex += 1

    keypressesStr += f"{totalKeysPressed} pressed, {gazeKeyPressCount} human initiated - {(gazeKeyPressCount/totalKeysPressed):.2%}\n"

    if args.streamPath:
        saveStringToFile(args.streamPath, keypressesStr)

    print(f"Keypress stream saved to {args.streamPath}")

def averageWpm(wpms):
    totalWpm = 0.0
    countWpm = 0
    topWpm = 0.0
    averageWpm = 0.0
    for wpm in wpms:
        totalWpm += wpm
        countWpm += 1
        if wpm > topWpm:
            topWpm = wpm

    if countWpm > 0:
        averageWpm = totalWpm / countWpm
    return averageWpm, topWpm

def isKeyGazeInitiated(keypresses, currentKeyIndex, totalKeypressCount):
    isGazeInitiated = True
    deltaTimestamp = datetime.timedelta(0)

    if currentKeyIndex > 0 and currentKeyIndex < totalKeypressCount:
        currentTimestamp = datetimeFromTimestamp(keypresses.keyPresses[currentKeyIndex].Timestamp)
        previousTimestamp = datetimeFromTimestamp(keypresses.keyPresses[currentKeyIndex - 1].Timestamp)
        deltaTimestamp = currentTimestamp - previousTimestamp
        
        if deltaTimestamp < mingazetime:
            isGazeInitiated = False

    return isGazeInitiated, deltaTimestamp

def isCharacter(keypress):
    return len(keypress) == 1

def outputForKeypress(keypress, shiftOn):
    specialKeys = {
        "Space" : " ",
        "OemPeriod" : ".",
        "Oemcomma" : ",",
        "OemQuestion" : "?",
        "OemMinus" : "-",
        "Oemplus" : "=",
        "Oemtilde" : "`",
        "Oem1": ";", # OemSemicolon
        "Oem4" : "[", # OemOpenBrackets
        "Oem5" : "\\", # OemPipe
        "Oem6" : "]", # OemCloseBrackets
        "Oem7" : "'", # OemQuotes
        "Tab" : "↦",
        "Left" : "↶",
        "Right" : "↷",
        "Back" : "🠠",
        "Delete" : "🠠",
        "Enter" : "↩",
        "Return" : "↩",
        "LWin" : "🗔",
        "LControlKey" : "🎛️",
        "LShiftKey" : "↑",
        "D1" : "1",
        "D2" : "2",
        "D3" : "3",
        "D4" : "4",
        "D5" : "5",
        "D6" : "6",
        "D7" : "7",
        "D8" : "8",
        "D9" : "9",
        "D0" : "0",
        }
    shiftedSpecialKeys = {
        "D1" : "!",
        "D2" : "@",
        "D3" : "#",
        "D4" : "$",
        "D5" : "%",
        "D6" : "^",
        "D7" : "&",
        "D8" : "*",
        "D9" : "(",
        "D0" : ")",
        "OemMinus" : "-",
        "Oemplus" : "=",
        "Oem1" : ":", # OemSemicolon
        "Oem4" : "{", # OemOpenBrackets
        "Oem5" : "|", # OemPipe
        "Oem6" : "}", # OemCloseBrackets
        "Oem7" : "\"", # OemQuotes
        "OemPeriod" : ">",
        "Oemcomma" : "<",
        "Oemtilde" : "~",
        "Back" : "🠠",
        "Space" : " ",
        }

    if isCharacter(keypress):
        return keypress
    elif not shiftOn and keypress in specialKeys:
       return specialKeys[keypress]
    elif shiftOn and keypress in shiftedSpecialKeys:
       return shiftedSpecialKeys[keypress]
    else:
        raise Exception(f"{keypress} not handled")

def datetimeFromTimestamp(timestamp):
    return datetime.datetime.fromtimestamp(timestamp.seconds + timestamp.nanos / 1e9)

def loadKeypressesFromDirectory(keypressDirectoryPath):
    files = glob.glob(os.path.join(keypressDirectoryPath, '*.' + "protobuf"))

    sortedfiles = sorted(files)

    keypresses = keypresses_pb2.KeyPresses()
    mergedKeypresses = keypresses_pb2.KeyPresses()
    for filename in sortedfiles:
        f = open(os.path.join(keypressDirectoryPath,filename), "rb")
        bytes = f.read()
        keypresses.ParseFromString(bytes)
        f.close()

        mergedKeypresses.keyPresses.extend(keypresses.keyPresses)

    mergedKeypresses.keyPresses.sort(key=lambda x:datetimeFromTimestamp(x.Timestamp))

    return mergedKeypresses

def loadKeypressesFromFile(keypressFilePath):
    keypresses = keypresses_pb2.KeyPresses()

    filepath = sys.argv[1]

    f = open(keypressFilePath, "rb")
    bytes = f.read()
    keypresses.ParseFromString(bytes)
    f.close()

    return keypresses

def saveStringToFile(outputFilepath, outputString):
    f = open(outputFilepath, "wb")
    n = f.write(outputString.encode())
    f.close()

def parseArguments():
    isValid = True
    parser = argparse.ArgumentParser()
    parser.add_argument('-f',
                        '--file',
                        type=str,
                        help="Path to keypresses protobuf file.",
                        dest='filePath')
    parser.add_argument('-d',
                        '--dir',
                        type=str,
                        help="Path to directory containing one or more keypresses protobuf files.",
                        dest='dirPath')
    parser.add_argument('-m',
                        '--merge',
                        type=str,
                        help="Path to output merged results.",
                        dest='mergePath')
    parser.add_argument('--stream',
                        type=str,
                        help="Path to output decoded stream of keypresses.",
                        dest='streamPath')
    parser.add_argument('--visualize',
                        type=str,
                        help="Path to output visualized results.",
                        dest='visualizePath')
    parser.add_argument('--predictions',
                        type=str,
                        help="Path to output prediction results.",
                        dest='predictionPath')
    parser.add_argument('--phrases',
                        type=str,
                        help="Path to output prediction results.",
                        dest='phrasesPath')

    # Parse and print the results
    args = parser.parse_args()

    # Must specify input -f or -d
    if (args.dirPath == None) == (args.filePath == None):
        print("Must specify either --dir or --file.")
        parser.print_help()
        isValid = False

    return isValid, args

isValidArguments, args = parseArguments()

if not isValidArguments:
    quit()

keypresses = None
if args.dirPath:
    keypresses = loadKeypressesFromDirectory(args.dirPath)
elif args.filePath:
    keypresses = loadKeypressesFromFile(args.filePath)

if not keypresses:
    print("Failed loading keypresses!")
    quit()

if args.streamPath:
    ListKeypresses(keypresses, args)

VisualizeKeypresses(keypresses, args)

print("Process Complete")