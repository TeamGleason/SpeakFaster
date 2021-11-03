import {Component, EventEmitter, HostListener, Input, Output} from '@angular/core';

import {isTextContentKey} from '../../utils/keyboard-utils';
import {AbbreviationSpec, AbbreviationToken} from '../types/abbreviations';

enum SpellingState {
  CHOOSING_TOKEN = 'CHOOSING_TOKEN',
  SPELLILNG_TOKEN = 'SPELLING_TOKEN',
  DONE = 'DONE',
}

@Component({
  selector: 'app-spell-component',
  templateUrl: './spell.component.html',
})
export class SpellComponent {
  @Input() abbreviatedTokens: string[] = [];
  @Input() spellIndex: number|null = null;
  @Output()
  newAbbreviationSpec: EventEmitter<AbbreviationSpec> = new EventEmitter();

  state: SpellingState = SpellingState.CHOOSING_TOKEN;
  tokenSpellingInput: string = '';

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (this.abbreviatedTokens.length === 0) {
      return;
    }
    if (this.state === SpellingState.CHOOSING_TOKEN) {
      // TODO(cais): Support circular selection of duplicate characters.
      // TODO(cais): Support spelling multiple words
      const key = event.key.toLocaleLowerCase();
      const index = this.abbreviatedTokens.indexOf(key);
      if (index !== -1) {
        this.startSpellingToken(index);
      }
    } else if (this.state === SpellingState.SPELLILNG_TOKEN) {
      if (event.ctrlKey &&
          (event.key.toLocaleLowerCase() === 's' ||
           event.key.toLocaleLowerCase() === 'e')) {
        // Ctrl S or Ctrl E ends the spelling process.
        this.endSpelling();
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      if (event.key === 'Backspace' && this.tokenSpellingInput.length > 0) {
        this.tokenSpellingInput = this.tokenSpellingInput.substring(
            0, this.tokenSpellingInput.length - 1);
        event.preventDefault();
        event.stopPropagation();
      } else if (isTextContentKey(event)) {
        this.tokenSpellingInput += event.key.toLocaleLowerCase();
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }

  onDoneButtonClicked(event: Event) {
    this.endSpelling();
  }

  onTokenButtonClicked(event: Event, i: number) {
    this.startSpellingToken(i);
  }

  private startSpellingToken(index: number) {
    this.spellIndex = index;
    this.tokenSpellingInput = this.abbreviatedTokens[index];
    this.state = SpellingState.SPELLILNG_TOKEN;
  }

  private endSpelling() {
    this.state = SpellingState.DONE;
    this.newAbbreviationSpec.emit(this.reconstructAbbreviation());
  }

  private reconstructAbbreviation(): AbbreviationSpec {
    const abbrevSpec: AbbreviationSpec = {tokens: [], readableString: ''};
    let currentToken: AbbreviationToken = {value: '', isKeyword: false};
    for (let i = 0; i < this.abbreviatedTokens.length; ++i) {
      if (i === this.spellIndex) {
        if (currentToken.value.length > 0) {
          abbrevSpec.tokens.push(currentToken);
        }
        abbrevSpec.tokens.push({
          value: this.tokenSpellingInput,
          isKeyword: true,
        });
        currentToken = {value: '', isKeyword: false};
      } else {
        const char = this.abbreviatedTokens[i];
        currentToken.value += char;
      }
    }
    if (currentToken.value.length > 0) {
      abbrevSpec.tokens.push(currentToken);
    }
    abbrevSpec.readableString =
        abbrevSpec.tokens.map(token => token.value).join(' ');
    return abbrevSpec;
  }
}
