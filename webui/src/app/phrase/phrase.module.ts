import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {FavoriteButtonModule} from '../favorite-button/favorite-button.module';

import {PhraseComponent} from './phrase.component';

@NgModule({
  declarations: [PhraseComponent],
  imports: [
    BrowserModule,
    FavoriteButtonModule,
  ],
  exports: [PhraseComponent],
})
export class PhraseModule {
}
