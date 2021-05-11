import keypresses_pb2
import sys
import os
import datetime

# Assuming that eye gaze activation faster than 300ms is faster than realistically possible.
# This is useful for detecting automatic insertion of characters as opposed to manually typed
# characters. A prime example is when predictions are used. A rapid series of backspace keys
# followed by rapid typing of characters
mingazetime = datetime.timedelta(milliseconds=300)

# Phase 1:
# 
# Raw: Characters, Space Delimited, Other Ctrl/Alt Modifiers (Ctl-, Alt-)
# Char Analysis: Speak, Stop, Pause, Enter, Backspace, Count of Characters Spoken
# Timing Analysis: Backword, Use Prediction, WPM
# Context Analysis: STX, ETX, CAN
# 
# ETX is inserted when detecting Speak, Stop, or Cancel.
# Cancel is detected if after STX, CTRL-A is received before Speak.
# When STX ... Stop/Pause ... Speak is detected, WPM timings are not calculated.

# Example Output:
# 
# ␂ H E L K 🠠 L O ␃ 💬 ⏲12.3
# ␂ H E L 🗩HELLO ␃ 💬 ⏲16.3
# 🗪 { Speak : 2 , Characters : 10, AverageWPM : 14.3 , TopWPM : 16.3 }

def VisualizeKeypresses(keypresses):
    previousKeypress = None
    isPhraseStart = True
    isPhraseEnd = False
    totalPhraseCount = 0
    totalCharacterCount = 0
    characterCount = 0
    wpms = []
    phraseStartTimestamp = None
    outputStr = ""

    totalKeyspresses = len(keypresses.keyPresses)

    currentKeyIndex = 0
    gazeKeyPressCount = 0

    while currentKeyIndex < totalKeyspresses:
        keypress = keypresses.keyPresses[currentKeyIndex]
        currentTimestamp = datetimeFromTimestamp(keypress.Timestamp)
        previousCharacterDelta = None
        nextCharacterDelta = None

        isGazeInitiated, previousCharacterDelta = isKeyGazeInitiated(keypresses, currentKeyIndex, totalKeyspresses)
        if isGazeInitiated:
            gazeKeyPressCount += 1

        if isPhraseStart:
            outputStr = "␂"
            isPhraseStart = False
            isPhraseEnd = False
            wasPhraseSpoken = False
            phraseStartTimestamp = currentTimestamp
            characterCount = 0
            backspaceCount = 0

        isNextGazeInitialized, nextCharacterDelta = isKeyGazeInitiated(keypresses, currentKeyIndex + 1, totalKeyspresses)

        if not isNextGazeInitialized:
            # there is a subsequent character, and it was inserted programmatically
            if (keypress.KeyPress == "LControlKey"
                and currentKeyIndex + 3 < totalKeyspresses 
                and keypresses.keyPresses[currentKeyIndex+1].KeyPress == "LShiftKey"
                and keypresses.keyPresses[currentKeyIndex+2].KeyPress == "Left"
                and keypresses.keyPresses[currentKeyIndex+3].KeyPress == "Back"
                ):
                # Scenario 1: ctrl-shift-left-back == DelWord
                outputStr += "↞"
                currentKeyIndex += 4
                backspaceCount += 1 # For DelWord we don't know how many backspaces, so just say "1"
            else:
                # Scenario 2a: backspaces followed by characters then space = Prediction
                # Scenario 2b: characters then space = Prediction
                charsUsed, charString, charCount = prediction(keypresses, currentKeyIndex, totalKeyspresses)
                currentKeyIndex += charsUsed
                characterCount += charCount

                outputStr += charString
        else:
            # next character is gaze initated
            if ((keypress.KeyPress == "LControlKey" or keypress.KeyPress == "RControlKey")
                and currentKeyIndex + 1 < totalKeyspresses):
                nextKeypress = keypresses.keyPresses[currentKeyIndex+1]
                if nextKeypress.KeyPress == "W":    # Ctrl-W == Speak
                    isPhraseEnd = True
                    wasPhraseSpoken = True
                    outputStr += "␃💬"
                    currentKeyIndex += 2
                    gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "Q":  # Ctrl-Q == Pause
                    isPhraseEnd = True
                    wasPhraseSpoken = False
                    outputStr += "␃⏸"
                    currentKeyIndex += 2
                    gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "Q":  # Ctrl-E == Stop
                    isPhraseEnd = True
                    wasPhraseSpoken = False
                    outputStr += "␃🛑"
                    currentKeyIndex += 2
                    gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "A":  # Ctrl-A == Select All
                    isPhraseEnd = True
                    wasPhraseSpoken = False
                    outputStr += "␘"
                    currentKeyIndex += 2
                    gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "Left":
                    outputStr +="↶"
                    currentKeyIndex += 2
                    gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "Right":
                    outputStr +="↷"
                    currentKeyIndex += 2
                    gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "X":  # Ctrl-X == Cut
                    outputStr += "✂️"
                    currentKeyIndex += 2
                    gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "C":  # Ctrl-C == Copy
                    outputStr += "📄"
                    currentKeyIndex += 2
                    gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "V":  # Ctrl-V == Paste
                    outputStr += "📋"
                    currentKeyIndex += 2
                    gazeKeyPressCount += 1
                elif nextKeypress.KeyPress == "Z":  # Ctrl-Z == Undo
                    outputStr += "↺"
                    currentKeyIndex += 2
                    gazeKeyPressCount += 1
                else:
                    outputStr += outputForKeypress(keypress.KeyPress, False)
                    characterCount += 1
                    currentKeyIndex += 1
            elif keypress.KeyPress == "LShiftKey":
                if (currentKeyIndex + 1 < totalKeyspresses 
                    and not keypresses.keyPresses[currentKeyIndex+1].KeyPress == "LShiftKey"
                    and not keypresses.keyPresses[currentKeyIndex+1].KeyPress == "LControlKey"):
                    outputStr += outputForKeypress(keypresses.keyPresses[currentKeyIndex+1].KeyPress, True)
                    currentKeyIndex += 2
                    characterCount += 1
                else:
                    outputStr += outputForKeypress(keypress.KeyPress, False)
                    characterCount += 1
                    currentKeyIndex += 1
            else:
                if keypress.KeyPress == "Back":
                    backspaceCount += 1
                    characterCount -= 1
                else:
                    characterCount += 1

                outputStr += outputForKeypress(keypress.KeyPress, False)
                currentKeyIndex += 1

                if currentKeyIndex >= totalKeyspresses:
                    isPhraseEnd = True

        if isPhraseEnd:
            isPhraseEnd = False
            isPhraseStart = True

            wpm = 0.0

            if characterCount > 0:
                totalPhraseCount += 1
                totalCharacterCount += characterCount
                wpm = (characterCount / 5) / ((currentTimestamp - phraseStartTimestamp).total_seconds() / 60)
                wpms.append(wpm)

            if wasPhraseSpoken:
                outputStr += f"{outputStr}⏲{wpm:5.1f} backspaces {backspaceCount}"

            print(outputStr)

    # Note in the above example, characters is the effective characters (ie: what was actually spoken)
    # Since "HELLO" was spoken twice the characters are 5 per phrase, or 10 total
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

    print("")
    print(f"🗪[Speak: {totalPhraseCount}, Characters: {totalCharacterCount}, AverageWPM: {averageWpm:5.1f}, TopWPM: {topWpm:5.1f}]")

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

    if currentKeyIndex > 0 and currentKeyIndex < totalKeypressCount - 1:
        currentTimestamp = datetimeFromTimestamp(keypresses.keyPresses[currentKeyIndex].Timestamp)
        previousTimestamp = datetimeFromTimestamp(keypresses.keyPresses[currentKeyIndex-1].Timestamp)
        deltaTimestamp = currentTimestamp - previousTimestamp
        
        if deltaTimestamp < mingazetime:
            isGazeInitiated = False

    return isGazeInitiated, deltaTimestamp

def isCharacter(keypress):
    return (len(keypress) == 1)

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

if len(sys.argv) != 2:
  print(f"Usage: {sys.argv[0]} input_file")
  sys.exit(-1)

keypresses = keypresses_pb2.KeyPresses()

filepath = sys.argv[1]

files = listFilesWithExtension(filepath, "protobuf")

for filename in files:
    f = open(os.path.join(filepath,filename), "rb")
    bytes = f.read()
    keypresses.ParseFromString(bytes)
    f.close()

    VisualizeKeypresses(keypresses)