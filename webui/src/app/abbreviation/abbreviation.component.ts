import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnInit, Output, QueryList, ViewChildren} from '@angular/core';
import {Subject} from 'rxjs';

import {updateButtonBoxes} from '../../utils/cefsharp';
import {isPlainAlphanumericKey} from '../../utils/keyboard-utils';
import {SpeakFasterService} from '../speakfaster-service';
import {AbbreviationExpansionSelectionEvent, AbbreviationSpec, InputAbbreviationChangedEvent} from '../types/abbreviations';


@Component({
  selector: 'app-abbreviation-component',
  templateUrl: './abbreviation.component.html',
  providers: [SpeakFasterService],
})
export class AbbreviationComponent implements OnInit, AfterViewInit {
  private static readonly _NAME = 'AbbreviationComponent';

  @Input() endpoint!: string;
  @Input() accessToken!: string;
  @Input() contextStrings!: string[];
  @Input()
  abbreviationExpansionTriggers!: Subject<InputAbbreviationChangedEvent>;
  @Input() isKeyboardEventBlocked: boolean = false;
  @Output()
  abbreviationExpansionSelected:
      EventEmitter<AbbreviationExpansionSelectionEvent> = new EventEmitter();

  @ViewChildren('abbreviationOption')
  viewButtons!: QueryList<ElementRef<HTMLButtonElement>>;

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

  ngAfterViewInit() {
    this.viewButtons.changes.subscribe((r: QueryList<ElementRef>) => {
      setTimeout(() => {
        const boxes: Array<[number, number, number, number]> = [];
        r.forEach(elementRef => {
          const box = elementRef.nativeElement.getBoundingClientRect();
          boxes.push([box.left, box.top, box.right, box.bottom]);
        });
        updateButtonBoxes(AbbreviationComponent._NAME, boxes);
      }, 20);
      // TODO(cais): Can we get rid of this ugly hack? The position of the
      // elements change during layout.
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
    if (this.contextStrings.length === 0) {
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
    const LIMIT_TURNS = 2;
    const usedContextStrings = [...this.contextStrings];
    if (usedContextStrings.length > LIMIT_TURNS) {
      usedContextStrings.splice(0, usedContextStrings.length - LIMIT_TURNS);
    }
    // TODO(cais): Limit by token length?
    console.log(
        'Calling expandAbbreviation():', usedContextStrings, this.abbreviation);
    this.speakFasterService
        .expandAbbreviation(
            this.endpoint, this.accessToken, usedContextStrings.join('|'),
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
