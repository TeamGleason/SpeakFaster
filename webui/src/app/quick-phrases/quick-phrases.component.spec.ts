/** Unit tests for QuickPhrasesComponent. */
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Subject} from 'rxjs';

import * as cefSharp from '../../utils/cefsharp';
import {TestListener} from '../test-utils/test-cefsharp-listener';
import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

import {QuickPhrasesComponent} from './quick-phrases.component';
import {QuickPhrasesModule} from './quick-phrases.module';

describe('QuickPhrasesComponent', () => {
  let fixture: ComponentFixture<QuickPhrasesComponent>;
  let testListener: TestListener;
  let textEntryBeginSubject: Subject<TextEntryBeginEvent>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;

  beforeEach(async () => {
    testListener = new TestListener();
    textEntryBeginSubject = new Subject();
    textEntryEndSubject = new Subject();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    await TestBed
        .configureTestingModule({
          imports: [QuickPhrasesModule],
          declarations: [QuickPhrasesComponent],
          providers: [],
        })
        .compileComponents();
    fixture = TestBed.createComponent(QuickPhrasesComponent);
    fixture.componentInstance.phrases = ['roses are red', 'violets are blue'];
    fixture.componentInstance.textEntryBeginSubject = textEntryBeginSubject;
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.detectChanges();
  });

  it('shows PhraseComponents when phrases are non-empty', () => {
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    const noQuickPhrases =
        fixture.debugElement.query(By.css('.no-quick-phrases'));
    const scrollButtons =
        fixture.debugElement.queryAll(By.css('.scroll-button'));

    expect(phraseComponents.length).toEqual(2);
    expect(phraseComponents[0].componentInstance.phraseText)
        .toEqual('roses are red');
    expect(phraseComponents[0].componentInstance.phraseIndex).toEqual(0);
    expect(phraseComponents[1].componentInstance.phraseText)
        .toEqual('violets are blue');
    expect(phraseComponents[1].componentInstance.phraseIndex).toEqual(1);
    expect(noQuickPhrases).toBeNull();
    expect(scrollButtons).toEqual([]);
  });

  it('shows no-quick-phrases label when phrases are empty', () => {
    fixture.componentInstance.phrases = [];
    fixture.detectChanges();
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    const noQuickPhrases =
        fixture.debugElement.query(By.css('.no-quick-phrases'));

    expect(phraseComponents).toEqual([]);
    expect(noQuickPhrases).not.toBeNull();
  });

  it('phrase speak button triggers text entry begin-end events', () => {
    let beginEvents: TextEntryBeginEvent[] = [];
    let endEvents: TextEntryEndEvent[] = [];
    textEntryBeginSubject.subscribe(event => {
      beginEvents.push(event);
    });
    textEntryEndSubject.subscribe(event => {
      endEvents.push(event);
    });
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    phraseComponents[0].componentInstance.speakButtonClicked.emit(
        {phraseText: 'roses are red', phraseIndex: 0});

    expect(beginEvents.length).toEqual(1);
    expect(beginEvents[0].timestampMillis).toBeGreaterThan(0);
    expect(endEvents.length).toEqual(1);
    expect(endEvents[0].text).toEqual('roses are red');
    expect(endEvents[0].timestampMillis)
        .toBeGreaterThan(beginEvents[0].timestampMillis);
    expect(endEvents[0].injectedKeys).toBeUndefined();
    expect(endEvents[0].isFinal).toEqual(true);
    expect(endEvents[0].inAppTextToSpeechAudioConfig).toEqual({
      volume_gain_db: 0
    });
    expect(testListener.injectedKeysCalls.length).toEqual(0);
  });

  it('phrase inject button triggers tex entry begin-end events', () => {
    let beginEvents: TextEntryBeginEvent[] = [];
    let endEvents: TextEntryEndEvent[] = [];
    textEntryBeginSubject.subscribe(event => {
      beginEvents.push(event);
    });
    textEntryEndSubject.subscribe(event => {
      endEvents.push(event);
    });
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    phraseComponents[1].componentInstance.injectButtonClicked.emit(
        {phraseText: 'violets are blue', phraseIndex: 1});

    expect(beginEvents.length).toEqual(1);
    expect(beginEvents[0].timestampMillis).toBeGreaterThan(0);
    expect(endEvents.length).toEqual(1);
    expect(endEvents[0].text).toEqual('violets are blue');
    expect(endEvents[0].timestampMillis)
        .toBeGreaterThan(beginEvents[0].timestampMillis);
    expect(endEvents[0].isFinal).toEqual(true);
    expect(endEvents[0].inAppTextToSpeechAudioConfig).toBeUndefined();
    expect(testListener.injectedKeysCalls.length).toEqual(1);
    expect(testListener.injectedKeysCalls[0].length)
        .toEqual('violets are blue'.length + 1);
  });

  it('when overflow happens, shows scroll buttons and registers buttons boxes',
     async () => {
       // Assume that 30 phrases of 'lorem ipsum'. Same below.
       fixture.componentInstance.phrases = Array(30).fill('lorem ipsum');
       fixture.detectChanges();
       await fixture.whenStable();
       const phrasesContainer =
           fixture.debugElement.query(By.css('.quick-phrases-container'));

       const scrollButtons =
           fixture.debugElement.queryAll(By.css('.scroll-button'));
       expect(scrollButtons.length).toEqual(2);
       expect(phrasesContainer.nativeElement.scrollTop).toEqual(0);
       const buttonBoxCalls = testListener.updateButtonBoxesCalls.filter(
           (call) => {return call[0].startsWith('QuickPhrasesComponent_')});
       const lastButtonBoxCall = buttonBoxCalls[buttonBoxCalls.length - 1];
       expect(lastButtonBoxCall[1].length).toEqual(2);
       expect(lastButtonBoxCall[1][0].length).toEqual(4);
       expect(lastButtonBoxCall[1][1].length).toEqual(4);
     });

  it('clicking scroll down button updates scrollTop', async () => {
    fixture.componentInstance.phrases = Array(30).fill('lorem ipsum');
    fixture.detectChanges();
    await fixture.whenStable();
    const phrasesContainer =
        fixture.debugElement.query(By.css('.quick-phrases-container'));

    const scrollButtons =
        fixture.debugElement.queryAll(By.css('.scroll-button'));
    scrollButtons[1].nativeElement.click();
    await fixture.whenStable();
    expect(phrasesContainer.nativeElement.scrollTop).toBeGreaterThan(0);
  });

  it('clicking scroll down then scroll up updates scrollTop', async () => {
    fixture.componentInstance.phrases = Array(30).fill('lorem ipsum');
    fixture.detectChanges();
    await fixture.whenStable();
    const phrasesContainer =
        fixture.debugElement.query(By.css('.quick-phrases-container'));

    const scrollButtons =
        fixture.debugElement.queryAll(By.css('.scroll-button'));
    scrollButtons[1].nativeElement.click();
    await fixture.whenStable();
    scrollButtons[0].nativeElement.click();
    await fixture.whenStable();
    expect(phrasesContainer.nativeElement.scrollTop).toEqual(0);
  });
});
