/** Unit tests for QuickPhrasesComponent. */
import {ElementRef, Injectable, SimpleChange} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Observable, of, Subject, throwError} from 'rxjs';
import {createUuid} from 'src/utils/uuid';

import * as cefSharp from '../../utils/cefsharp';
import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {InputBarControlEvent} from '../input-bar/input-bar.component';
import {ScrollButtonsComponent} from '../scroll-buttons/scroll-button.component';
import {SpeakFasterService, TextPredictionRequest, TextPredictionResponse} from '../speakfaster-service';
import {TestListener} from '../test-utils/test-cefsharp-listener';
import {resetStatesForTest, setQuickPhrasesSubTag} from '../types/app-state';
import {ContextualPhrase} from '../types/contextual_phrase';
import {TextEntryBeginEvent, TextEntryEndEvent} from '../types/text-entry';

import {QuickPhrasesComponent} from './quick-phrases.component';
import {QuickPhrasesModule} from './quick-phrases.module';

type TestMode = 'normal'|'error';

@Injectable()
class SpeakFasterServiceForTest {
  readonly contextualPhrases: ContextualPhrase[] = [];
  private mode: TestMode = 'normal';

  constructor() {
    this.contextualPhrases.push(
        ...[{
          phraseId: createUuid(),
          text: 'hello',
          tags: ['favorite'],
          lastUsedTimestamp: '2022-04-01T00:00:00.000Z',
        },
            {
              phraseId: createUuid(),
              text: 'Nice day today',
              tags: ['favorite'],
              lastUsedTimestamp: '2022-04-01T00:00:00.000Z',
            },
            // Among the phrases with the 'favorite' tag, the 'Thank you' phrase
            // should be shown first due to the later lastUsedTimestamp, despite
            // lexicographical order.
            {
              phraseId: createUuid(),
              text: 'Thank you',
              displayText: 'Thx',
              tags: ['favorite'],
              lastUsedTimestamp: '2022-04-01T00:00:10.000Z',
            },
            {
              phraseId: createUuid(),
              text: 'To living room',
              tags: ['care'],
            },
            {
              phraseId: createUuid(),
              text: 'To bedroom',
              tags: ['care'],
            },
    ]);
    for (let i = 0; i < 30; ++i) {
      this.contextualPhrases.push({
        phraseId: createUuid(),
        text: `Count ${i}`,
        tags: ['counting'],
      });
    }
  }

  public setTestMode(mode: TestMode) {
    this.mode = mode;
  }

  textPrediction(textPredictionRequest: TextPredictionRequest):
      Observable<TextPredictionResponse> {
    if (this.mode === 'error') {
      return throwError('Error');
    } else {
      return of({
        contextualPhrases: this.contextualPhrases.filter(phrase => {
          if (phrase.tags === undefined) {
            return false;
          }
          for (const tag of phrase.tags) {
            if (!textPredictionRequest.allowedTags ||
                textPredictionRequest.allowedTags.indexOf(tag) !== -1) {
              return true;
            }
          }
          return false;
        }),
      });
    }
  }
}

describe('QuickPhrasesComponent', () => {
  let fixture: ComponentFixture<QuickPhrasesComponent>;
  let testListener: TestListener;
  let textEntryBeginSubject: Subject<TextEntryBeginEvent>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let inputBarControlSubject: Subject<InputBarControlEvent>;
  let speakFasterServiceForTest: SpeakFasterServiceForTest;

  beforeEach(async () => {
    resetStatesForTest();
    speakFasterServiceForTest = new SpeakFasterServiceForTest();
    testListener = new TestListener();
    textEntryBeginSubject = new Subject();
    textEntryEndSubject = new Subject();
    inputBarControlSubject = new Subject();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    await TestBed
        .configureTestingModule({
          imports: [QuickPhrasesModule],
          declarations: [QuickPhrasesComponent, ScrollButtonsComponent],
          providers: [
            {provide: SpeakFasterService, useValue: speakFasterServiceForTest},
            {provide: HttpEventLogger, useValue: new HttpEventLogger(null)},
          ],
        })
        .compileComponents();
    fixture = TestBed.createComponent(QuickPhrasesComponent);
    fixture.componentInstance.userId = 'foo_user';
    fixture.componentInstance.textEntryBeginSubject = textEntryBeginSubject;
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.componentInstance.inputBarControlSubject = inputBarControlSubject;
    fixture.detectChanges();
  });

  it('shows PhraseComponents when phrases are non-empty', async () => {
    fixture.componentInstance.allowedTag = 'favorite';
    fixture.componentInstance.ngOnChanges({
      allowedTag: new SimpleChange(
          undefined, fixture.componentInstance.allowedTag, true),
    });
    await fixture.whenStable();
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    const noQuickPhrases =
        fixture.debugElement.query(By.css('.no-quick-phrases'));
    const scrollButtons =
        fixture.debugElement.queryAll(By.css('.scroll-button'));
    const error = fixture.debugElement.query(By.css('.error'));

    expect(phraseComponents.length).toEqual(3);
    expect(phraseComponents[0].componentInstance.phraseText)
        .toEqual('Thank you');
    expect(phraseComponents[0].componentInstance.phraseIndex).toEqual(0);
    expect(phraseComponents[1].componentInstance.phraseText).toEqual('hello');
    expect(phraseComponents[1].componentInstance.phraseIndex).toEqual(1);
    expect(phraseComponents[2].componentInstance.phraseText)
        .toEqual('Nice day today');
    expect(phraseComponents[2].componentInstance.phraseIndex).toEqual(2);
    expect(noQuickPhrases).toBeNull();
    expect(scrollButtons).toEqual([]);
    expect(error).toBeNull();
  });

  it('filters phrases by text correctly', async () => {
    fixture.componentInstance.allowedTag = 'favorite';
    fixture.componentInstance.ngOnChanges({
      allowedTag: new SimpleChange(undefined, 'favorite', true),
    });
    await fixture.whenStable();
    // Filter down to only 'Nice day today';
    fixture.componentInstance.filterPrefix = 'ni';
    fixture.detectChanges();

    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    expect(phraseComponents.length).toEqual(1);
    expect(phraseComponents[0].componentInstance.phraseText)
        .toEqual('Nice day today');
  });

  it('filters phrases by display text correctly', async () => {
    fixture.componentInstance.allowedTag = 'favorite';
    fixture.componentInstance.ngOnChanges({
      allowedTag: new SimpleChange(undefined, 'favorite', true),
    });
    await fixture.whenStable();
    // Filter down to only 'Thank you', which has the display text of 'Thx'
    fixture.componentInstance.filterPrefix = 'thx';
    fixture.detectChanges();

    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    expect(phraseComponents.length).toEqual(1);
    expect(phraseComponents[0].componentInstance.phraseText)
        .toEqual('Thank you');
  });

  it('sets the tags of PhraseComponets correctly', async () => {
    fixture.componentInstance.allowedTag = 'counting';
    fixture.componentInstance.ngOnChanges({
      allowedTag: new SimpleChange('favorite', 'counting', true),
    });
    await fixture.whenStable();
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));

    expect(phraseComponents[0].componentInstance.tags).toEqual(['counting']);
  });

  it('hides progress spinner after successful prhase retrieval', async () => {
    fixture.componentInstance.allowedTag = 'favorite';
    fixture.componentInstance.ngOnChanges({
      allowedTag: new SimpleChange(
          undefined, fixture.componentInstance.allowedTag, true),
    });
    await fixture.whenStable();

    const retrievingPhrases =
        fixture.debugElement.query(By.css('.retrieving-quick-phrases'));
    expect(retrievingPhrases).toBeNull();
    const matProgressSpinner =
        fixture.debugElement.query(By.css('mat-progress-spinner'));
    expect(matProgressSpinner).toBeNull();
  });

  it('shows no-quick-phrases label when phrases are empty', async () => {
    fixture.componentInstance.allowedTag = 'nonexistent_tag';
    fixture.componentInstance.ngOnChanges({
      allowedTag: new SimpleChange(
          'favorite', fixture.componentInstance.allowedTag, false),
    });
    await fixture.whenStable();
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    const noQuickPhrases =
        fixture.debugElement.query(By.css('.no-quick-phrases'));

    expect(phraseComponents).toEqual([]);
    expect(noQuickPhrases).not.toBeNull();
  });

  it('phrase speak button triggers text entry begin-end events', async () => {
    let beginEvents: TextEntryBeginEvent[] = [];
    let endEvents: TextEntryEndEvent[] = [];
    textEntryBeginSubject.subscribe(event => {
      beginEvents.push(event);
    });
    textEntryEndSubject.subscribe(event => {
      endEvents.push(event);
    });
    fixture.componentInstance.allowedTag = 'favorite';
    fixture.componentInstance.ngOnChanges({
      allowedTag: new SimpleChange(
          undefined, fixture.componentInstance.allowedTag, true),
    });
    await fixture.whenStable();
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    phraseComponents[0].componentInstance.speakButtonClicked.emit(
        {phraseText: 'Thank you', phraseIndex: 0});

    expect(beginEvents.length).toEqual(1);
    expect(beginEvents[0].timestampMillis).toBeGreaterThan(0);
    expect(endEvents.length).toEqual(1);
    expect(endEvents[0].text).toEqual('Thank you');
    expect(endEvents[0].timestampMillis)
        .toBeGreaterThan(beginEvents[0].timestampMillis);
    expect(endEvents[0].injectedKeys).toBeUndefined();
    expect(endEvents[0].isFinal).toEqual(true);
    expect(endEvents[0].inAppTextToSpeechAudioConfig).toEqual({});
    expect(testListener.injectedKeysCalls.length).toEqual(0);
    expect(testListener.injectedTextCalls.length).toEqual(0);
  });

  it('phrase inject button triggers input bar text append event', async () => {
    let inputBarControlEvents: InputBarControlEvent[] = [];
    inputBarControlSubject.subscribe(event => {
      inputBarControlEvents.push(event);
    });
    fixture.componentInstance.allowedTag = 'favorite';
    fixture.componentInstance.ngOnChanges({
      allowedTag: new SimpleChange(
          undefined, fixture.componentInstance.allowedTag, true),
    });
    await fixture.whenStable();
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    phraseComponents[1].componentInstance.injectButtonClicked.emit(
        {phraseText: 'Thank you', phraseIndex: 1});

    // expect(inputBarControlEvents.length).toEqual(1);
    expect(inputBarControlEvents[inputBarControlEvents.length - 1].appendText)
        .toEqual('Thank you');
  });

  it('when overflow happens, shows scroll buttons and registers buttonsboxes',
     async () => {
       // Assume that 30 phrases of 'Counting ...' is enough to cause overflow
       // and therefore scrolling. Same below.
       fixture.componentInstance.allowedTag = 'counting';
       fixture.componentInstance.ngOnChanges({
         allowedTag: new SimpleChange(undefined, 'counting', true),
       });
       fixture.detectChanges();
       await fixture.whenStable();

       const phrasesContainer =
           fixture.debugElement.query(By.css('.quick-phrases-container'));
       const phrases =
           fixture.debugElement.queryAll(By.css('app-phrase-component'));
       expect(phrases.length).toEqual(30);
       const scrollButtons =
           fixture.debugElement.queryAll(By.css('.scroll-button'));
       expect(scrollButtons.length).toEqual(2);
       expect(phrasesContainer.nativeElement.scrollTop).toEqual(0);
     });

  it('clicking scroll down button updates scrollTop', async () => {
    fixture.componentInstance.allowedTag = 'counting';
    fixture.componentInstance.ngOnChanges({
      allowedTag: new SimpleChange(
          undefined, fixture.componentInstance.allowedTag, true),
    });
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
    fixture.componentInstance.allowedTag = 'counting';
    fixture.componentInstance.ngOnChanges({
      allowedTag: new SimpleChange(
          undefined, fixture.componentInstance.allowedTag, true),
    });
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

  it('shows progress spinner during request', () => {
    const retrievingPhrases =
        fixture.debugElement.queryAll(By.css('.retrieving-quick-phrases'));
    expect(retrievingPhrases.length).toEqual(1);
    const matProgressSpinner =
        fixture.debugElement.queryAll(By.css('mat-progress-spinner'));
    expect(matProgressSpinner.length).toEqual(1);
  });

  it('shows error message when error occurs', async () => {
    speakFasterServiceForTest.setTestMode('error');
    fixture.componentInstance.allowedTag = 'favorite';
    fixture.componentInstance.ngOnChanges({
      allowedTag: new SimpleChange(
          undefined, fixture.componentInstance.allowedTag, true),
    });
    await fixture.whenStable();

    const errors = fixture.debugElement.queryAll(By.css('.error'));
    expect(errors.length).toEqual(1);
  });

  it('refreshContextualPhrase event causes refresh', () => {
    const spy =
        spyOn(speakFasterServiceForTest, 'textPrediction').and.callThrough();

    inputBarControlSubject.next({
      clearAll: true,
      refreshContextualPhrases: true,
    });
    fixture.detectChanges();

    expect(spy).toHaveBeenCalled();
  });

  it('does not show close-sub-tag-button by default', () => {
    expect(fixture.debugElement.query(By.css('.close-sub-tag-button')))
        .toBeNull();
  });

  it('shows close-sub-tag button and title when subTag is not null', () => {
    fixture.componentInstance.allowedTag = 'partner-name';
    fixture.componentInstance.showExpandButtons = true;
    fixture.componentInstance.onExpandButtonClicked({
      phraseText: 'Joe',
      phraseIndex: 0,
    });
    fixture.detectChanges();
    const closeSubTagButton =
        fixture.debugElement.query(By.css('.close-sub-tag-button'));
    const subTagTitle = fixture.debugElement.query(By.css('.sub-tag-title'));

    expect(closeSubTagButton).not.toBeNull();
    expect(subTagTitle.nativeElement.innerText).toEqual('Phrases for Joe');
    expect(fixture.componentInstance.hasSubTag).toBeTrue();
    expect(fixture.componentInstance.subTag).toEqual('Joe');
    expect(fixture.componentInstance.effectiveAllowedTag)
        .toEqual('partner-name:Joe');
  });

  it('clicking close-sub-tag button clears subtag', () => {
    fixture.componentInstance.allowedTag = 'partner-name';
    fixture.componentInstance.showExpandButtons = true;
    fixture.componentInstance.onExpandButtonClicked({
      phraseText: 'Joe',
      phraseIndex: 0,
    });
    fixture.detectChanges();
    const closeSubTagButton =
        fixture.debugElement.query(By.css('.close-sub-tag-button'));
    closeSubTagButton.nativeElement.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.hasSubTag).toBeFalse();
    expect(fixture.componentInstance.subTag).toEqual(null);
    expect(fixture.componentInstance.effectiveAllowedTag)
        .toEqual('partner-name');
  });

  it('if showExpandButtons is false, sub tag state is not used', () => {
    fixture.componentInstance.allowedTag = 'partner-name';
    fixture.componentInstance.showExpandButtons = false;
    setQuickPhrasesSubTag('Foo');
    fixture.detectChanges();

    expect(fixture.componentInstance.effectiveAllowedTag)
        .toEqual('partner-name');
  });

  it('shows edit-mode button by default', () => {
    const editModeButton =
        fixture.debugElement.query(By.css('.edit-mode-button'));
    const buttonImage = editModeButton.query(By.css('.button-image')) as
        ElementRef<HTMLImageElement>;

    expect(buttonImage.nativeElement.src.indexOf('/edit.png')).not.toEqual(-1);
  });

  it('clicking edit button changes state and show edit-off button',
     async () => {
       fixture.componentInstance.allowedTag = 'counting';
       fixture.componentInstance.ngOnChanges({
         allowedTag: new SimpleChange(undefined, 'counting', true),
       });
       fixture.detectChanges();
       await fixture.whenStable();
       const editModeButton =
           fixture.debugElement.query(By.css('.edit-mode-button'));
       editModeButton.nativeElement.click();
       fixture.detectChanges();

       expect(fixture.componentInstance.state)
           .toEqual('CHOOSING_PHRASE_TO_EDIT');
       const buttonImage = editModeButton.query(By.css('.button-image')) as
           ElementRef<HTMLImageElement>;
       expect(buttonImage.nativeElement.src.indexOf('/edit_off.png'))
           .not.toEqual(-1);
     });

  it('edit button displays back arrow when a phrase is edited', async () => {
    const inputBarControlEvents: InputBarControlEvent[] = [];
    inputBarControlSubject.subscribe(event => {
      inputBarControlEvents.push(event);
    });
    fixture.componentInstance.allowedTag = 'counting';
    fixture.componentInstance.ngOnChanges({
      allowedTag: new SimpleChange(undefined, 'counting', true),
    });
    fixture.detectChanges();
    await fixture.whenStable();
    const editModeButton =
        fixture.debugElement.query(By.css('.edit-mode-button'));
    editModeButton.nativeElement.click();
    fixture.detectChanges();
    const phraseComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-component'));
    const firstPhraseComponent = phraseComponents[0];

    expect(firstPhraseComponent.componentInstance.isEditing).toEqual(true);

    const editButton = firstPhraseComponent.query(By.css('.edit-button'));
    editButton.nativeElement.click();
    fixture.detectChanges();

    expect(inputBarControlEvents[inputBarControlEvents.length - 1]).toEqual({
      hide: true
    });
    expect(fixture.componentInstance.state).toEqual('EDITING_PHRASE');

    const phraseEditingComponents =
        fixture.debugElement.queryAll(By.css('app-phrase-editing-component'));
    expect(phraseEditingComponents.length).toEqual(1);
    const [phraseEditingComponent] = phraseEditingComponents;
    const buttonImage = editModeButton.query(By.css('.button-image')) as
        ElementRef<HTMLImageElement>;

    expect(buttonImage.nativeElement.src.indexOf('/back.png')).not.toEqual(-1);
    expect(phraseEditingComponent.componentInstance.userId).toEqual('foo_user');
    expect(phraseEditingComponent.componentInstance.phraseId)
        .toEqual(firstPhraseComponent.componentInstance.phraseId);
    expect(phraseEditingComponent.componentInstance.phraseText)
        .toEqual('Count 0');
    expect(phraseEditingComponent.componentInstance.phraseDisplayText)
        .toBeUndefined();
  });

  it('does not show edit mode button if allowwEditing is false', () => {
    fixture.componentInstance.allowsEditing = false;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.edit-mode-button'))).toBeNull();
  });

  it('unnhides input bar and retrieves phrases when phrase is saved',
     async () => {
       const inputBarControlEvents: InputBarControlEvent[] = [];
       inputBarControlSubject.subscribe(event => {
         inputBarControlEvents.push(event);
       });
       fixture.componentInstance.allowedTag = 'counting';
       fixture.componentInstance.onPhraseSaved({phraseId: '1234'});
       await fixture.whenStable();

       expect(inputBarControlEvents[inputBarControlEvents.length - 1]).toEqual({
         hide: false
       });
       const phraseComponents =
           fixture.debugElement.queryAll(By.css('app-phrase-component'));
       expect(phraseComponents.length).toEqual(30);
     });
});
