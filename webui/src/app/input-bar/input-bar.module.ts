import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {SpeakButtonModule} from '../speak-button/speak-button.module';
import {SpellModule} from '../spell/spell.module';

import {InputBarComponent} from './input-bar.component';

@NgModule({
  declarations: [InputBarComponent],
  imports: [
    BrowserModule,
    SpeakButtonModule,
    SpellModule,
  ],
  exports: [InputBarComponent],
})
export class InputBarModule {
}
