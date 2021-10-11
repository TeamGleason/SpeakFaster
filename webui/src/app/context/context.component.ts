import {Component, OnInit} from '@angular/core';

import {secondsBeforeNow} from '../../utils/datetime-utils';

import {ConversationTurn} from './context';

@Component({
  selector: 'app-context-component',
  templateUrl: './context.component.html',
  providers: [],
})
export class ContextComponent implements OnInit {
  // TODO(cais): Do not hardcode this.
  conversationTurns: ConversationTurn[] = [
    {
      startTime: secondsBeforeNow(10),
      speaker: null,
      content: 'Hi Sean',
    },
    {
      startTime: secondsBeforeNow(5),
      speaker: 'Tim',
      content: 'Where is the dog'
    }
  ];

  constructor() {}

  ngOnInit() {}
}
