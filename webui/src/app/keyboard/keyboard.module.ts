import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {KeyboardComponent} from './keyboard.component';

@NgModule({
  declarations: [KeyboardComponent],
  imports: [
    BrowserModule,
  ],
  exports: [KeyboardComponent],
})
export class KeyboardModule {
}
