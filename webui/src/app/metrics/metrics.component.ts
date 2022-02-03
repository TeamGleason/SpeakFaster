import {ChangeDetectorRef, Component, Input, OnInit} from '@angular/core';
import {Subject} from 'rxjs';

import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

const ASSUMED_AVERAGE_WORD_LENGTH = 5;
const MILLIS_PER_MINUTE = 60 * 1000;

@Component({
  selector: 'app-metrics-component',
  templateUrl: './metrics.component.html',
})
export class MetricsComponent implements OnInit {
  @Input() textEntryBeginSubject!: Subject<TextEntryBeginEvent>;
  @Input() textEntryEndSubject!: Subject<TextEntryEndEvent>;

  private currentStartTimeMillis: number|null = null;
  private elapsedTimesMillis: number[] = [];
  private charCounts: number[] = [];
  private humanKeystrokeCounts: Array<number|null> = [];

  constructor(private changeDtectorRef: ChangeDetectorRef) {}

  ngOnInit() {
    this.textEntryBeginSubject.subscribe((event: TextEntryBeginEvent) => {
      this.currentStartTimeMillis = event.timestampMillis;
      console.log(`Text entry begin at ${event.timestampMillis}`);
    });
    this.textEntryEndSubject.subscribe((event: TextEntryEndEvent) => {
      if (!event.isFinal || event.isAborted) {
        return;
      }
      if (this.currentStartTimeMillis === null) {
        console.error(
            'Received text-entry end event before a text-entry begin event.');
        return;
      }
      if (event.timestampMillis < this.currentStartTimeMillis) {
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
      this.charCounts.push(numCharacters);
      if (event.numHumanKeypresses != null) {
        this.humanKeystrokeCounts.push(event.numHumanKeypresses);
      } else {
        this.humanKeystrokeCounts.push(null);
      }
      this.changeDtectorRef.detectChanges();
    });
  }

  /** Calculates the metrics for the latest completed text entry event. */
  get latestKsr(): number|null {
    const n = this.elapsedTimesMillis.length;
    if (n === 0) {
      return null;
    }
    const humanKeystrokeCount = this.humanKeystrokeCounts[n - 1];
    if (humanKeystrokeCount === null) {
      return null;
    }
    return 1 - humanKeystrokeCount / this.charCounts[n - 1];
  }

  get latestWpm(): number|null {
    const n = this.elapsedTimesMillis.length;
    if (n === 0) {
      return null;
    }
    const elapsedTimeMillis = this.elapsedTimesMillis[n - 1];
    const charCount = this.charCounts[n - 1];
    const wordCount = charCount / ASSUMED_AVERAGE_WORD_LENGTH;
    return wordCount / (elapsedTimeMillis / MILLIS_PER_MINUTE);
  }

  /** Calculates the overall keystroke saving rate (KSR). */
  get overallKsr(): number|null {
    if (this.charCounts.length === 0) {
      return null;
    }
    let totalChars = 0;
    let totalHumanKeypresses = 0;
    for (let i = 0; i < this.charCounts.length; ++i) {
      const characterCount = this.charCounts[i];
      const humanKeystrokeCount = this.humanKeystrokeCounts[i];
      if (humanKeystrokeCount === null) {
        continue;
      }
      totalChars += characterCount;
      totalHumanKeypresses += humanKeystrokeCount;
    }
    if (totalChars === 0) {
      return null;
    }
    return 1 - totalHumanKeypresses / totalChars;
  }

  /** Calculates the overall text-entry speed in words per minute (WPM). */
  get overallWpm(): number|null {
    if (this.elapsedTimesMillis.length === 0) {
      return null;
    }
    const totalTimeMillis = this.elapsedTimesMillis.reduce((p, c) => p + c);
    const totalWordCount =
        this.charCounts.map(count => count / ASSUMED_AVERAGE_WORD_LENGTH)
            .reduce((p, c) => p + c);
    return totalWordCount / (totalTimeMillis / MILLIS_PER_MINUTE);
  }
}
