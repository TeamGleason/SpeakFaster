import {HttpClientModule} from '@angular/common/http';
import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';

import {PartnerComponent} from './partner.component';

@NgModule({
  declarations: [PartnerComponent],
  imports: [
    BrowserAnimationsModule,
    BrowserModule,
    HttpClientModule,
  ],
  exports: [PartnerComponent],
})
export class PartnerModule {
}
