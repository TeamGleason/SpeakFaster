import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {SpellModule} from '../spell/spell.module';

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
