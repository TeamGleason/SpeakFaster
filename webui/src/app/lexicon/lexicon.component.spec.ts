/** Unit tests for LexiconComponent. */
import {HttpClientModule} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {Observable, of, Subject} from 'rxjs';

import {GetLexiconRequest, GetLexiconResponse, SpeakFasterService, TextPredictionRequest, TextPredictionResponse} from '../speakfaster-service';

import {canonicalizeName, chooseStringRandomly, LexiconComponent, LoadLexiconRequest} from './lexicon.component';
import {LexiconModule} from './lexicon.module';

@Injectable()
class SpeakFasterServiceForTest {
  getLexicon(request: GetLexiconRequest): Observable<GetLexiconResponse> {
    if (request.subset === 'LEXICON_SUBSET_GIVEN_NAMES') {
      return of({
        words: ['Alice', 'Bob', 'Carol', 'David'],
      });
    } else if (request.prefix === 'e') {
      return of({
        words: ['example', 'excellent'],
      });
    } else {
      return of({
        words: [],
      });
    }
  }

  textPrediction(textPredictionRequest: TextPredictionRequest):
      Observable<TextPredictionResponse> {
    if (textPredictionRequest.userId == 'testuser' &&
        textPredictionRequest.allowedTags!.length === 1 &&
        textPredictionRequest.allowedTags![0] === 'partner-name') {
      return of({
        contextualPhrases: [
          {
            phraseId: 'a1',
            text: 'Alex',
          },
          {
            phraseId: 'a2',
            text: 'Ben',
          },
          {
            phraseId: 'a3',
            text: 'Celine',
          },
          {
            phraseId: 'a4',
            text: 'Danielle',
          },
        ]
      })
    } else {
      return of({});
    }
  }
}

describe('LexiconComponent', () => {
  let fixture: ComponentFixture<LexiconComponent>;
  let speakFasterServiceForTest: SpeakFasterServiceForTest;
  let loadPrefixedLexiconRequestSubject: Subject<LoadLexiconRequest>;
  let getLexiconSpy: jasmine.Spy;

  beforeEach(async () => {
    (LexiconComponent as any).GIVEN_NAMES = null;
    loadPrefixedLexiconRequestSubject = new Subject();
    speakFasterServiceForTest = new SpeakFasterServiceForTest();
    getLexiconSpy =
        spyOn(speakFasterServiceForTest, 'getLexicon').and.callThrough();
    await TestBed
        .configureTestingModule({
          imports: [LexiconModule, HttpClientModule],
          declarations: [LexiconComponent],
          providers: [
            {
              provide: SpeakFasterService,
              useValue: speakFasterServiceForTest,
            },
          ],
        })
        .compileComponents();
    fixture = TestBed.createComponent(LexiconComponent);
    fixture.componentInstance.userId = 'testuser';
    fixture.componentInstance.loadPrefixedLexiconRequestSubject =
        loadPrefixedLexiconRequestSubject;
    fixture.detectChanges();
  });

  describe('canonicalizeName', () => {
    it('returns canonicalized names', () => {
      expect(canonicalizeName('jerry')).toEqual('Jerry');
      expect(canonicalizeName('jerry\n')).toEqual('Jerry');
      expect(canonicalizeName(' Jerry')).toEqual('Jerry');
    });
  });

  describe('chooseStringRandomly', () => {
    it('chooses random string', () => {
      const chosen = chooseStringRandomly(['foo', 'bar', 'qux']);
      expect(['foo', 'bar', 'qux'].indexOf(chosen)).not.toEqual(-1);
    });

    it('throws error for empty list input', () => {
      expect(() => chooseStringRandomly([])).toThrowError();
    });
  });

  it('calls getLexicon with give name subset on init', () => {
    expect(getLexiconSpy).toHaveBeenCalledOnceWith({
      languageCode: undefined,
      subset: 'LEXICON_SUBSET_GIVEN_NAMES',
    });
    expect((LexiconComponent as any).GIVEN_NAMES).toEqual([
      'Alice', 'Bob', 'Carol', 'David'
    ]);
  });

  it('calls getLexicon with language code on request event', () => {
    loadPrefixedLexiconRequestSubject.next({
      prefix: 'e',
    });

    expect(getLexiconSpy).toHaveBeenCalledTimes(2);
    expect(getLexiconSpy).toHaveBeenCalledWith({
      languageCode: undefined,
      prefix: 'e',
    });
    expect(LexiconComponent.isValidWord('example')).toBeTrue();
    expect(LexiconComponent.isValidWord('Example')).toBeTrue();
    expect(LexiconComponent.isValidWord('EXAMPLE')).toBeTrue();
    expect(LexiconComponent.isValidWord('Excellent')).toBeTrue();
    expect(LexiconComponent.isValidWord('Earnest')).toBeFalse();
  });

  it('Replaces names with user specific ones', () => {
    expect(LexiconComponent.replacePersonNamesWithKnownValues(
               'Hi, how are you, Alice'))
        .toEqual('Hi, how are you, Alex');
    expect(LexiconComponent.replacePersonNamesWithKnownValues(
               'Hi, how are you, bob'))
        .toEqual('Hi, how are you, Ben');
    expect(LexiconComponent.replacePersonNamesWithKnownValues(
               'Carol, you have a minute?'))
        .toEqual('Celine, you have a minute?');
  });

  it('Does not replace names without matches', () => {
    expect(LexiconComponent.replacePersonNamesWithKnownValues(
               'Hi, how are you, Frank'))
        .toEqual('Hi, how are you, Frank');
    expect(
        LexiconComponent.replacePersonNamesWithKnownValues('Hi, how are you'))
        .toEqual('Hi, how are you');
  })
});
