import {Component, HostListener, Input} from '@angular/core';

import {SpeakFasterService} from '../speakfaster-service';

@Component({
  selector: 'app-abbreviation-component',
  templateUrl: './abbreviation.component.html',
  providers: [SpeakFasterService],
})
export class AbbreviationComponent {
  @Input() endpoint!: string;
  @Input() accessToken!: string;
  @Input() abbreviation!: string;
  @Input() speechContent!: string|null;

  requestOngoing: boolean = false;
  responseError: string|null = null;
  abbreviationOptions: string[] = [];
  private _selectedAbbreviationIndex: number = -1;

  constructor(private speakFasterService: SpeakFasterService) {}

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    // Ctrl E activates AE.
    if (event.altKey || event.metaKey) {
      return;
    }
    const keyIndex = event.keyCode - 49;
    if (event.ctrlKey && event.key.toLocaleLowerCase() === 'e') {
      this.expandAbbreviation();
      event.preventDefault();
    } else if (event.shiftKey &&
               keyIndex >= 0 && keyIndex < this.abbreviationOptions.length) {
      this._selectedAbbreviationIndex = keyIndex;
      event.preventDefault();
    }
  }

  get selectedAbbreviationIndex() {
    return this._selectedAbbreviationIndex;
  }

  private expandAbbreviation() {
    if (!this.endpoint) {
      this.responseError = 'Cannot expand abbreviation: endpoint is empty';
      return;
    }
    if (this.speechContent === null) {
      this.responseError =
          'Cannot expand abbreviation: no speech content as contex';
      return;
    }
    this.abbreviationOptions = [];
    this.requestOngoing = true;
    this.responseError = null;
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
