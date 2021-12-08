import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Subject} from 'rxjs';

import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-injection';

import {ExternalEventsComponent, getPunctuationLiteral, VIRTUAL_KEY, VKCODE_SPECIAL_KEYS} from './external-events.component';
import {ExternalEventsModule} from './external-events.module';

// TODO(cais): Remove fdescribe. DO NOT SUBMIT.
fdescribe('ExternalEventsComponent', () => {
  let textEntryBeginSubject: Subject<TextEntryBeginEvent>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let fixture: ComponentFixture<ExternalEventsComponent>;
  let component: ExternalEventsComponent;
  let beginEvents: TextEntryBeginEvent[];
  let endEvents: TextEntryEndEvent[];

  beforeEach(async () => {
    await TestBed
        .configureTestingModule({
          imports: [ExternalEventsModule],
          declarations: [ExternalEventsComponent],
        })
        .compileComponents();
    textEntryBeginSubject = new Subject();
    textEntryEndSubject = new Subject();
    beginEvents = [];
    endEvents = [];
    textEntryBeginSubject.subscribe((event) => beginEvents.push(event));
    textEntryEndSubject.subscribe((event) => endEvents.push(event));
    fixture = TestBed.createComponent(ExternalEventsComponent);
    component = fixture.componentInstance;
    fixture.componentInstance.textEntryBeginSubject = textEntryBeginSubject;
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.detectChanges();
  });

  it('Virtual key codes map has no duplicate values', () => {
    const valueSet = new Set(Object.values(VKCODE_SPECIAL_KEYS));
    expect(Object.values(VKCODE_SPECIAL_KEYS).length).toEqual(valueSet.size);
  });

  it('getPunctuationLiteral returns correct values', () => {
    expect(getPunctuationLiteral(VIRTUAL_KEY.SEMICOLON_COLON, false))
        .toEqual(';');
    expect(getPunctuationLiteral(VIRTUAL_KEY.SEMICOLON_COLON, true))
        .toEqual(':');
    expect(getPunctuationLiteral(VIRTUAL_KEY.SLASH_QUESTION_MARK, false))
        .toEqual('/');
    expect(getPunctuationLiteral(VIRTUAL_KEY.SLASH_QUESTION_MARK, true))
        .toEqual('?');
    expect(getPunctuationLiteral(VIRTUAL_KEY.PERIOD, true)).toEqual('.');
    expect(getPunctuationLiteral(VIRTUAL_KEY.COMMA, true)).toEqual(',');
  });

  it('typing a key sends TextEntryBeginEvent', () => {
    component.externalKeypressCallback(65);  // 'a'.
    expect(beginEvents.length).toEqual(1);
  });

  it('on TTS combo key, reconstructs text and sends end event', () => {
    component.externalKeypressCallback(72);   // 'h'.
    component.externalKeypressCallback(73);   // 'i'.
    component.externalKeypressCallback(188);  // ','.
    component.externalKeypressCallback(32);   // ' '.
    component.externalKeypressCallback(87);   // 'w'
    component.externalKeypressCallback(190);  // '.'
    component.externalKeypressCallback(162);  // LCtrl
    component.externalKeypressCallback(81);   // 'q'
    expect(beginEvents.length).toEqual(1);
    expect(endEvents.length).toEqual(1);
    expect(endEvents[0].text).toEqual('hi, w.');
    expect(endEvents[0].isFinal).toBeTrue();
    expect(endEvents[0].timestampMillis)
        .toBeGreaterThan(beginEvents[0].timestampMillis);
  });
});
