import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {AbbreviationModule} from './abbreviation/abbreviation.module';
import {AppRoutingModule} from './app-routing.module';
import {AppComponent} from './app.component';
import {AuthModule} from './auth/auth.module';
import {ContextModule} from './context/context.module';

@NgModule({
  declarations: [AppComponent],
  imports: [
    AbbreviationModule,
    AppRoutingModule,
    AuthModule,
    ContextModule,
    BrowserModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {
}
