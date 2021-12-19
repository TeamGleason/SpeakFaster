import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Subject} from 'rxjs';

import {ConversationTurnComponent} from './conversation-turn.component';
import {ConversationTurnModule} from './conversation-turn.module';

// TODO(cais): Remove fdescribe. DO NOT SUBMIT.
fdescribe('ConversationTurnComponent', () => {
  let fixture: ComponentFixture<ConversationTurnComponent>;

  beforeEach(async () => {
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
    const ttsTag = fixture.debugElement.query(By.css('.tts-tag'));
    expect(ttsTag).not.toBeNull();
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
});
