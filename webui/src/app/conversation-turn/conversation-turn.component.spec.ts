import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import * as cefSharp from '../../utils/cefsharp';
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
      isTts: true,
    };
    fixture.detectChanges();
    const turnContent =
        fixture.debugElement.query(By.css('.turn-content')).nativeElement;
    expect(turnContent.innerText).toEqual('Hi, there!');
    const speakerTag =
        fixture.debugElement.query(By.css('.speaker-tag')).nativeElement
    expect(speakerTag.innerText).toEqual('foo_speaker');
    const ttsTag = fixture.debugElement.query(By.css('.tts-tag'));
    expect(ttsTag).not.toBeNull();
  });

  it('displays long tts turn with ellipses', () => {
    fixture.componentInstance.turn = {
      speakerId: 'bar_speaker',
      startTimestamp: new Date(),
      speechContent:
          'The rose is red, the violet is blue, the honey is sweet, ' +
          'and so are you.',
      isTts: true,
    };
    fixture.detectChanges();
    const turnContent =
        fixture.debugElement.query(By.css('.turn-content')).nativeElement;
    expect(turnContent.innerText)
        .toEqual('...is blue, the honey is sweet, and so are you.');
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

  it('calls updateButtonBoxesCalls', async () => {
    fixture.componentInstance.turn = {
      speakerId: 'foo_speaker',
      startTimestamp: new Date(),
      speechContent: 'Hi, there!',
    };
    fixture.detectChanges();
    await fixture.whenStable();
    const calls = testListener.updateButtonBoxesCalls;
    expect(calls.length).toEqual(1);
    expect(calls[0][0].indexOf('ConversationTurnComponent')).toEqual(0);
    expect(calls[0][1].length).toEqual(1);
    expect(calls[0][1][0].length).toEqual(4);
  });
});
