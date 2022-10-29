import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import * as cefSharp from '../../utils/cefsharp';
import {StudyManager} from '../study/study-manager';
import {TestListener} from '../test-utils/test-cefsharp-listener';

import {ConversationTurnComponent} from './conversation-turn.component';
import {ConversationTurnModule} from './conversation-turn.module';

describe('ConversationTurnComponent', () => {
  let fixture: ComponentFixture<ConversationTurnComponent>;
  let testListener: TestListener;

  beforeEach(async () => {
    testListener = new TestListener();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    await TestBed
        .configureTestingModule({
          imports: [ConversationTurnModule],
          declarations: [ConversationTurnComponent],
        })
        .compileComponents();
    fixture = TestBed.createComponent(ConversationTurnComponent);
  });

  it('displays short tts turn text without ellipses', () => {
    fixture.componentInstance.turn = {
      speakerId: 'foo_speaker',
      startTimestamp: new Date(),
      speechContent: 'Hi, there!',
      isTts: false,
    };
    fixture.detectChanges();
    const turnContent =
        fixture.debugElement.query(By.css('.turn-content')).nativeElement;
    expect(turnContent.innerText).toEqual('Hi, there!');
    const speakerTag =
        fixture.debugElement.query(By.css('.speaker-tag')).nativeElement;
    expect(speakerTag.innerText).toEqual('foo_speaker');
  });

  it('displays long tts turn with ellipses', () => {
    fixture.componentInstance.turn = {
      speakerId: 'bar_speaker',
      startTimestamp: new Date(),
      speechContent:
          'The rose is red, the violet is blue, the honey is sweet, ' +
          'and so are you. ' +
          'The rose is red, the violet is blue, the honey is sweet, ' +
          'and so are you. ' +
          'The rose is red, the violet is blue, the honey is sweet, ' +
          'and so are you.',
      isTts: true,
    };
    fixture.detectChanges();
    const turnContent =
        fixture.debugElement.query(By.css('.turn-content')).nativeElement;
    expect(turnContent.innerText)
        .toEqual(
            '...so are you. ' +
            'The rose is red, the violet is blue, the honey is sweet, and so are you. ' +
            'The rose is red, the violet is blue, the honey is sweet, and so are you.');
  });

  for (const isTts of [undefined, false]) {
    it(`displays non-tts turn text without tts tag: isTts = ${isTts}`, () => {
      fixture.componentInstance.turn = {
        speakerId: 'foo_speaker',
        startTimestamp: new Date(),
        speechContent: 'Hi, there!',
        isTts,
      };
      fixture.detectChanges();
      const ttsTag = fixture.debugElement.query(By.css('.tts-tag'));
      expect(ttsTag).toBeNull();
    });
  }

  it('calls updateButtonBoxesCalls', fakeAsync(() => {
       fixture.componentInstance.turn = {
         speakerId: 'foo_speaker',
         startTimestamp: new Date(),
         speechContent: 'Hi, there!',
       };
       fixture.detectChanges();
       fixture.componentInstance.ngAfterContentChecked();
       tick();

       const calls = testListener.updateButtonBoxesCalls;
       expect(calls.length).toBeGreaterThan(0);
       const lastCall = calls[calls.length - 1];
       expect(lastCall[0].indexOf('ConversationTurnComponent')).toEqual(0);
       expect(lastCall[1].length).toEqual(1);
       expect(lastCall[1][0].length).toEqual(4);
     }));

  it('does not call updateButtonBoxes under study mode', fakeAsync(() => {
       fixture.componentInstance.disableGazeClick = true;
       fixture.componentInstance.turn = {
         speakerId: 'foo_speaker',
         startTimestamp: new Date(),
         speechContent: 'Hi, there!',
       };
       fixture.detectChanges();
       fixture.componentInstance.ngAfterContentChecked();
       tick();

       const calls = testListener.updateButtonBoxesCalls;
       expect(calls.length).toEqual(0);
     }));

  it('force updateButtonBoxes works', fakeAsync(() => {
       fixture.componentInstance.turn = {
         speakerId: 'foo_speaker',
         startTimestamp: new Date(),
         speechContent: 'Hi, there!',
       };
       fixture.detectChanges();
       fixture.componentInstance.ngAfterContentChecked();
       tick();

       const previousCalls = testListener.updateButtonBoxesCalls.slice();
       expect(previousCalls.length).toBeGreaterThan(0);
       fixture.componentInstance.forceUpdateButtonBox();
       tick(1);
       const calls = testListener.updateButtonBoxesCalls.slice();
       expect(calls.length).toEqual(previousCalls.length + 1);
       const lastCall = calls[calls.length - 1];
       expect(lastCall[0].indexOf('ConversationTurnComponent')).toEqual(0);
       expect(lastCall[1].length).toEqual(1);
       expect(lastCall[1][0].length).toEqual(4);
     }));

  it('isCompact is false by default', () => {
    fixture.componentInstance.turn = {
      speakerId: 'foo_speaker',
      startTimestamp: new Date(),
      speechContent: 'Hi, there!',
      isTts: false,
    };
    fixture.detectChanges();

    expect(fixture.componentInstance.isCompact).toBeFalse();
    expect(fixture.debugElement.query(By.css('.compact-size'))).toBeNull();
  });

  it('Setting isCompact to true sets the correct css class', () => {
    fixture.componentInstance.isCompact = true;
    fixture.componentInstance.turn = {
      speakerId: 'foo_speaker',
      startTimestamp: new Date(),
      speechContent: 'Hi, there!',
      isTts: false,
    };
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.compact-size'))).not.toBeNull();
  });
});
