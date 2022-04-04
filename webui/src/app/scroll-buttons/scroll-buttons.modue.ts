import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {ScrollButtonsComponent} from './scroll-button.component';

@NgModule({
  declarations: [ScrollButtonsComponent],
  imports: [
    BrowserModule,
  ],
  exports: [ScrollButtonsComponent],
})
export class ScrollButtonsModule {
}
