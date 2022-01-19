/** Unit tests for context.ts. */

import {Injectable} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {Subject} from 'rxjs';

import {ContextComponent} from '../context/context.component';
import {ContextModule} from '../context/context.module';
import {SpeakFasterService} from '../speakfaster-service';

import {getConversationTurnContextSignal} from './context';
import {TextEntryEndEvent} from './text-entry';

@Injectable()
class SpeakFasterServiceForTest {
  // TODO(cais): Flesh out test implementations.
}

describe('getConversationTurnContextSignal', () => {
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let fixture: ComponentFixture<ContextComponent>;

  beforeEach(async () => {
    textEntryEndSubject = new Subject();
    await TestBed
        .configureTestingModule({
          imports: [ContextModule],
          declarations: [ContextComponent],
          providers: [
            {provide: SpeakFasterService, useValue: SpeakFasterServiceForTest}
          ],
        })
        .compileComponents();
    fixture = TestBed.createComponent(ContextComponent);
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.detectChanges();
  });

  it('creates ConversationTurnContextSignal correctly, populating timestamp',
     () => {
       const signal = getConversationTurnContextSignal('foo_user', {
         speakerId: 'bar_speaker',
         speechContent: 'greetings, mate!',
         startTimestamp: new Date(123456),
       });
       expect(signal.userId).toEqual('foo_user');
       expect(signal.contextId.length).toBeGreaterThan(0);
       expect(signal.timestamp.getTime()).toEqual(123456);
       expect(signal.conversationTurn.speakerId).toEqual('bar_speaker');
       expect(signal.conversationTurn.speechContent)
           .toEqual('greetings, mate!');
       expect(signal.conversationTurn.startTimestamp.getTime()).toEqual(123456);
       expect(signal.isHardcoded).toBeUndefined();
     });
  providers:
      [{provide: SpeakFasterService, useValue: SpeakFasterServiceForTest}]
  it('preserves provided contextId', () => {
    const signal = getConversationTurnContextSignal(
        'foo_user', {
          speakerId: 'bar_speaker',
          speechContent: 'greetings, mate!',
          startTimestamp: new Date(123456),
        },
        '1234abcd');
    expect(signal.contextId).toEqual('1234abcd');
  });

  it('preserves isHardcoded', () => {
    const signal = getConversationTurnContextSignal('foo_user', {
      speakerId: 'bar_speaker',
      speechContent: 'greetings, mate!',
      startTimestamp: new Date(123456),
      isHardcoded: true
    });
    expect(signal.isHardcoded).toEqual(true);
  });

  it('textEntryEndSubject event causes emission of context string', () => {
    const recordedContextStrings: string[][] = [];
    fixture.componentInstance.contextStringsSelected.subscribe(
        (contextStrings: string[]) => {
          recordedContextStrings.push(contextStrings);
        });
    textEntryEndSubject.next({
      text: 'testing, testing',
      timestampMillis: Date.now(),
      isFinal: true,
    });

    expect(recordedContextStrings).toEqual([['testing, testing']]);
  });
});
