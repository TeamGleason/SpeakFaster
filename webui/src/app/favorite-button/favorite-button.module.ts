import {NgModule} from '@angular/core';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {BrowserModule} from '@angular/platform-browser';

import {FavoriteButtonComponent} from './favorite-button.component';

@NgModule({
  declarations: [FavoriteButtonComponent],
  imports: [
    BrowserModule,
    MatProgressSpinnerModule,
  ],
  exports: [FavoriteButtonComponent],
})
export class FavoriteButtonModule {
}
