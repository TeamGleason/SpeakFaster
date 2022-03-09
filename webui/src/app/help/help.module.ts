import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {HelpComponent} from './help.component';

@NgModule({
  declarations: [HelpComponent],
  imports: [
    BrowserModule,
  ],
  exports: [HelpComponent],
})
export class HelpModule {
}
