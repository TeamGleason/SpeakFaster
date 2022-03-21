import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {SettingsEyeGazeComponent} from './settings-eye-gaze.component';

@NgModule({
  declarations: [SettingsEyeGazeComponent],
  imports: [
    BrowserModule,
  ],
  exports: [SettingsEyeGazeComponent],
})
export class SettingsEyeGazeModule {
}
