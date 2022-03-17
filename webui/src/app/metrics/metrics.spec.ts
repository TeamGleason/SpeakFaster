import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Subject} from 'rxjs';

import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

import {MetricsComponent} from './metrics.component';
import {MetricsModule} from './metrics.module';

describe('MetricsComponent', () => {
  let textEntryBeginSubject: Subject<TextEntryBeginEvent>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let fixture: ComponentFixture<MetricsComponent>;

  beforeEach(async () => {
    await TestBed
        .configureTestingModule({
          imports: [MetricsModule],
          declarations: [MetricsComponent],
        })
        .compileComponents();
    textEntryBeginSubject = new Subject();
    textEntryEndSubject = new Subject();
    fixture = TestBed.createComponent(MetricsComponent);
    fixture.componentInstance.textEntryBeginSubject = textEntryBeginSubject;
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.detectChanges();
  });

  it('wpm and ksr are initially hidden', () => {
    const wpmContainer = fixture.debugElement.query(By.css('.wpm'));
    expect(wpmContainer).toBeNull();
    const ksrContainer = fixture.debugElement.query(By.css('.ksr'));
    expect(ksrContainer).toBeNull();
  });

  it('after end without human keypresses count, displays wpm, no ksr', () => {
    textEntryBeginSubject.next({
      timestampMillis: 1000,
    });
    textEntryEndSubject.next({
      timestampMillis: 2000,
      text: 'Hello',  // 5 chars => 1 word.
      isFinal: true,
    });
    const wpmContainer = fixture.debugElement.query(By.css('.wpm'));
    const overallWpm = wpmContainer.query(By.css('.overall-metric-value'));
    expect(overallWpm.nativeElement.innerText.trim()).toEqual('60.0');
    const ksrContainer = fixture.debugElement.query(By.css('.ksr'));
    expect(ksrContainer).toBeNull();
  });

  it('after end with human keypresses count, displays wpm and ksr', () => {
    textEntryBeginSubject.next({
      timestampMillis: 1000,
    });
    textEntryEndSubject.next({
      timestampMillis: 2000,
      text: 'Hello',          // 5 chars => 1 word.
      numHumanKeypresses: 2,  // KSR = 1 - 2 / 5 = 0.6.
      isFinal: true,
    });
    const wpmContainer = fixture.debugElement.query(By.css('.wpm'));
    const overallWpm = wpmContainer.query(By.css('.overall-metric-value'));
    expect(overallWpm.nativeElement.innerText.trim()).toEqual('60.0');
    const ksrContainer = fixture.debugElement.query(By.css('.ksr'));
    const overallKsr = ksrContainer.query(By.css('.overall-metric-value'));
    expect(overallKsr.nativeElement.innerText.trim()).toEqual('0.60');
  });

  for (const secondEventHumanKeypresses of [2, undefined]) {
    it('after 2 end events, displays overall & latest wpm+ksr: ' +
           `second event keypresses: ${secondEventHumanKeypresses}`,
       () => {
         // First end event.
         textEntryBeginSubject.next({
           timestampMillis: 1000,
         });
         textEntryEndSubject.next({
           timestampMillis: 2000,
           text: 'Hello',          // 5 chars => 1 word.
           numHumanKeypresses: 2,  // KSR = 1 - 2 / 5 = 0.6.
           isFinal: true,
         });
         // Second end event.
         textEntryBeginSubject.next({
           timestampMillis: 1000,
         });
         textEntryEndSubject.next({
           timestampMillis: 2000,
           text: 'Hello moon',  // 10 chars => 2 words
           numHumanKeypresses: secondEventHumanKeypresses,
           isFinal: true,
         });
         const wpmContainer = fixture.debugElement.query(By.css('.wpm'));
         const overallWpm = wpmContainer.query(By.css('.overall-metric-value'));
         // Total 15 chars => 3 words. Total duration: 2000 ms => overall speed
         // = 3 / 2 * 60 = 90 wpm.
         expect(overallWpm.nativeElement.innerText.trim()).toEqual('90.0');
         const latestWpm = wpmContainer.query(By.css('.latest-metric'));
         expect(latestWpm.nativeElement.innerText.trim())
             .toEqual('(latest:120.0)');
         const ksrContainer = fixture.debugElement.query(By.css('.ksr'));
         const overallKsr = ksrContainer.query(By.css('.overall-metric-value'));
         if (secondEventHumanKeypresses === 2) {
           // Total 15 chars. Total human keypresses = 4. 1 - 4 / 15 = 0.73.
           expect(overallKsr.nativeElement.innerText.trim()).toEqual('0.73');
           const latestKsr = ksrContainer.query(By.css('.latest-metric'));
           expect(latestKsr.nativeElement.innerText.trim())
               .toEqual('(latest:0.80)');
         } else {
           // secondEventHUmanKeypresses is undfined.
           expect(overallKsr.nativeElement.innerText.trim()).toEqual('0.60');
           const latestKsr = ksrContainer.query(By.css('.latest-metric'));
           expect(latestKsr).toBeNull();
         }
       });
  }

  for (const firstEventHumanKeypresses of [2, undefined]) {
    it('after 2 end events, displays overall & latest wpm+ksr: ' +
           `first event keypresses: ${firstEventHumanKeypresses}`,
       () => {
         // First end event.
         textEntryBeginSubject.next({
           timestampMillis: 1000,
         });
         textEntryEndSubject.next({
           timestampMillis: 2000,
           text: 'Hello',  // 5 chars => 1 word.
           numHumanKeypresses:
               firstEventHumanKeypresses,  // KSR = 1 - 2 / 5 = 0.6.
           isFinal: true,
         });
         // Second end event.
         textEntryBeginSubject.next({
           timestampMillis: 1000,
         });
         textEntryEndSubject.next({
           timestampMillis: 2000,
           text: 'Hello moon',  // 10 chars => 2 words
           numHumanKeypresses: 2,
           isFinal: true,
         });
         const wpmContainer = fixture.debugElement.query(By.css('.wpm'));
         const overallWpm = wpmContainer.query(By.css('.overall-metric-value'));
         // Total 15 chars => 3 words. Total duration: 2000 ms => overall speed
         // = 3 / 2 * 60 = 90 wpm.
         expect(overallWpm.nativeElement.innerText.trim()).toEqual('90.0');
         const latestWpm = wpmContainer.query(By.css('.latest-metric'));
         expect(latestWpm.nativeElement.innerText.trim())
             .toEqual('(latest:120.0)');
         const ksrContainer = fixture.debugElement.query(By.css('.ksr'));
         const overallKsr = ksrContainer.query(By.css('.overall-metric-value'));
         if (firstEventHumanKeypresses === 2) {
           expect(overallKsr.nativeElement.innerText.trim()).toEqual('0.73');
         } else {
           // firstEventHUmanKeypresses is undfined.
           expect(overallKsr.nativeElement.innerText.trim()).toEqual('0.80');
         }
         const latestKsr = ksrContainer.query(By.css('.latest-metric'));
         expect(latestKsr.nativeElement.innerText.trim())
             .toEqual('(latest:0.80)');
       });
  }

  it('ignores aborted event', () => {
    textEntryBeginSubject.next({
      timestampMillis: 1000,
    });
    textEntryEndSubject.next({
      timestampMillis: 2000,
      text: '',
      isFinal: true,
      isAborted: true,
    });
    const wpmContainer = fixture.debugElement.query(By.css('.wpm'));
    expect(wpmContainer).toBeNull();
    const ksrContainer = fixture.debugElement.query(By.css('.ksr'));
    expect(ksrContainer).toBeNull();
  });
});
