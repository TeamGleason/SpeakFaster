import {AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, QueryList, SimpleChanges, ViewChildren} from '@angular/core';
import {updateButtonBoxesForElements, updateButtonBoxesToEmpty} from 'src/utils/cefsharp';
import {createUuid} from 'src/utils/uuid';

import {ExternalEventsComponent, getVirtualkeyCode, repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
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
export class SpellComponent implements OnInit, OnChanges {
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

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    ExternalEventsComponent.registerKeypressListener(
        this.listenToKeypress.bind(this));
    if (this.originalReconText === '') {
      this.resetState();
    }
  }

  ngAfterViewInit() {
    if (this.clickableButtons === undefined) {
      return;
    }
    updateButtonBoxesForElements(this.instanceId, this.clickableButtons);
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
      this.resetState();
    }
  }

  private resetState() {
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
        this.tokenSpellingInput =
            reconstructedText.slice(this.originalReconText.length);
        this.cdr.detectChanges();
        // TODO(cais): Disallow punctuation?
      }
    } else if (this.state === SpellingState.SPELLING_TOKEN) {
      if (lastKey === ' ' || lastKey == VIRTUAL_KEY.ENTER) {
        // Space or Enter terminates the spelling and trigger a new AE call.
        this.endSpelling();
      } else {
        this.tokenSpellingInput =
            reconstructedText.slice(this.originalReconText.length);
        this.cdr.detectChanges();
      }
    }
  }

  onTokenButtonClicked(event: Event, i: number) {
    (window as any)
        .externalKeypressHook(
            getVirtualkeyCode(this.originalAbbreviationChars[i]));
  }

  onDoneButtonClicked(event: Event) {
    this.endSpelling();
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
    this.cdr.detectChanges();
  }

  private recreateAbbreviation(): AbbreviationSpec {
    this.spelledWords[this.spellIndex!] = this.tokenSpellingInput.trim();
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
