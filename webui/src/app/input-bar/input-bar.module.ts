import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {FavoriteButtonModule} from '../favorite-button/favorite-button.module';
import {InputBarChipModule} from '../input-bar-chip/input-bar-chip.module';
import {InputTextPredictionsModule} from '../input-text-predictions/input-text-predictions.module';
import {SpeakButtonModule} from '../speak-button/speak-button.module';

import {InputBarComponent} from './input-bar.component';

@NgModule({
  declarations: [InputBarComponent],
  imports: [
    BrowserModule,
    FavoriteButtonModule,
    InputBarChipModule,
    InputTextPredictionsModule,
    SpeakButtonModule,
  ],
  exports: [InputBarComponent],
})
export class InputBarModule {
}
