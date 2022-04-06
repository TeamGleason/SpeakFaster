import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {FavoriteButtonModule} from '../favorite-button/favorite-button.module';

import {PhraseEditingComponent} from './phrase-editing.component';

@NgModule({
  declarations: [PhraseEditingComponent],
  imports: [
    BrowserModule,
    FavoriteButtonModule,
  ],
  exports: [PhraseEditingComponent],
})
export class PhraseEditingModule {
}
