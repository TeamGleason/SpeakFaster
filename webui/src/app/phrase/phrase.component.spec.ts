/** Unit tests for PhraseComponent. */
import {HttpClientModule} from '@angular/common/http';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';

import * as cefSharp from '../../utils/cefsharp';
import {FavoriteButtonComponent} from '../favorite-button/favorite-button.component';
import {SpeakFasterService} from '../speakfaster-service';
import {TestListener} from '../test-utils/test-cefsharp-listener';

import {PhraseComponent} from './phrase.component';
import {PhraseModule} from './phrase.module';

class SpeakFasterServiceForTest {}

describe('PhraseComponent', () => {
  let fixture: ComponentFixture<PhraseComponent>;
  let testListener: TestListener;

  beforeEach(async () => {
    testListener = new TestListener();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    await TestBed
        .configureTestingModule({
          imports: [PhraseModule, HttpClientModule],
          declarations: [PhraseComponent, FavoriteButtonComponent],
          providers: [{
            provide: SpeakFasterService,
            useValue: new SpeakFasterServiceForTest(),
          }],
        })
        .compileComponents();
    fixture = TestBed.createComponent(PhraseComponent);
    fixture.componentInstance.phraseText = 'my phrase';
    fixture.componentInstance.phraseIndex = 2;
    fixture.detectChanges();
  });

  it('shows phrase text', () => {
    const phrase = fixture.nativeElement.querySelector('.phrase');
    expect(phrase.innerText).toEqual('my phrase');
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

});
