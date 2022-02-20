import {NgModule} from '@angular/core';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {BrowserModule} from '@angular/platform-browser';

import {SettingsComponent} from './settings.component';

@NgModule({
  declarations: [SettingsComponent],
  imports: [
    BrowserModule,
    MatProgressSpinnerModule,
  ],
  exports: [SettingsComponent],
})
export class SettingsModule {
}
