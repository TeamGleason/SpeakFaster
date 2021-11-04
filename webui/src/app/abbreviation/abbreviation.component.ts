import {Component, EventEmitter, HostListener, Input, OnInit, Output} from '@angular/core';
import {Subject} from 'rxjs';

import {isPlainAlphanumericKey} from '../../utils/keyboard-utils';
import {SpeakFasterService} from '../speakfaster-service';
import {AbbreviationExpansionSelectionEvent, AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviations';

@Component({
  selector: 'app-abbreviation-component',
  templateUrl: './abbreviation.component.html',
  providers: [SpeakFasterService],
})
export class AbbreviationComponent implements OnInit {
  @Input() endpoint!: string;
  @Input() accessToken!: string;
  @Input() speechContent!: string|null;
  @Input()
  abbreviationExpansionTriggers!: Subject<InputAbbreviationChangedEvent>;
  @Input() isKeyboardEventBlocked: boolean = false;
  @Output()
  abbreviationExpansionSelected:
      EventEmitter<AbbreviationExpansionSelectionEvent> = new EventEmitter();

  abbreviation: AbbreviationSpec|null = null;
  requestOngoing: boolean = false;
  responseError: string|null = null;
  abbreviationOptions: string[] = [];
  private _selectedAbbreviationIndex: number = -1;

  constructor(private speakFasterService: SpeakFasterService) {}

  ngOnInit() {
    this.abbreviationExpansionTriggers.subscribe(
        (event: InputAbbreviationChangedEvent) => {
          this.abbreviation = event.abbreviationSpec;
          if (event.triggerExpansion) {
            this.expandAbbreviation();
          }
        });
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (this.isKeyboardEventBlocked) {
      return;
    }
    if (event.altKey || event.metaKey) {
      return;
    }
    const keyIndex = event.keyCode - 49;
    // Ctrl E or Enter activates AE.
    // Ctrl Q clears all the expansion options (if any).
    if ((event.ctrlKey && event.key.toLocaleLowerCase() === 'e') ||
        (isPlainAlphanumericKey(event, 'Enter', false))) {
      this.expandAbbreviation();
      event.preventDefault();
      event.stopPropagation();
    } else if (event.ctrlKey && event.key.toLocaleLowerCase() === 'q') {
      this.abbreviationOptions.splice(0);
      event.preventDefault();
      event.stopPropagation();
    } else if (
        event.shiftKey && keyIndex >= 0 &&
        keyIndex < this.abbreviationOptions.length) {
      this.selectExpansionOption(keyIndex);
      event.preventDefault();
      event.stopPropagation();
    }
  }

  get selectedAbbreviationIndex() {
    return this._selectedAbbreviationIndex;
  }

  onExpansionOptionButtonClicked(event: Event, index: number) {
    this.selectExpansionOption(index);
  }

  private selectExpansionOption(index: number) {
    if (this._selectedAbbreviationIndex === index) {
      return;
    }
    this._selectedAbbreviationIndex = index;
    this.abbreviationExpansionSelected.emit({
      expansionText: this.abbreviationOptions[this._selectedAbbreviationIndex]
    });
    setTimeout(() => this.resetState(), 1000);
  }

  private resetState() {
    this.abbreviation = null;
    this.requestOngoing = false;
    this.responseError = null;
    if (this.abbreviationOptions.length > 0) {
      this.abbreviationOptions.splice(0);
    }
    this._selectedAbbreviationIndex = -1;
  }

  private expandAbbreviation() {
    if (!this.endpoint) {
      this.responseError = 'Cannot expand abbreviation: endpoint is empty';
      return;
    }
    if (this.speechContent === null) {
      this.responseError =
          'Cannot expand abbreviation: no speech content as context';
      return;
    }
    if (this.abbreviation === null) {
      this.responseError = 'Cannot expand abbreviation: empty abbreviation';
      return;
    }
    this.abbreviationOptions = [];
    this.requestOngoing = true;
    this.responseError = null;
    console.log('Calling expandAbbreviation():', this.abbreviation);
    this.speakFasterService
        .expandAbbreviation(
            this.endpoint, this.accessToken, this.speechContent,
            this.abbreviation)
        .subscribe(
            data => {
              this.requestOngoing = false;
              if (data.exactMatches != null) {
                this.abbreviationOptions = data.exactMatches;
              }
            },
            error => {
              this.requestOngoing = false;
              this.responseError = error.message;
            });
  }
}
