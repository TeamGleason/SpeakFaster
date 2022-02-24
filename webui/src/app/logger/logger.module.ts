import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {LoggerComponent} from './logger.component';

@NgModule({
  declarations: [LoggerComponent],
  imports: [
    BrowserModule,
  ],
  exports: [LoggerComponent],
})
export class LoggerModule {
}
