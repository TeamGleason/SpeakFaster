/** Component for in-app event logging. */
import {Component, Input, OnInit} from '@angular/core';
import {createUuid} from 'src/utils/uuid';

@Component({
  selector: 'app-logger-component',
  templateUrl: './logger.component.html',
})
export class LoggerComponent implements OnInit {
  @Input() userId!: string;

  private sessionId: string = createUuid();

  ngOnInit() {
    console.log(`LoggerComponent: userId = ${this.userId}; sessionId = ${
        this.sessionId}`);
  }
}
