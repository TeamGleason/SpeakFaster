Wikipedia defines WPM as 5 characters, including spaces and punctuation.  See: https://en.wikipedia.org/wiki/Words_per_minute

I found that I had to define the start and end timestamp.  I defined the start timestamp to be -1 character from the first character received
(e.g. it takes '1 character' of time to type the first character) and the 'speak' button press as the end timestamp.  Or in other words my formula is:

```
ElapsedTimeInSeconds = TimestampSpeak - TimestampFirstCharacter

RawSecondsPerCharacterSpoken = CountOfCharactersSpoken / ETIS

CorrectedSecondsPerCharacterSpoken = COCS / (ETIS + RSPCS)

WordsPerMinute = (60 / CSPCS) / 5
```
