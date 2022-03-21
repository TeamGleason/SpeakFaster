import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';

import {AbbreviationRefinementComponent} from './abbreviation-refinement.component';

@NgModule({
  declarations: [AbbreviationRefinementComponent],
  imports: [
    BrowserModule,
    MatProgressSpinnerModule,
  ],
  exports: [AbbreviationRefinementComponent],
})
export class AbbreviationRefinementModule {
}
