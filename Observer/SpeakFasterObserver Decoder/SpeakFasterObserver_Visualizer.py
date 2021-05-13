import keypresses_pb2
import sys
import os
import datetime

# Assuming that eye gaze activation faster than 300ms is faster than realistically possible.
# This is useful for detecting automatic insertion of characters as opposed to manually typed
# characters. A prime example is when predictions are used. A rapid series of backspace keys
# followed by rapid typing of characters
mingazetime = datetime.timedelta(milliseconds=300)

# Assume that after 90 seconds of inactivity we are doing a new utterance
longdeltatime = datetime.timedelta(seconds=90)



# A phrase is defined as a series of keypresses over a period of time
# The phrase may end with it being spoken or not spoken
class Phrase:
    startIndex = 0  # Index of the first keypress in the phrase
    endIndex = 0    # Index of the last keypress in the phrase
    startTimestamp = None
    endTimestamp = None
    outputStr = ""
    endingStr = ""
    wasSpoken = False
    wasCancelled = False
    wasTimeout = False
    characterCount = 0
    backspaceCount = 0
    predictionCount = 0
    gazeKeyPressCount = 0
    wpm = None

    def wpm(self):
        wpm = 0.0
        if self.wasSpoken and self.characterCount > 1:
            wpm =  (self.characterCount / 5) / ((self.endTimestamp - self.startTimestamp).total_seconds() / 60)

        return wpm

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
        returnString = f"[{self.startIndex:8}:{self.endIndex:8}] {self.endingStr} ␂{self.outputStr}␃ {self.endingStr}"
        if self.wasSpoken:
            returnString += f" ⏲{self.wpm():5.1f} Time:{self.endTimestamp} back:{self.backspaceCount} gaze:{self.gazeKeyPressCount} prediction:{self.predictionCount}"

        return returnString

def VisualizeKeypresses(keypresses):
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
            # there is a subsequent character, and it was inserted programmatically
            if (keypress.KeyPress == "LControlKey"
                and currentKeyIndex + 3 < totalKeyspresses 
                and keypresses.keyPresses[currentKeyIndex+1].KeyPress == "LShiftKey"
                and keypresses.keyPresses[currentKeyIndex+2].KeyPress == "Left"
                and keypresses.keyPresses[currentKeyIndex+3].KeyPress == "Back"
                ):
                # Scenario 1: ctrl-shift-left-back == DelWord
                currentPhrase.outputStr += "↞"
                currentKeyIndex += 4
                currentPhrase.backspaceCount += 1 # For DelWord we don't know how many backspaces, so just say "1"
                currentPhrase.gazeKeyPressCount += 1
            else:
                # Scenario 2a: backspaces followed by characters then space = Prediction
                # Scenario 2b: characters then space = Prediction
                charsUsed, charString, charCount = prediction(keypresses, currentKeyIndex, totalKeyspresses)
                currentKeyIndex += charsUsed
                currentPhrase.characterCount += charCount
                currentPhrase.predictionCount += 1
                currentPhrase.gazeKeyPressCount += 1

                currentPhrase.outputStr += charString
        else:
            # next character is gaze initated
            if ((keypress.KeyPress == "LControlKey" or keypress.KeyPress == "RControlKey")
                and currentKeyIndex + 1 < totalKeyspresses):
                nextKeypress = keypresses.keyPresses[currentKeyIndex+1]
                if nextKeypress.KeyPress == "W":    # Ctrl-W == Speak
                    isPhraseEnd = True
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.speak()
                elif nextKeypress.KeyPress == "Q":  # Ctrl-Q == Pause
                    isPhraseEnd = True
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.cancel("⏸")
                elif nextKeypress.KeyPress == "Q":  # Ctrl-E == Stop
                    isPhraseEnd = True
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.cancel("🛑")
                elif nextKeypress.KeyPress == "A":  # Ctrl-A == Select All
                    isPhraseEnd = True              # TODO If ctrl-A is followed by ctrl-W, phrase wasn't cancelled
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                    currentPhrase.cancel("␘")
                elif nextKeypress.KeyPress == "Left":
                    currentPhrase.outputStr +="↶"
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "Right":
                    currentPhrase.outputStr +="↷"
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "X":  # Ctrl-X == Cut
                    currentPhrase.outputStr += "✂️"
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "C":  # Ctrl-C == Copy
                    currentPhrase.outputStr += "📄"
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "V":  # Ctrl-V == Paste
                    currentPhrase.outputStr += "📋"
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "Z":  # Ctrl-Z == Undo
                    currentPhrase.outputStr += "↺"
                    currentKeyIndex += 2
                    currentPhrase.gazeKeyPressCount += 1
                else:
                    currentPhrase.outputStr += outputForKeypress(keypress.KeyPress, False)
                    currentPhrase.characterCount += 1
                    currentKeyIndex += 1
            elif keypress.KeyPress == "LShiftKey":
                if (currentKeyIndex + 1 < totalKeyspresses 
                    and not keypresses.keyPresses[currentKeyIndex+1].KeyPress == "LShiftKey"
                    and not keypresses.keyPresses[currentKeyIndex+1].KeyPress == "LControlKey"):
                    currentPhrase.outputStr += outputForKeypress(keypresses.keyPresses[currentKeyIndex+1].KeyPress, True)
                    currentKeyIndex += 2
                    currentPhrase.characterCount += 1
                    currentPhrase.gazeKeyPressCount += 2
                else:
                    currentPhrase.outputStr += outputForKeypress(keypress.KeyPress, False)
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

                currentPhrase.outputStr += outputForKeypress(keypress.KeyPress, False)
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
            # The currentKeyIndex is pointing to the beginning of the next phrase.
            # Grab the timestamp from the keypress just before it, which is the
            # end of the current phrase.
            currentPhrase.endIndex = currentKeyIndex - 1
            endKeypress = keypresses.keyPresses[currentPhrase.endIndex]
            currentPhrase.endTimestamp = datetimeFromTimestamp(endKeypress.Timestamp)

            phrases.append(currentPhrase)

            currentPhrase = None
            isPhraseEnd = False
            isPhraseStart = True

    # TODO sum these from each phrase
    totalGazeKeyPressCount = 0
    totalCharacterCount = 0
    totalPhraseKeypressCount = 0
    timeoutCount = 0
    cancelledCount = 0
    spokenCount = 0
    phraseCount = len(phrases)
    wpms = []
    
    for phrase in phrases:
        totalGazeKeyPressCount += phrase.gazeKeyPressCount
        totalCharacterCount += phrase.characterCount
        totalPhraseKeypressCount += phrase.keypressCount()
        if phrase.wasCancelled:
            cancelledCount += 1
        if phrase.wasTimeout:
            timeoutCount += 1
        if phrase.wasSpoken:
            spokenCount += 1
            wpms.append(phrase.wpm())

        print(phrase)

    avgWpms, topWpm = averageWpm(wpms)

    # The totalPhraseKeypressCount is a bug check, it MUST equal totalKeyspresses.
    # Otherwise we have lost keypresses somehow
    if not totalPhraseKeypressCount == totalKeyspresses:
        raise Exception(f"Keypress mismatch, {totalKeyspresses - totalPhraseKeypressCount} keypresses missing from phrases. PhraseKeypressCount:{totalPhraseKeypressCount} KeypressCount:{totalKeyspresses}")

    print("")
    print(f"🗪[Speak: {spokenCount}, AverageWPM: {avgWpms:5.1f}, TopWPM: {topWpm:5.1f}]")
    print(f"Total Keypresses: {totalKeyspresses} Gaze: {totalGazeKeyPressCount} Characters: {totalCharacterCount}")
    print(f"Total Phrases:{phraseCount} Spoken:{spokenCount} Cancelled:{cancelledCount} Timeouts:{timeoutCount}")
    print(f"wpms:{wpms}")

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

def prediction(keypresses, currentKeyIndex, totalKeypressCount):
    charString = "🗩"   # the string representation of the prediction. ie: "🗩🠠🠠HELLO "
    charsUsed = 0       # the number of keypresses used in the prediction, 8 in the case of "🗩🠠🠠HELLO "
    charCount = 0       # the number of actual characters contributed to the output, 4 in the case of "🗩🠠🠠HELLO "

    index = currentKeyIndex
    isNextGazeInitiated = False

    while index < totalKeypressCount and not isNextGazeInitiated:
        currentKeypress = keypresses.keyPresses[index]

        charString += outputForKeypress(currentKeypress.KeyPress, False)

        # Just keep eating automatic keypresses until next gaze initiated key
        isNextGazeInitiated, deltaTimestamp = isKeyGazeInitiated(keypresses, index + 1, totalKeypressCount)
        index += 1
        charsUsed += 1

        if currentKeypress.KeyPress == "Back":
            charCount -= 1
        elif isCharacter(currentKeypress.KeyPress):
            charCount += 1

    return charsUsed, charString, charCount

def isKeyGazeInitiated(keypresses, currentKeyIndex, totalKeypressCount):
    isGazeInitiated = True
    deltaTimestamp = datetime.timedelta(0)

    if currentKeyIndex > 0 and currentKeyIndex < totalKeypressCount:
        currentTimestamp = datetimeFromTimestamp(keypresses.keyPresses[currentKeyIndex].Timestamp)
        previousTimestamp = datetimeFromTimestamp(keypresses.keyPresses[currentKeyIndex-1].Timestamp)
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

def listFilesWithExtension(dirname,extension):
    return (f for f in os.listdir(dirname) if f.endswith('.' + extension))

def datetimeFromTimestamp(timestamp):
    return datetime.datetime.fromtimestamp(timestamp.seconds + timestamp.nanos/1e9)

# TODO switch to argparse
# - option to process directory (automerge)
# - option to process file
if len(sys.argv) != 2:
  print(f"Usage: {sys.argv[0]} input_file")
  sys.exit(-1)

keypresses = keypresses_pb2.KeyPresses()

filepath = sys.argv[1]

f = open(filepath, "rb")
bytes = f.read()
keypresses.ParseFromString(bytes)
f.close()

VisualizeKeypresses(keypresses)