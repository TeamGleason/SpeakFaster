import {ChangeDetectorRef, Component, Input, OnInit} from '@angular/core';
import {Subject} from 'rxjs';

import {TextEntryBeginEvent, TextInjection} from '../types/text-injection';

const ASSUMED_AVERAGE_WORD_LENGTH = 5;
const MILLIS_PER_MINUTE = 60 * 1000;

@Component({
  selector: 'app-metrics-component',
  templateUrl: './metrics.component.html',
})
export class MetricsComponent implements OnInit {
  @Input() textEntryBeginSubject!: Subject<TextEntryBeginEvent>;
  @Input() textInjectionSubject!: Subject<TextInjection>;

  private currentStartTimeMillis: number|null = null;
  private elapsedTimesMillis: number[] = [];
  private characterCounts: number[] = [];
  overallWordsPerMinute: number|null = null;

  constructor(private changeDtectorRef: ChangeDetectorRef) {}

  ngOnInit() {
    this.textEntryBeginSubject.subscribe((event: TextEntryBeginEvent) => {
      this.currentStartTimeMillis = event.timestampMillis;
      console.log(`Text entry begin at ${event.timestampMillis}`);
    });
    this.textInjectionSubject.subscribe((event: TextInjection) => {
      if (this.currentStartTimeMillis === null) {
        console.error(
            'Received text-entry end event before a text-entry begin event.');
        return;
      }
      if (event.timestampMillis <= this.currentStartTimeMillis) {
        console.error('Timestamp out of order');
        this.currentStartTimeMillis = null;
        return;
      }
      const numCharacters = event.text.length;
      if (!(numCharacters > 0)) {
        console.error(
            `Expected numCharacters to be > 0, but got ${numCharacters}`);
        return;
      }
      console.log(`Text entry ends at ${event.timestampMillis}`);
      this.elapsedTimesMillis.push(
          event.timestampMillis - this.currentStartTimeMillis);
      this.characterCounts.push(numCharacters);
      this.calculateMetrics();
      this.changeDtectorRef.detectChanges();
    });
  }

  private calculateMetrics() {
    const totalTimeMillis = this.elapsedTimesMillis.reduce((p, c) => p + c);
    const totalWordCount =
        this.characterCounts.map(count => count / ASSUMED_AVERAGE_WORD_LENGTH)
            .reduce((p, c) => p + c);
    this.overallWordsPerMinute =
        totalWordCount / (totalTimeMillis / MILLIS_PER_MINUTE);
    console.log(
        `total time = ${totalTimeMillis / 1e3} s; ` +
        `total words = ${totalWordCount}; ` +
        `wpm = ${this.overallWordsPerMinute.toFixed(1)}`);
  }
}
