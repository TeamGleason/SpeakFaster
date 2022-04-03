/** The help component. */
import {Component, ElementRef, ViewChild} from '@angular/core';
import {createUuid} from 'src/utils/uuid';

import {ABBREVIATION_MAX_PROPER_LENGTH} from '../input-bar/input-bar.component';

@Component({
  selector: 'app-help-component',
  templateUrl: './help.component.html',
})
export class HelpComponent {
  private static readonly _NAME = 'HelpComponent';
  private readonly instanceId = HelpComponent._NAME + '_' + createUuid();

  @ViewChild('scrollTarget')
  scrollTarget!: ElementRef<HTMLDivElement>;

  get maxAbbreviationLength(): number {
    return ABBREVIATION_MAX_PROPER_LENGTH;
  }
}
