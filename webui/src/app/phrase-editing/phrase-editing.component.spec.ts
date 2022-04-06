/** Unit tests for PhraseEditingComponent. */
import {HttpClientModule} from '@angular/common/http';
import {ElementRef} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Observable, of} from 'rxjs';

import * as cefSharp from '../../utils/cefsharp';
import {SpeakFasterService} from '../speakfaster-service';
import {TestListener} from '../test-utils/test-cefsharp-listener';
import {EditContextualPhraseRequest, EditContextualPhraseResponse} from '../types/contextual_phrase';

import {PhraseEditingComponent} from './phrase-editing.component';
import {PhraseEditingModule} from './phrase-editing.module';

class SpeakFasterServiceForTest {
  private _editUserIds: string[] = [];
  private _editPhraseIds: string[] = [];
  private _editTexts: string[] = [];
  private _editDisplayTexts: string[] = []

  editContextualPhrase(request: EditContextualPhraseRequest):
      Observable<EditContextualPhraseResponse> {
    this._editUserIds.push(request.userId);
    this._editPhraseIds.push(request.phraseId);
    this._editTexts.push(request.text);
    this._editDisplayTexts.push(request.displayText);
    return of({
      phraseId: request.phraseId,
    })
  }

  get editUserIds(): string[] {
    return this._editUserIds.slice();
  }

  get editPhraseIds(): string[] {
    return this._editPhraseIds.slice();
  }

  get editTexts(): string[] {
    return this._editTexts.slice();
  }

  get editDisplayTexts(): string[] {
    return this._editDisplayTexts.slice();
  }
}

describe('PhraseEditingComponent', () => {
  let fixture: ComponentFixture<PhraseEditingComponent>;
  let testListener: TestListener;
  let speakFasterServiceForTest: SpeakFasterServiceForTest;

  beforeEach(async () => {
    testListener = new TestListener();
    speakFasterServiceForTest = new SpeakFasterServiceForTest();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    await TestBed
        .configureTestingModule({
          imports: [PhraseEditingModule, HttpClientModule],
          declarations: [PhraseEditingComponent],
          providers: [{
            provide: SpeakFasterService,
            useValue: speakFasterServiceForTest,
          }],
        })
        .compileComponents();
    fixture = TestBed.createComponent(PhraseEditingComponent);
    fixture.componentInstance.userId = 'foo_user';
    fixture.componentInstance.phraseText = 'my phrase';
    fixture.componentInstance.phraseDisplayText = 'my display phrase';
    fixture.componentInstance.phraseId = 'dummy_phrase_id';
    fixture.detectChanges();
  });

  it('shows phrase text and phrase display text when both area available',
     () => {
       const phraseTextInput =
           fixture.debugElement.query(By.css('.phrase-text-input')) as
           ElementRef<HTMLTextAreaElement>;
       const phraseDisplayTextInput =
           fixture.debugElement.query(By.css('.phrase-display-text-input')) as
           ElementRef<HTMLTextAreaElement>;

       expect(phraseTextInput.nativeElement.value).toEqual('my phrase');
       expect(phraseDisplayTextInput.nativeElement.value)
           .toEqual('my display phrase');
     });

  it('shows same display text and text when display text is empty string',
     () => {
       fixture.componentInstance.phraseDisplayText = '';
       fixture.detectChanges();

       const phraseTextInput =
           fixture.debugElement.query(By.css('.phrase-text-input')) as
           ElementRef<HTMLTextAreaElement>;
       const phraseDisplayTextInput =
           fixture.debugElement.query(By.css('.phrase-display-text-input')) as
           ElementRef<HTMLTextAreaElement>;

       expect(phraseTextInput.nativeElement.value).toEqual('my phrase');
       expect(phraseDisplayTextInput.nativeElement.value).toEqual('my phrase');
     });

  it('shows same display text and text when display text is undefined', () => {
    fixture.componentInstance.phraseDisplayText = undefined;
    fixture.detectChanges();

    const phraseTextInput =
        fixture.debugElement.query(By.css('.phrase-text-input')) as
        ElementRef<HTMLTextAreaElement>;
    const phraseDisplayTextInput =
        fixture.debugElement.query(By.css('.phrase-display-text-input')) as
        ElementRef<HTMLTextAreaElement>;

    expect(phraseTextInput.nativeElement.value).toEqual('my phrase');
    expect(phraseDisplayTextInput.nativeElement.value).toEqual('my phrase');
  });

  it('clicking save button calls editContextualPhrase', () => {
    const phraseTextInput =
        fixture.debugElement.query(By.css('.phrase-text-input')) as
        ElementRef<HTMLTextAreaElement>;
    const phraseDisplayTextInput =
        fixture.debugElement.query(By.css('.phrase-display-text-input')) as
        ElementRef<HTMLTextAreaElement>;
    phraseTextInput.nativeElement.value += ' 2';
    phraseDisplayTextInput.nativeElement.value += ' 3'
    const saveButton = fixture.debugElement.query(By.css('.save-button'));
    saveButton.nativeElement.click();
    fixture.detectChanges();

    expect(speakFasterServiceForTest.editUserIds).toEqual(['foo_user']);
    expect(speakFasterServiceForTest.editPhraseIds).toEqual([
      'dummy_phrase_id'
    ]);
    expect(speakFasterServiceForTest.editTexts).toEqual(['my phrase 2']);
    expect(speakFasterServiceForTest.editDisplayTexts).toEqual([
      'my display phrase 3'
    ]);
  });

  it('identical display text to text omits display text', () => {
    const phraseTextInput =
        fixture.debugElement.query(By.css('.phrase-text-input')) as
        ElementRef<HTMLTextAreaElement>;
    const phraseDisplayTextInput =
        fixture.debugElement.query(By.css('.phrase-display-text-input')) as
        ElementRef<HTMLTextAreaElement>;
    phraseTextInput.nativeElement.value += ' 2';
    phraseDisplayTextInput.nativeElement.value =
        phraseTextInput.nativeElement.value;
    const saveButton = fixture.debugElement.query(By.css('.save-button'));
    saveButton.nativeElement.click();
    fixture.detectChanges();

    expect(speakFasterServiceForTest.editUserIds).toEqual(['foo_user']);
    expect(speakFasterServiceForTest.editPhraseIds).toEqual([
      'dummy_phrase_id'
    ]);
    expect(speakFasterServiceForTest.editTexts).toEqual(['my phrase 2']);
    expect(speakFasterServiceForTest.editDisplayTexts).toEqual(['']);
  });

  it('originally displays no error message', () => {
    expect(fixture.debugElement.query(By.css('.error-message'))).toBeNull();
  });

  it('display non-empty error message', () => {
    fixture.componentInstance.errorMessage = 'foo error message.';
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.error-message'))
               .nativeElement.innerText)
        .toEqual('foo error message.');
  });

  it(`calls updateButtonBoxes initially`, async () => {
    await fixture.whenStable();
    const calls = testListener.updateButtonBoxesCalls;

    expect(calls.length).toBeGreaterThanOrEqual(1);
    const lastCall = calls[calls.length - 1];
    expect(lastCall[0].indexOf('PhraseEditingComponent_')).toEqual(0);
    // There are three buttons in the component.
    expect(lastCall[1].length).toEqual(3);
    for (let i = 0; i < 3; ++i) {
      expect(lastCall[1][i].length).toEqual(4);
    }
  });

  it('initially fooucs on the display-text textarea', () => {
    const phraseDisplayTextInput =
        fixture.debugElement.query(By.css('.phrase-display-text-input')) as
        ElementRef<HTMLTextAreaElement>;
    expect(phraseDisplayTextInput.nativeElement === document.activeElement)
        .toBeTrue();
  });

  it('clicking modify-spoken button focuses on text input', () => {
    const modifySpokenButton =
        fixture.debugElement.query(By.css('.modify-spoken-button'));
    modifySpokenButton.nativeElement.click();

    const phraseTextInput =
        fixture.debugElement.query(By.css('.phrase-text-input')) as
        ElementRef<HTMLTextAreaElement>;
    expect(phraseTextInput.nativeElement === document.activeElement).toBeTrue();
  });

  it('clikcing modify-displayed button focus on displayed-text input', () => {
    const modifySpokenButton =
        fixture.debugElement.query(By.css('.modify-spoken-button'));
    modifySpokenButton.nativeElement.click();
    const modifyDisplayedButton =
        fixture.debugElement.query(By.css('.modify-displayed-button'));
    modifyDisplayedButton.nativeElement.click();

    const phraseDisplayTextInput =
        fixture.debugElement.query(By.css('.phrase-display-text-input')) as
        ElementRef<HTMLTextAreaElement>;
    expect(phraseDisplayTextInput.nativeElement === document.activeElement)
        .toBeTrue();
  });
});
