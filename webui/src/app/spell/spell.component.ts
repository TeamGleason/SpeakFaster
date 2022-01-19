import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {ExternalEventsComponent, repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
import {AbbreviationSpec, AbbreviationToken} from '../types/abbreviation';

// TODO(cais): Support workflow: enter initial-only abbreviation, get no
// matching AE option, continue to type out any word of the phrase, and
// hit enter to perform AE with keyword. Can enter more keywords if still has
// no match.
// TODO(cais): Support workflow, same as above, but before entering the
// keyword, first click a button to indicate which word is being spelled out.
export enum SpellingState {
  CHOOSING_TOKEN = 'CHOOSING_TOKEN',
  SPELLING_TOKEN = 'SPELLING_TOKEN',
  DONE = 'DONE',
}

@Component({
  selector: 'app-spell-component',
  templateUrl: './spell.component.html',
})
export class SpellComponent implements OnInit, AfterViewInit, OnChanges {
  private static readonly _NAME = 'SpellComponent';
  private readonly instanceId = SpellComponent._NAME + '_' + createUuid();

  @Input() originalAbbreviationSpec!: AbbreviationSpec;
  @Output()
  newAbbreviationSpec: EventEmitter<AbbreviationSpec> = new EventEmitter();

  @ViewChildren('clickableButton')
  clickableButtons!: QueryList<ElementRef<HTMLButtonElement>>;

  originalAbbreviationChars: string[] = [];
  // Which word in the abbreviated phrase is being spelled.
  spellIndex: number|null = null;
  state: SpellingState = SpellingState.CHOOSING_TOKEN;
  tokenSpellingInput: string = '';
  private originalReconText: string = '';

  // Words that have already been spelled out so far. This supports
  // incremental spelling out of multiple words in an abbreviation.
  readonly spelledWords: Array<string|null> = [];

  ngOnInit() {
    console.log('ngOnInit(): this.spellIndex=', this.spellIndex);  // DEBUG
    console.log(
        'ngOnInit(): this.originalReconText=',
        this.originalReconText);  // DEBUG
    ExternalEventsComponent.registerKeypressListener(
        this.listenToKeypress.bind(this));
    if (this.originalReconText === '') {
      this.resetState();
    }
  }

  ngAfterViewInit() {
    // TODO(cais): Ensure button box registration.
    // TODO(cais): Add unit tests. DO NOT SUBMIT.
    this.clickableButtons.changes.subscribe(
        (queryList: QueryList<ElementRef<HTMLButtonElement>>) => {
          updateButtonBoxesForElements(this.instanceId, queryList);
        });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.originalAbbreviationSpec &&
        changes.originalAbbreviationSpec.previousValue &&
        changes.originalAbbreviationSpec.previousValue.lineageId !==
            changes.originalAbbreviationSpec.currentValue.lineageId) {
      console.log(
          'prev:', changes.originalAbbreviationSpec.previousValue);  // DEBUG
      console.log(
          'curr:', changes.originalAbbreviationSpec.currentValue);  // DEBUG
      this.resetState();
    }
  }

  private resetState() {
    console.log('********************* resetState()');  // DEBUG
    this.originalAbbreviationChars.splice(0);
    this.spelledWords.splice(0);
    this.originalAbbreviationSpec.tokens.forEach(token => {
      this.originalAbbreviationChars.push(token.value);
      this.spelledWords.push(null);
    });
  }

  listenToKeypress(keySequence: string[], reconstructedText: string): void {
    const lastKey = keySequence[keySequence.length - 1];
    if (this.state === SpellingState.CHOOSING_TOKEN ||
        this.state === SpellingState.DONE) {
      const spellIndices: number[] = [];
      this.originalAbbreviationSpec.tokens.forEach((abbreviationToken, i) => {
        if (abbreviationToken.value.toLowerCase() === lastKey) {
          spellIndices.push(i);
        }
      });
      if (spellIndices.length === 1) {
        // There is a unique matching token.
        this.spellIndex = spellIndices[0];
        this.state = SpellingState.SPELLING_TOKEN;
        this.originalReconText =
            reconstructedText.slice(0, reconstructedText.length - 1);
        console.log(
            '###Updated original recon text:',
            this.originalReconText);  // DEBUG
        this.tokenSpellingInput =
            reconstructedText.slice(this.originalReconText.length);
        // TODO(cais): Disallow punctuation?
      }
    } else if (this.state === SpellingState.SPELLING_TOKEN) {
      if (lastKey === ' ' || lastKey == VIRTUAL_KEY.ENTER) {
        // Use a space to terminate the spelling and trigger anothe remote AE
        // call.
        this.endSpelling();
      } else {
        console.log(
            'Type: recon text=', reconstructedText,
            ', originalReconText=', this.originalReconText);  // DEBUG
        this.tokenSpellingInput =
            reconstructedText.slice(this.originalReconText.length);
      }
    }
  }

  onDoneButtonClicked(event: Event) {
    this.endSpelling();
  }

  onTokenButtonClicked(event: Event, i: number) {
    // TODO(cais): Add test. Test manually. DO NOT SUBMIT.
    this.spellIndex = i;
    this.tokenSpellingInput = this.originalAbbreviationChars[i];
    this.state = SpellingState.SPELLING_TOKEN;
    if (this.spelledWords.length !== this.originalAbbreviationChars.length) {
      this.spelledWords.splice(0);
      for (let i = 0; i < this.originalAbbreviationChars.length; ++i) {
        this.spelledWords.push(null);
      }
    }
  }

  stringAtIndex(i: number): string {
    if (this.spelledWords.length > 0 && this.spelledWords[i] !== null) {
      return this.spelledWords[i] as string;
    } else {
      return this.originalAbbreviationChars[i];
    }
  }

  private endSpelling() {
    this.state = SpellingState.DONE;
    const abbreviationSpec = this.recreateAbbreviation();
    this.originalAbbreviationSpec = abbreviationSpec;
    this.newAbbreviationSpec.emit(abbreviationSpec);
    this.tokenSpellingInput = '';
    this.spellIndex = null;
    updateButtonBoxesToEmpty(SpellComponent._NAME);
  }

  private recreateAbbreviation(): AbbreviationSpec {
    this.spelledWords[this.spellIndex!] = this.tokenSpellingInput.trim();
    console.log('recon:', this.spelledWords);  // DEBUG
    const tokens: AbbreviationToken[] = [];
    for (let i = 0; i < this.originalAbbreviationChars.length; ++i) {
      if (this.spelledWords[i] !== null) {
        tokens.push({
          value: this.spelledWords[i] as string,
          isKeyword: true,
        });
      } else {
        const char = this.originalAbbreviationChars[i];
        tokens.push({
          value: char,
          isKeyword: false,
        });
      }
      this.spelledWords
    }
    let newAbbreviationSpec: AbbreviationSpec = {
      tokens,
      readableString: tokens.map(token => token.value).join(' '),
      lineageId: this.originalAbbreviationSpec.lineageId,
    };
    if (this.originalAbbreviationSpec.eraserSequence !== undefined) {
      newAbbreviationSpec = {
        ...newAbbreviationSpec,
        eraserSequence: [
          ...this.originalAbbreviationSpec.eraserSequence,
          ...repeatVirtualKey(
              VIRTUAL_KEY.BACKSPACE, this.tokenSpellingInput.length + 1),
        ],
      };
    }
    return newAbbreviationSpec;
  }
}
