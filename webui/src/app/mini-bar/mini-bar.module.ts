import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {MiniBarComponent} from './mini-bar.component';

@NgModule({
  declarations: [MiniBarComponent],
  imports: [
    BrowserModule,
  ],
  exports: [MiniBarComponent],
})
export class MiniBarModule {
}
