/** Component processing personal names in text. */
import {Component, Input, OnInit} from '@angular/core';
import {Subject} from 'rxjs';

import {GetLexiconResponse, SpeakFasterService, TextPredictionResponse} from '../speakfaster-service';

export interface LoadLexiconRequest {
  prefix: string;
}

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
})
export class LexiconComponent implements OnInit {
  private static readonly PERSONAL_NAMES_TAG = 'partner-name';
  private static GIVEN_NAMES: string[]|null = null;
  private static readonly REGISTERED_NAMES: string[] = [];
  private static readonly FULL_LEXICON_BY_PREFIX:
      {[prefix: string]: string[]} = {};
  private static readonly VALID_WORD_REGEX = /[A-Za-z]+[,;\-\.\?\!]/;

  /**
   * Replace personal names in input string with registered, user-specific
   * personal names.
   */
  public static replacePersonNamesWithKnownValues(inputString: string): string {
    if (LexiconComponent.GIVEN_NAMES === null ||
        LexiconComponent.GIVEN_NAMES.length === 0) {
      return inputString;
    }
    const words = inputString.split(' ').filter(word => word.length > 0);
    for (let i = 0; i < words.length; ++i) {
      let canonicalWord = canonicalizeName(words[i]);
      let punctuation = '';
      if (canonicalWord.match(LexiconComponent.VALID_WORD_REGEX)) {
        punctuation = canonicalWord.slice(canonicalWord.length - 1);
        canonicalWord = canonicalWord.slice(0, canonicalWord.length - 1);
      }
      if (LexiconComponent.GIVEN_NAMES.indexOf(canonicalWord) !== -1 &&
          LexiconComponent.REGISTERED_NAMES.length > 0) {
        // This is given name.
        const initialLetter = canonicalWord.slice(0, 1).toLocaleLowerCase();
        const matchingRegisteredNames =
            LexiconComponent.REGISTERED_NAMES.filter(name => {
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

  /**
   * Determines if input string is a valid word in the lexicon.
   * If lexicon is not loaded, return false. If lexicon is loaded, returns true
   * if and only if `inputString` matches any of the words in the lexicon in a
   * case-insensitive way.
   */
  public static isValidWord(inputString: string): boolean {
    if (inputString.length === 0) {
      return false;
    }
    inputString = inputString.toLocaleLowerCase();
    const firstLetter = inputString[0];
    if (LexiconComponent.FULL_LEXICON_BY_PREFIX[firstLetter] === undefined) {
      return false;
    }
    return LexiconComponent.FULL_LEXICON_BY_PREFIX[firstLetter].indexOf(
               inputString) !== -1;
  }


  @Input() userId!: string;
  @Input() languageCode!: string;
  @Input() loadPrefixedLexiconRequestSubject!: Subject<LoadLexiconRequest>;

  errorMessage?: string|null = null;

  constructor(public speakFasterService: SpeakFasterService) {}

  ngOnInit() {
    this.loadPrefixedLexiconRequestSubject.subscribe(
        (request: LoadLexiconRequest) => {
          this.loadPrefixedLexicon(request.prefix);
        });

    if (LexiconComponent.GIVEN_NAMES === null) {
      this.speakFasterService
          .getLexicon({
            languageCode: this.languageCode,
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
              'Registered personal names:',
              JSON.stringify(LexiconComponent.REGISTERED_NAMES));
        });
  }

  private static registerName(name: string): void {
    name = canonicalizeName(name);
    if (LexiconComponent.REGISTERED_NAMES.indexOf(name) !== -1) {
      return;
    }
    LexiconComponent.REGISTERED_NAMES.push(name);
  }

  private static unregisterName(name: string): void {
    name = canonicalizeName(name);
    const index = LexiconComponent.REGISTERED_NAMES.indexOf(name);
    if (index === -1) {
      return;
    }
    LexiconComponent.REGISTERED_NAMES.splice(index, 1);
  }

  /** Loads the full (non-subset) lexicon for given prefix. */
  private loadPrefixedLexicon(prefix: string) {
    if (prefix.length === 0) {
      throw new Error('Prefix cannot be empty');
    }
    if (prefix.length !== 1) {
      throw new Error(`Prefix string must have length 1; got ${prefix.length}`);
    }
    if (LexiconComponent.FULL_LEXICON_BY_PREFIX[prefix] !== undefined) {
      // Already loaded.
      return;
    }
    this.speakFasterService
        .getLexicon({
          languageCode: this.languageCode,
          prefix,
        })
        .subscribe((response: GetLexiconResponse) => {
          if (LexiconComponent.FULL_LEXICON_BY_PREFIX[prefix] !== undefined) {
            return;
          }
          LexiconComponent.FULL_LEXICON_BY_PREFIX[prefix] =
              response.words.map(word => word.toLocaleLowerCase());
        });
  }
}
