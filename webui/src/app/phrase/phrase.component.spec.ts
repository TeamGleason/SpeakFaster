/** Unit tests for PhraseComponent. */
import {HttpClientModule} from '@angular/common/http';
import {SimpleChange} from '@angular/core';
import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Observable, of} from 'rxjs';

import * as cefSharp from '../../utils/cefsharp';
import {FavoriteButtonComponent} from '../favorite-button/favorite-button.component';
import {SpeakFasterService} from '../speakfaster-service';
import {TestListener} from '../test-utils/test-cefsharp-listener';
import {MarkContextualPhraseUsageRequest, MarkContextualPhraseUsageResponse} from '../types/contextual_phrase';

import {PhraseComponent} from './phrase.component';
import {PhraseModule} from './phrase.module';

class SpeakFasterServiceForTest {
  private _markedPhraseIds: string[] = [];

  markContextualPhraseUsage(request: MarkContextualPhraseUsageRequest):
      Observable<MarkContextualPhraseUsageResponse> {
    this._markedPhraseIds.push(request.phraseId);
    return of({
      phraseId: request.phraseId,
    })
  }

  get markedPhraseIds(): string[] {
    return this._markedPhraseIds.slice();
  }
}

describe('PhraseComponent', () => {
  let fixture: ComponentFixture<PhraseComponent>;
  let testListener: TestListener;
  let speakFasterServiceForTest: SpeakFasterServiceForTest;

  beforeEach(async () => {
    testListener = new TestListener();
    speakFasterServiceForTest = new SpeakFasterServiceForTest();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    await TestBed
        .configureTestingModule({
          imports: [PhraseModule, HttpClientModule],
          declarations: [PhraseComponent, FavoriteButtonComponent],
          providers: [{
            provide: SpeakFasterService,
            useValue: speakFasterServiceForTest,
          }],
        })
        .compileComponents();
    fixture = TestBed.createComponent(PhraseComponent);
    fixture.componentInstance.scaleFontSize = true;
    fixture.componentInstance.phraseText = 'my phrase';
    fixture.componentInstance.phraseId = 'dummy_phrase_id';
    fixture.componentInstance.phraseIndex = 2;
    fixture.detectChanges();
  });

  it('shows phrase text', () => {
    const phrase = fixture.nativeElement.querySelector('.phrase');
    expect(phrase.innerText).toEqual('my phrase');
  });

  it('shows display phrase text when different from phrase text', () => {
    fixture.componentInstance.phraseDisplayText = 'my phrase (display)';
    fixture.detectChanges();

    const phrase = fixture.nativeElement.querySelector('.phrase');
    expect(phrase.innerText).toEqual('my phrase (display)');
    const phraseDisplay = fixture.debugElement.query(By.css('.display-text'));
    expect(phraseDisplay.nativeElement.innerText)
        .toEqual('my phrase (display)');
  });

  it('shows default background color', () => {
    const phraseContainer = fixture.nativeElement.querySelector(
                                '.phrase-container') as HTMLDivElement;
    expect(phraseContainer.style.backgroundColor).toEqual('rgb(9, 63, 58)');
  });

  it('does not show favorite button by default', () => {
    const favoriteButton =
        fixture.nativeElement.querySelector('.favorite-button');
    expect(favoriteButton).toBeNull();
  });

  it('does not show expand button by default', () => {
    const favoriteButton =
        fixture.nativeElement.querySelector('.expand-button');
    expect(favoriteButton).toBeNull();
  });

  it('clicking speak button fires speakButtonClicked', () => {
    const emittedEvents: Array<{phraseText: string, phraseIndex: number}> = [];
    fixture.componentInstance.speakButtonClicked.subscribe((event) => {
      emittedEvents.push(event);
    });
    fixture.detectChanges();
    const speakButton = fixture.nativeElement.querySelector('.speak-button') as
        HTMLButtonElement;
    speakButton.click();
    expect(emittedEvents).toEqual([{phraseText: 'my phrase', phraseIndex: 2}]);
  });

  it('clicking speak button calls markContextualPhraseUsage', () => {
    const emittedEvents: Array<{phraseText: string, phraseIndex: number}> = [];
    fixture.componentInstance.speakButtonClicked.subscribe((event) => {
      emittedEvents.push(event);
    });
    fixture.detectChanges();
    const speakButton = fixture.nativeElement.querySelector('.speak-button') as
        HTMLButtonElement;
    speakButton.click();
    expect(speakFasterServiceForTest.markedPhraseIds).toEqual([
      'dummy_phrase_id'
    ]);
  });

  it('clicking inject button fires injectButtonClicked', () => {
    const emittedEvents: Array<{phraseText: string, phraseIndex: number}> = [];
    fixture.componentInstance.injectButtonClicked.subscribe((event) => {
      emittedEvents.push(event);
    });
    fixture.detectChanges();
    const injectButton = fixture.nativeElement.querySelector(
                             '.inject-button') as HTMLButtonElement;
    injectButton.click();
    expect(emittedEvents).toEqual([{phraseText: 'my phrase', phraseIndex: 2}]);
  });

  it('clicking inject button calls markContextualPhraseUsge', () => {
    const emittedEvents: Array<{phraseText: string, phraseIndex: number}> = [];
    fixture.componentInstance.injectButtonClicked.subscribe((event) => {
      emittedEvents.push(event);
    });
    fixture.detectChanges();
    const injectButton = fixture.nativeElement.querySelector(
                             '.inject-button') as HTMLButtonElement;
    injectButton.click();
    expect(speakFasterServiceForTest.markedPhraseIds).toEqual([
      'dummy_phrase_id'
    ]);
  });

  it('clicking expand button fires expandButtonClicked', () => {
    fixture.componentInstance.showExpandButton = true;
    fixture.detectChanges();
    const emittedEvents: Array<{phraseText: string, phraseIndex: number}> = [];
    fixture.componentInstance.expandButtonClicked.subscribe((event) => {
      emittedEvents.push(event);
    });
    fixture.detectChanges();
    const speakButton = fixture.nativeElement.querySelector('.expand-button') as
        HTMLButtonElement;
    speakButton.click();
    expect(emittedEvents).toEqual([{phraseText: 'my phrase', phraseIndex: 2}]);
  });

  for (const [showFavoriteButton, expectedNumButtons] of [[false, 2]] as
       Array<[boolean, number]>) {
    it(`calls updateButtonBoxes: showFavoriteButton=${showFavoriteButton}`,
       async () => {
         fixture.componentInstance.showFavoriteButton = showFavoriteButton;
         fixture.detectChanges();
         await fixture.whenStable();
         const calls = testListener.updateButtonBoxesCalls;
         expect(calls.length).toBeGreaterThanOrEqual(1);
         const lastCall = calls[calls.length - 1];
         expect(lastCall[0].indexOf('PhraseComponent_')).toEqual(0);
         expect(lastCall[1].length).toEqual(expectedNumButtons);
         for (let i = 0; i < expectedNumButtons; ++i) {
           expect(lastCall[1][i].length).toEqual(4);
         }
       });
  }

  it('calls updateButtnBoxes with empty on destroy', async () => {
    fixture.componentInstance.ngOnDestroy();
    const calls = testListener.updateButtonBoxesCalls;
    expect(calls.length).toBeGreaterThanOrEqual(1);
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0].indexOf('PhraseComponent_')).toEqual(0);
    expect(lastCall[1].length).toEqual(0);
  });

  it('favorite button inherits explicitly set tags', () => {
    fixture.componentInstance.tags = ['tag1', 'tag2'];
    fixture.componentInstance.phraseText = 'hi';
    fixture.componentInstance.phraseIndex = 0;
    fixture.componentInstance.showFavoriteButton = true;
    fixture.detectChanges();

    const favoriteButton =
        fixture.debugElement.query(By.css('app-favorite-button-component'));
    expect(favoriteButton.componentInstance.tags).toEqual(['tag1', 'tag2']);
  });

  it('does not show favorite button if isEditing and showFavoriteButton are false',
     () => {
       fixture.componentInstance.tags = ['tag1', 'tag2'];
       fixture.componentInstance.phraseText = 'hi';
       fixture.componentInstance.phraseIndex = 0;
       fixture.componentInstance.showFavoriteButton = false;
       fixture.componentInstance.isEditing = false;
       fixture.detectChanges();

       expect(
           fixture.debugElement.query(By.css('app-favorite-button-component')))
           .toBeNull();
     });

  it('shows edit button if isEditing is true', () => {
    fixture.componentInstance.tags = ['tag1', 'tag2'];
    fixture.componentInstance.phraseText = 'hi';
    fixture.componentInstance.phraseIndex = 0;
    fixture.componentInstance.isEditing = true;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.edit-button'))).not.toBeNull();
  });

  it('does not show edit button if isEditing is false', () => {
    fixture.componentInstance.tags = ['tag1', 'tag2'];
    fixture.componentInstance.phraseText = 'hi';
    fixture.componentInstance.phraseIndex = 0;
    fixture.componentInstance.isEditing = false;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.edit-button'))).toBeNull();
  });

  it('hides inject button if flag is false', () => {
    fixture.componentInstance.showInjectButton = false;
    fixture.componentInstance.showFavoriteButton = true;
    fixture.componentInstance.phraseText = 'hi';
    fixture.componentInstance.phraseIndex = 0;
    fixture.componentInstance.isEditing = false;
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.inject-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('.speak-button')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.favorite-button'))
        .not.toBeNull();
  });

  it('Uses larger font size only speak button is shown', async () => {
    const text = 'hi';
    fixture.componentInstance.showInjectButton = false;
    fixture.componentInstance.showFavoriteButton = false;
    fixture.componentInstance.phraseDisplayText = text;
    fixture.componentInstance.phraseText = text;
    fixture.componentInstance.phraseIndex = 0;
    fixture.componentInstance.isEditing = false;
    fixture.detectChanges();
    fixture.componentInstance.ngAfterViewInit();
    await fixture.whenStable();

    const phrase = fixture.debugElement.query(By.css('.phrase'));
    expect(phrase.nativeElement.style.fontSize).toEqual('28px');
  });

  it('Use larger minimial font size when only speak button is shown',
     async () => {
       const text = 'hi '.repeat(100);
       fixture.componentInstance.showInjectButton = false;
       fixture.componentInstance.showFavoriteButton = false;
       fixture.componentInstance.phraseDisplayText = text;
       fixture.componentInstance.phraseText = text;
       fixture.componentInstance.phraseIndex = 0;
       fixture.componentInstance.isEditing = false;
       fixture.detectChanges();
       fixture.componentInstance.ngAfterViewInit();
       await fixture.whenStable();

       const phrase = fixture.debugElement.query(By.css('.phrase'));
       expect(phrase.nativeElement.style.fontSize).toEqual('20px');
     });

  it('emphasizeSpeakButton is false by default', () => {
    fixture.componentInstance.phraseText = 'Hello';
    fixture.detectChanges();

    expect(fixture.componentInstance.emphasizeSpeakButton).toBeFalse();
    expect(fixture.debugElement.query(By.css('.speak-button-emphasized')))
        .toBeNull();
  });

  it('Setting emphasizeSpeakButton to true sets correct CSS class', () => {
    fixture.componentInstance.phraseText = 'Hello';
    fixture.componentInstance.emphasizeSpeakButton = true;
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.speak-button-emphasized')))
        .not.toBeNull();
  });

  it('hides speak button if hideSpeakButton', () => {
    fixture.componentInstance.hideSpeakButton = true;
    fixture.detectChanges();
    const speakButton = fixture.nativeElement.querySelector('.speak-button') as
        HTMLButtonElement;
    expect(speakButton).not.toBeNull();
    expect(window.getComputedStyle(speakButton).visibility).toEqual('hidden');
  });

  it('does not hide speak button if hideSpeakButton is default', () => {
    fixture.detectChanges();
    const speakButton = fixture.nativeElement.querySelector('.speak-button') as
        HTMLButtonElement;
    expect(fixture.componentInstance.hideSpeakButton).toBeFalse();
    expect(speakButton).not.toBeNull();
    expect(window.getComputedStyle(speakButton).visibility)
        .not.toEqual('hidden');
  });

  it('change in hideSpeakButton calls updateButtonBoxes', fakeAsync(() => {
        fixture.componentInstance.showInjectButton = false;
        fixture.componentInstance.showFavoriteButton = false;
        fixture.componentInstance.hideSpeakButton = true;
        fixture.detectChanges();
        tick();
        const numCalls0 = testListener.updateButtonBoxesCalls.length;
        fixture.componentInstance.ngOnChanges(
            {hideSpeakButton: new SimpleChange(false, true, false)});
        tick();
        const numCalls1 = testListener.updateButtonBoxesCalls.length;
        expect(numCalls1).toEqual(numCalls0 + 1);
        expect(fixture.debugElement.query(By.css('.speak-button-hidden')))
            .not.toBeNull();
        const lastCall = testListener.updateButtonBoxesCalls[numCalls1 - 1];
        expect(lastCall[1].length).toEqual(0);
      }));
});
