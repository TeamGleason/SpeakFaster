import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {ConversationTurnComponent} from './conversation-turn.component';

@NgModule({
  declarations: [ConversationTurnComponent],
  imports: [
    BrowserModule,
  ],
  exports: [ConversationTurnComponent],
})
export class ConversationTurnModule {
}
