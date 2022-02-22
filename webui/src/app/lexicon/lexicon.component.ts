/** Component processing personal names in text. */
import {Component, Input, OnInit} from '@angular/core';

import {GetLexiconResponse, SpeakFasterService, TextPredictionResponse} from '../speakfaster-service';

export function canonicalizeName(name: string): string {
  name = name.trim();
  return name.slice(0, 1).toLocaleUpperCase() +
      name.slice(1).toLocaleLowerCase();
}

export function chooseStringRandomly(strings: string[]): string {
  if (strings.length === 0) {
    throw new Error('Cannot choose at random: array is empty.')
  }
  const n = strings.length;
  const i = Math.min(Math.floor(Math.random() * n), n - 1);
  return strings[i];
}

@Component({
  selector: 'app-lexicon-component',
  templateUrl: './lexicon.component.html',
  providers: [SpeakFasterService],
})
export class LexiconComponent implements OnInit {
  //   private static readonly listeners: TextToSpeechListener[] = [];
  private static readonly PERSONAL_NAMES_TAG = 'partner-name';
  private static GIVEN_NAMES: string[]|null = null;
  private static readonly registeredNames: string[] = [];

  public static replacePersonNamesWithKnownValues(inputString: string): string {
    if (LexiconComponent.registerName.length === 0) {
      return inputString;
    }
    if (LexiconComponent.GIVEN_NAMES === null ||
        LexiconComponent.GIVEN_NAMES.length === 0) {
      return inputString;
    }
    const words = inputString.split(' ').filter(word => word.length > 0);
    for (let i = 0; i < words.length; ++i) {
      let canonicalWord = canonicalizeName(words[i]);
      let punctuation = '';
      if (canonicalWord.match(/[A-Za-z]+[,;\-\.\?\!]/)) {
        punctuation = canonicalWord.slice(canonicalWord.length - 1);
        canonicalWord = canonicalWord.slice(0, canonicalWord.length - 1);
      }
      if (LexiconComponent.GIVEN_NAMES.indexOf(canonicalWord) !== -1 &&
          LexiconComponent.registeredNames.length > 0) {
        // This is given name.
        const initialLetter = canonicalWord.slice(0, 1).toLocaleLowerCase();
        const matchingRegisteredNames =
            LexiconComponent.registeredNames.filter(name => {
              return name.toLocaleLowerCase().startsWith(initialLetter);
            });
        if (matchingRegisteredNames.length > 0) {
          words[i] =
              chooseStringRandomly(matchingRegisteredNames) + punctuation;
        }
      }
    }
    return words.join(' ');
  }

  @Input() userId!: string;

  errorMessage?: string|null = null;

  constructor(public speakFasterService: SpeakFasterService) {}

  ngOnInit() {
    if (LexiconComponent.GIVEN_NAMES === null) {
      this.speakFasterService
          .getLexicon({
            languageCode: 'en-us',
            subset: 'LEXICON_SUBSET_GIVEN_NAMES',
          })
          .subscribe((response: GetLexiconResponse) => {
            if (LexiconComponent.GIVEN_NAMES !== null) {
              return;
            }
            LexiconComponent.GIVEN_NAMES = response.words.slice();
          });
    }

    this.speakFasterService
        .textPrediction({
          userId: this.userId,
          contextTurns: [],
          textPrefix: '',
          timestamp: new Date().toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          allowedTags: [LexiconComponent.PERSONAL_NAMES_TAG],
        })
        .subscribe((data: TextPredictionResponse) => {
          data.contextualPhrases?.forEach(phrase => {
            LexiconComponent.registerName(phrase.text);
          });
          console.log(
              'Reigstered personal names:',
              JSON.stringify(LexiconComponent.registeredNames));
        });
  }

  private static registerName(name: string): void {
    name = canonicalizeName(name);
    if (LexiconComponent.registeredNames.indexOf(name) !== -1) {
      return;
    }
    LexiconComponent.registeredNames.push(name);
  }

  private static unregisterName(name: string): void {
    name = canonicalizeName(name);
    const index = LexiconComponent.registeredNames.indexOf(name);
    if (index === -1) {
      return;
    }
    LexiconComponent.registeredNames.splice(index, 1);
  }
}
