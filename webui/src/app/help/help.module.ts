import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {ScrollButtonsModule} from '../scroll-buttons/scroll-buttons.modue';

import {HelpComponent} from './help.component';

@NgModule({
  declarations: [HelpComponent],
  imports: [
    BrowserModule,
    ScrollButtonsModule,
  ],
  exports: [HelpComponent],
})
export class HelpModule {
}
