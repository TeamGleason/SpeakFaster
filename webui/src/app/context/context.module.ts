import {NgModule} from '@angular/core';
import {BrowserModule} from '@angular/platform-browser';

import {ContextComponent} from './context.component';
import {ConversationTurnModule} from '../conversation-turn/conversation-turn.module';

@NgModule({
  declarations: [ContextComponent],
  imports: [
    BrowserModule,
    ConversationTurnModule,
  ],
  exports: [ContextComponent],
})
export class ContextModule {
}
