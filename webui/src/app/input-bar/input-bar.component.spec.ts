/** Unit tests for InputBarComponent. */
import {Injectable} from '@angular/core';
import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Observable, Subject} from 'rxjs';

import * as cefSharp from '../../utils/cefsharp';
import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {repeatVirtualKey, resetReconStates, VIRTUAL_KEY} from '../external/external-events.component';
import {InputBarChipComponent} from '../input-bar-chip/input-bar-chip.component';
import {InputBarChipModule} from '../input-bar-chip/input-bar-chip.module';
import {LoadLexiconRequest} from '../lexicon/lexicon.component';
import {FillMaskRequest, SpeakFasterService} from '../speakfaster-service';
import {TestListener} from '../test-utils/test-cefsharp-listener';
import {InputAbbreviationChangedEvent} from '../types/abbreviation';
import {AddContextualPhraseRequest, AddContextualPhraseResponse} from '../types/contextual_phrase';
import {TextEntryEndEvent} from '../types/text-entry';

import {InputBarComponent, InputBarControlEvent, State} from './input-bar.component';
import {InputBarModule} from './input-bar.module';

@Injectable()
class SpeakFasterServiceForTest {
  public addContextualPhrase(request: AddContextualPhraseRequest):
      Observable<AddContextualPhraseResponse> {
    throw new Error('Should call spy instead of this method.');
  }
}

describe('InputBarComponent', () => {
  let testListener: TestListener;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let inputBarControlSubject: Subject<InputBarControlEvent>;
  let abbreviationExpansionTriggers: Subject<InputAbbreviationChangedEvent>;
  let loadPrefixedLexiconRequestSubject: Subject<LoadLexiconRequest>;
  let fillMaskTriggers: Subject<FillMaskRequest>;
  let fixture: ComponentFixture<InputBarComponent>;
  let speakFasterServiceForTest: SpeakFasterServiceForTest;
  let textEntryEndEvents: TextEntryEndEvent[];
  let inputAbbreviationChangeEvents: InputAbbreviationChangedEvent[];
  let LoadLexiconRequests: LoadLexiconRequest[];
  let fillMaskRequests: FillMaskRequest[];

  beforeEach(async () => {
    resetReconStates();
    testListener = new TestListener();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    textEntryEndSubject = new Subject();
    inputBarControlSubject = new Subject();
    abbreviationExpansionTriggers = new Subject();
    loadPrefixedLexiconRequestSubject = new Subject();
    fillMaskTriggers = new Subject();
    speakFasterServiceForTest = new SpeakFasterServiceForTest();
    textEntryEndEvents = [];
    textEntryEndSubject.subscribe(event => {
      textEntryEndEvents.push(event);
    })
    inputAbbreviationChangeEvents = [];
    abbreviationExpansionTriggers.subscribe(
        (event: InputAbbreviationChangedEvent) => {
          inputAbbreviationChangeEvents.push(event);
        });
    LoadLexiconRequests = [];
    loadPrefixedLexiconRequestSubject.subscribe(
        (request: LoadLexiconRequest) => {
          LoadLexiconRequests.push(request);
        });
    fillMaskRequests = [];
    fillMaskTriggers.subscribe(request => {
      fillMaskRequests.push(request);
    });

    await TestBed
        .configureTestingModule({
          imports: [InputBarModule, InputBarChipModule],
          declarations: [InputBarComponent, InputBarChipComponent],
          providers: [
            {provide: SpeakFasterService, useValue: speakFasterServiceForTest},
            {provide: HttpEventLogger, useValue: new HttpEventLogger(null)},
          ],
        })
        .compileComponents();
    fixture = TestBed.createComponent(InputBarComponent);
    fixture.componentInstance.userId = 'testuser';
    fixture.componentInstance.contextStrings = ['How are you'];
    fixture.componentInstance.supportsAbbrevationExpansion = true;
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.componentInstance.inputBarControlSubject = inputBarControlSubject;
    fixture.componentInstance.fillMaskTriggers = fillMaskTriggers;
    fixture.componentInstance.abbreviationExpansionTriggers =
        abbreviationExpansionTriggers;
    fixture.componentInstance.loadPrefixedLexiconRequestSubject =
        loadPrefixedLexiconRequestSubject;
    fixture.detectChanges();
  });

  afterEach(async () => {
    if (cefSharp.BOUND_LISTENER_NAME in (window as any)) {
      delete (window as any)[cefSharp.BOUND_LISTENER_NAME];
    }
  });

  it('input box is initially empty', () => {
    const inputText = fixture.debugElement.query(By.css('.input-text'));
    expect(inputText.nativeElement.innerText).toEqual('|');  // The cursor.
    expect(fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
               .length)
        .toEqual(0);
    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.abort-button'))).toBeNull();
  });

  it('initially displays cursor', () => {
    expect(fixture.debugElement.query(By.css('.simulated-cursor')))
        .not.toBeNull();
  });

  function enterKeysIntoComponent(
      keySequence: Array<string|VIRTUAL_KEY>,
      reconstructedText: string|string[], baseLength = 0): void {
    for (let i = 0; i < keySequence.length; ++i) {
      const currentKeySequence = keySequence.slice(0, i + 1)
      if (typeof reconstructedText === 'string') {
        fixture.componentInstance.listenToKeypress(
            currentKeySequence, reconstructedText.slice(0, baseLength + i + 1));
      }
      else {
        fixture.componentInstance.listenToKeypress(
            currentKeySequence,
            reconstructedText[i].slice(0, baseLength + i + 1));
      }
      fixture.detectChanges();
    }
  }

  for (const [keySequence, reconstructedText, expectedText] of [
           [['b'], 'b', 'b'],
           [['b', 'a'], 'ba', 'ba'],
           [['b', 'a', VIRTUAL_KEY.BACKSPACE], 'b', 'b'],
           [['b', 'a', VIRTUAL_KEY.BACKSPACE, 'c'], 'bc', 'bc'],
           [['b', VIRTUAL_KEY.SPACE], 'b ', 'b '],
           [[VIRTUAL_KEY.SPACE, 'b'], ' b', ' b'],
           [[VIRTUAL_KEY.ENTER, 'b'], ' b', ' b'],
           [[VIRTUAL_KEY.SPACE, VIRTUAL_KEY.ENTER, 'b'], ' b', ' b'],
  ] as Array<[string[], string, string]>) {
    it(`entering keys cause text and buttons to be displayed: ` +
           `key sequence = ${JSON.stringify(keySequence)}`,
       () => {
         enterKeysIntoComponent(keySequence, reconstructedText);

         const inputText = fixture.debugElement.query(By.css('.input-text'));
         expect(inputText.nativeElement.innerText).toEqual(expectedText + '|');
         expect(fixture.debugElement.query(By.css('.expand-button')))
             .not.toBeNull();
         expect(fixture.debugElement.query(By.css('.spell-button')))
             .not.toBeNull();
         expect(fixture.debugElement.query(By.css('.abort-button')))
             .not.toBeNull();
         expect(fixture.debugElement.query(By.css('.simulated-cursor')))
             .not.toBeNull();
       });
  }

  it('clicking abort button clears state: no head keywords', () => {
    fixture.componentInstance.listenToKeypress(['a', 'b'], 'ab');
    fixture.detectChanges();
    const abortButton = fixture.debugElement.query(By.css('.abort-button'));
    abortButton.nativeElement.click();
    fixture.detectChanges();

    const inputText = fixture.debugElement.query(By.css('.input-text'));
    expect(inputText.nativeElement.innerText).toEqual('|');
    expect(fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
               .length)
        .toEqual(0);
    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.abort-button'))).toBeNull();
  });

  for (const
           [keySequence, reconstructedText, expectedAbbreviationString,
            expectdEraserSequenceLength] of
               [[
                 ['x', 'y', VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE], 'xy  ', 'xy',
                 4
               ],
                [['x', 'y', VIRTUAL_KEY.ENTER], 'xy\n', 'xy', 3],
                [
                  // Casing in abbreviation should be ignored.
                  [VIRTUAL_KEY.LSHIFT, 'x', 'y', VIRTUAL_KEY.ENTER], 'Xy\n',
                  'xy', 3
                ],
                [
                  ['x', 'y', VIRTUAL_KEY.SPACE, VIRTUAL_KEY.ENTER], 'xy \n',
                  'xy', 4
                ],
  ] as Array<[string[], string, string, number]>) {
    it(`key sequence triggers AE: ` +
           `key sequence: ${JSON.stringify(keySequence)}`,
       () => {
         enterKeysIntoComponent(keySequence, reconstructedText);

         expect(inputAbbreviationChangeEvents.length).toEqual(1);
         const {abbreviationSpec} = inputAbbreviationChangeEvents[0];
         expect(abbreviationSpec.readableString)
             .toEqual(expectedAbbreviationString);
         expect(abbreviationSpec.tokens.length).toEqual(1);
         expect(abbreviationSpec.tokens[0].value)
             .toEqual(expectedAbbreviationString);
         expect(abbreviationSpec.tokens[0].isKeyword).toBeFalse();
         expect(abbreviationSpec.eraserSequence)
             .toEqual(repeatVirtualKey(
                 VIRTUAL_KEY.BACKSPACE, expectdEraserSequenceLength));
         expect(abbreviationSpec.lineageId.length).toBeGreaterThan(0);
         expect(inputAbbreviationChangeEvents[0].requestExpansion)
             .toEqual(true);
       });
  }

  for (const
           [keySequence, reconstructedText, expectedAbbreviationString,
            expectedEraserSequenceLength] of
               [[['x', 'y'], 'xy  ', 'xy', 2],
                [['x', 'y', VIRTUAL_KEY.SPACE], 'xy ', 'xy', 3],
                [[VIRTUAL_KEY.SPACE, 'x', 'y'], ' xy ', 'xy', 3],
  ] as Array<[string[], string, string, number]>) {
    it(`clicking expand button triggers AE: ` +
           `key sequence: ${JSON.stringify(keySequence)}`,
       () => {
         enterKeysIntoComponent(keySequence, reconstructedText);
         const expandButton =
             fixture.debugElement.query(By.css('.expand-button'));
         expandButton.nativeElement.click();
         fixture.detectChanges();

         expect(inputAbbreviationChangeEvents.length).toEqual(1);
         const {abbreviationSpec} = inputAbbreviationChangeEvents[0];
         expect(abbreviationSpec.readableString)
             .toEqual(expectedAbbreviationString);
         expect(abbreviationSpec.tokens.length).toEqual(1);
         expect(abbreviationSpec.tokens[0].value)
             .toEqual(expectedAbbreviationString);
         expect(abbreviationSpec.tokens[0].isKeyword).toBeFalse();
         expect(abbreviationSpec.eraserSequence)
             .toEqual(repeatVirtualKey(
                 VIRTUAL_KEY.BACKSPACE, expectedEraserSequenceLength));
         expect(abbreviationSpec.lineageId.length).toBeGreaterThan(0);
         expect(inputAbbreviationChangeEvents[0].requestExpansion)
             .toEqual(true);
       });
  }

  it('long input abbreviation disables AE buttons and shows notice', () => {
    // Length 11.
    const keySequence =
        ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'o'];
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);

    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.abort-button'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.length-limit-exceeded')))
        .not.toBeNull();
  });

  it('long input abbreviation followed by trigger sequence does not trigger AE',
     () => {
       // Length 11, excluding the two space keys.
       const keySequence = [
         'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
         VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE
       ];
       const reconstructedText = keySequence.join('');
       enterKeysIntoComponent(keySequence, reconstructedText);

       expect(inputAbbreviationChangeEvents.length).toEqual(0);
     });

  it('input abbreviation with head keywords triggers AE', () => {
    const keySequence = [
      'a', VIRTUAL_KEY.SPACE, 'g', 'o', 'o', 'd', VIRTUAL_KEY.SPACE, 't', 'i',
      'a', 't', 'h', 's', VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE
    ];
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);

    expect(inputAbbreviationChangeEvents.length).toEqual(1);
    expect(inputAbbreviationChangeEvents[0].requestExpansion).toBeTrue();
    const {abbreviationSpec} = inputAbbreviationChangeEvents[0];
    expect(abbreviationSpec.readableString).toEqual('a good tiaths');
    const {tokens} = abbreviationSpec;
    expect(tokens.length).toEqual(3);
    expect(tokens[0]).toEqual({value: 'a', isKeyword: true});
    expect(tokens[1]).toEqual({value: 'good', isKeyword: true});
    expect(tokens[2]).toEqual({value: 'tiaths', isKeyword: false});
    expect(abbreviationSpec.lineageId.length).toBeGreaterThan(0);
    expect(abbreviationSpec.eraserSequence)
        .toEqual(repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, keySequence.length));
  });

  it('input abbreviation with head keywords with period triggers AE without period',
     () => {
       const keySequence = [
         'g', 'o', 'o', 'd', VIRTUAL_KEY.PERIOD, VIRTUAL_KEY.SPACE, 't', 'i',
         'a', 't', 'h', 's', VIRTUAL_KEY.SPACE, VIRTUAL_KEY.SPACE
       ];
       const reconstructedText = keySequence.join('');
       enterKeysIntoComponent(keySequence, reconstructedText);

       expect(inputAbbreviationChangeEvents.length).toEqual(1);
       expect(inputAbbreviationChangeEvents[0].requestExpansion).toBeTrue();
       const {abbreviationSpec} = inputAbbreviationChangeEvents[0];
       expect(abbreviationSpec.readableString).toEqual('good tiaths');
       const {tokens} = abbreviationSpec;
       expect(tokens.length).toEqual(2);
       expect(tokens[0]).toEqual({value: 'good', isKeyword: true});
       expect(tokens[1]).toEqual({value: 'tiaths', isKeyword: false});
       expect(abbreviationSpec.lineageId.length).toBeGreaterThan(0);
       expect(abbreviationSpec.eraserSequence)
           .toEqual(
               repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, keySequence.length));
     });


  it('too many head keywords disable expand and spell buttons', () => {
    const keySequence = [
      'a', VIRTUAL_KEY.SPACE, 'b', 'i', 'g', VIRTUAL_KEY.SPACE, 'a', 'n', 'd',
      VIRTUAL_KEY.SPACE, 'r', 'e', 'd', VIRTUAL_KEY.SPACE, 'a', 'n',
      'd',  // Five keywords up to this point.
      VIRTUAL_KEY.SPACE, 'd'
    ];
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);

    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.abort-button'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.length-limit-exceeded')))
        .not.toBeNull();
  });

  it('clicking abort button clears state: no head keywords', () => {
    const keySequence = [
      'a', VIRTUAL_KEY.SPACE, 'b', 'i', 'g', VIRTUAL_KEY.SPACE, 'a', 'n', 'd',
      VIRTUAL_KEY.SPACE, 'r', 'e', 'd', VIRTUAL_KEY.SPACE, 'a'
    ];
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);
    const abortButton = fixture.debugElement.query(By.css('.abort-button'));
    abortButton.nativeElement.click();
    fixture.detectChanges();

    const inputText = fixture.debugElement.query(By.css('.input-text'));
    expect(inputText.nativeElement.innerText).toEqual('|');
    expect(fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
               .length)
        .toEqual(0);
    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.abort-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.length-limit-exceeded')))
        .toBeNull();
  });

  it('clicking spell button injects chips', () => {
    const keySequence = ['a', 'c', 'e'];
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();

    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    expect(chips.length).toEqual(3);
    expect((chips[0].componentInstance as InputBarChipComponent).text)
        .toEqual('a');
    expect((chips[1].componentInstance as InputBarChipComponent).text)
        .toEqual('c');
    expect((chips[2].componentInstance as InputBarChipComponent).text)
        .toEqual('e');
    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.length-limit-exceeded')))
    expect(fixture.debugElement.query(By.css('.abort-button'))).not.toBeNull();
    expect(LoadLexiconRequests.length).toEqual(0);
  });

  it('clicking spell button injects space key to self app', () => {
    const keySequence = ['a', 'c', 'e'];
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();

    expect(testListener.numRequestSoftkeyboardResetCalls).toEqual(1);
  });

  it('spelling word updates chips', () => {
    const keySequence = ['a', 'b', 'c'];
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    const spellSequence = ['b', 'i', 't'];
    const spellReconstructedText = reconstructedText + spellSequence.join('');
    enterKeysIntoComponent(spellSequence, spellReconstructedText, 3);

    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    expect(chips.length).toEqual(3);
    expect((chips[0].componentInstance as InputBarChipComponent).text)
        .toEqual('a');
    expect((chips[1].componentInstance as InputBarChipComponent).text)
        .toEqual('bit');
    expect((chips[2].componentInstance as InputBarChipComponent).text)
        .toEqual('c');
    expect(fixture.debugElement.query(By.css('.expand-button'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.length-limit-exceeded')))
    expect(fixture.debugElement.query(By.css('.abort-button'))).not.toBeNull();
    expect(inputAbbreviationChangeEvents.length).toEqual(0);
    expect(LoadLexiconRequests.length).toEqual(1);
    expect(LoadLexiconRequests[0]).toEqual({prefix: 'b'});
  });

  it('backspace during spelling: reconstructs correct word', () => {
    const keySequence = ['a', 'b', 'c'];
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    const spellSequence = ['a', 'l', VIRTUAL_KEY.BACKSPACE, 'n', 'y'];
    const spellReconstructedText = [
      reconstructedText + 'a',
      reconstructedText + 'al',
      reconstructedText + 'a',
      reconstructedText + 'an',
      reconstructedText + 'any',
    ];
    enterKeysIntoComponent(spellSequence, spellReconstructedText, 3);

    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    expect(chips.length).toEqual(3);
    expect((chips[0].componentInstance as InputBarChipComponent).text)
        .toEqual('any');
    expect((chips[1].componentInstance as InputBarChipComponent).text)
        .toEqual('b');
    expect((chips[2].componentInstance as InputBarChipComponent).text)
        .toEqual('c');
  });

  for (const triggerKey of [VIRTUAL_KEY.SPACE, VIRTUAL_KEY.ENTER]) {
    for (const endPunctuation of ['.', '?', '!']) {
      it('spelling word then enter trigger key triggers AE: ' +
             `trigger key = ${triggerKey}; ` +
             `ending punctuation = ${endPunctuation}`,
         () => {
           const keySequence = ['a', 'b', 'c'];
           const reconstructedText = keySequence.join('');
           enterKeysIntoComponent(keySequence, reconstructedText);
           const spellButton =
               fixture.debugElement.query(By.css('.spell-button'));
           spellButton.nativeElement.click();
           fixture.detectChanges();
           // The ending punctuation should be ignored by keyword AE.
           const spellSequence = ['b', 'i', 't', endPunctuation, triggerKey];
           const spellReconstructedText =
               spellSequence.join('') + reconstructedText;
           enterKeysIntoComponent(spellSequence, spellReconstructedText);

           expect(inputAbbreviationChangeEvents.length).toEqual(1);
           expect(inputAbbreviationChangeEvents[0].requestExpansion).toBeTrue();
           const {abbreviationSpec} = inputAbbreviationChangeEvents[0];
           expect(abbreviationSpec.tokens.length).toEqual(3);
           expect(abbreviationSpec.readableString).toEqual('a bit c');
           // TODO(cais): Make assertion about eraseSequence with spelling.
           const {tokens} = abbreviationSpec;
           expect(tokens[0]).toEqual({value: 'a', isKeyword: false});
           expect(tokens[1]).toEqual({value: 'bit', isKeyword: true});
           expect(tokens[2]).toEqual({value: 'c', isKeyword: false});
         });
    }
  }

  it('spelling word with extraneous period then enter trigger key triggers AE: ',
     () => {
       const keySequence = ['a', 'b', 'c'];
       const reconstructedText = keySequence.join('');
       enterKeysIntoComponent(keySequence, reconstructedText);
       const spellButton = fixture.debugElement.query(By.css('.spell-button'));
       spellButton.nativeElement.click();
       fixture.detectChanges();
       const spellSequence =
           ['b', 'i', 't', VIRTUAL_KEY.PERIOD, VIRTUAL_KEY.SPACE];
       const spellReconstructedText =
           spellSequence.join('') + reconstructedText;
       enterKeysIntoComponent(spellSequence, spellReconstructedText);

       expect(inputAbbreviationChangeEvents.length).toEqual(1);
       expect(inputAbbreviationChangeEvents[0].requestExpansion).toBeTrue();
       const {abbreviationSpec} = inputAbbreviationChangeEvents[0];
       expect(abbreviationSpec.tokens.length).toEqual(3);
       expect(abbreviationSpec.readableString).toEqual('a bit c');
       // TODO(cais): Make assertion about eraseSequence with spelling.
       const {tokens} = abbreviationSpec;
       expect(tokens[0]).toEqual({value: 'a', isKeyword: false});
       expect(tokens[1]).toEqual({value: 'bit', isKeyword: true});
       expect(tokens[2]).toEqual({value: 'c', isKeyword: false});
     });

  it('clicking expand button after spelling triggers AE', () => {
    const keySequence = ['a', 'b', 'c'];
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    // Letter casing should be ignored.
    const spellSequence = [VIRTUAL_KEY.LSHIFT, 'b', 'i', 't'];
    const spellReconstructedText = 'Bit';
    enterKeysIntoComponent(spellSequence, spellReconstructedText);
    const expandButton = fixture.debugElement.query(By.css('.expand-button'));
    expandButton.nativeElement.click();

    expect(inputAbbreviationChangeEvents.length).toEqual(1);
    expect(inputAbbreviationChangeEvents[0].requestExpansion).toBeTrue();
    const {abbreviationSpec} = inputAbbreviationChangeEvents[0];
    expect(abbreviationSpec.tokens.length).toEqual(3);
    expect(abbreviationSpec.readableString).toEqual('a bit c');
    // TODO(cais): Make assertion about eraseSequence with spelling.
    const {tokens} = abbreviationSpec;
    expect(tokens[0]).toEqual({value: 'a', isKeyword: false});
    expect(tokens[1]).toEqual({value: 'bit', isKeyword: true});
    expect(tokens[2]).toEqual({value: 'c', isKeyword: false});
  });

  it('clicking chip then spell and trigger AE works', () => {
    const keySequence = ['a', 'b', 'a'];
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    chips[2].nativeElement.click();
    fixture.detectChanges();
    const spellSequence = ['a', 'c', 'k', VIRTUAL_KEY.SPACE];
    const spellReconstructedText = reconstructedText + spellSequence.join('');
    enterKeysIntoComponent(spellSequence, spellReconstructedText, 3);

    expect(inputAbbreviationChangeEvents.length).toEqual(1);
    expect(inputAbbreviationChangeEvents[0].requestExpansion).toBeTrue();
    const {abbreviationSpec} = inputAbbreviationChangeEvents[0];
    expect(abbreviationSpec.tokens.length).toEqual(2);
    expect(abbreviationSpec.readableString).toEqual('ab ack');
    // TODO(cais): Make assertion about eraseSequence with spelling, after
    // fixing the logic.
    const {tokens} = abbreviationSpec;
    expect(tokens[0]).toEqual({value: 'ab', isKeyword: false});
    expect(tokens[1]).toEqual({value: 'ack', isKeyword: true});
    expect(LoadLexiconRequests.length).toEqual(1);
    expect(LoadLexiconRequests[0]).toEqual({prefix: 'a'});
  });

  it('irrelevant keypresses during spelling are ignored', () => {
    const keySequence = ['a', 'b', 'c'];
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    // The first three keys ('x', 'y' and 'z') are irrelevant and hence must
    // be ignored.
    const spellSequence = ['x', 'y', 'z', 'b', 'i', 't'];
    const spellReconstructedText = reconstructedText + spellSequence.join('');
    enterKeysIntoComponent(spellSequence, spellReconstructedText, 3);

    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    expect(chips.length).toEqual(3);
    expect((chips[0].componentInstance as InputBarChipComponent).text)
        .toEqual('a');
    expect((chips[1].componentInstance as InputBarChipComponent).text)
        .toEqual('bit');
    expect((chips[2].componentInstance as InputBarChipComponent).text)
        .toEqual('c');

    const expandButton = fixture.debugElement.query(By.css('.expand-button'));
    expandButton.nativeElement.click();
    expect(inputAbbreviationChangeEvents.length).toEqual(1);
    expect(inputAbbreviationChangeEvents[0].requestExpansion).toBeTrue();
    const {abbreviationSpec} = inputAbbreviationChangeEvents[0];
    expect(abbreviationSpec.readableString).toEqual('a bit c');
    expect(abbreviationSpec.tokens.length).toEqual(3);
    // TODO(cais): Sort out the eraser sequence when there are irrelevant
    // keys. expect(abbreviationSpec.eraserSequence)
    //     .toEqual(repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, 9));
  });

  it('ambiguous keypress during spelling are ignored', () => {
    const keySequence = ['c', 'b', 'c'];  // Noticie the duplicate letters c.
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    const spellSequence = ['c', 'c', 'c'];
    const spellReconstructedText = reconstructedText + spellSequence.join('');
    enterKeysIntoComponent(spellSequence, spellReconstructedText, 3);

    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    expect(chips.length).toEqual(3);
    expect(chips.length).toEqual(3);
    expect((chips[0].componentInstance as InputBarChipComponent).text)
        .toEqual('c');
    expect((chips[1].componentInstance as InputBarChipComponent).text)
        .toEqual('b');
    expect((chips[2].componentInstance as InputBarChipComponent).text)
        .toEqual('c');
  });

  it('clicking abort after clicking spell resets state', () => {
    const keySequence = ['a', 'b', 'a'];
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    const abortButton = fixture.debugElement.query(By.css('.abort-button'));
    abortButton.nativeElement.click();
    fixture.detectChanges();

    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    expect(chips.length).toEqual(0);

    expect(fixture.debugElement.query(By.css('.expand-button'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).not.toBeNull();
    const expandButton = fixture.debugElement.query(By.css('.expand-button'));
    expandButton.nativeElement.click();

    expect(inputAbbreviationChangeEvents.length).toEqual(1);
    expect(inputAbbreviationChangeEvents[0].requestExpansion).toBeTrue();
    const {abbreviationSpec} = inputAbbreviationChangeEvents[0];
    expect(abbreviationSpec.tokens.length).toEqual(1);
    expect(abbreviationSpec.tokens[0].value).toEqual('aba');
    expect(abbreviationSpec.tokens[0].isKeyword).toBeFalse();
    expect(abbreviationSpec.readableString).toEqual('aba');
  });

  it('clicking abort during spelling resets state', () => {
    const keySequence = ['a', 'b', 'a'];
    const reconstructedText = keySequence.join('');
    enterKeysIntoComponent(keySequence, reconstructedText);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    chips[2].nativeElement.click();
    fixture.detectChanges();
    const spellSequence = ['a', 'c', 'k'];
    const spellReconstructedText = reconstructedText + spellSequence.join('');
    enterKeysIntoComponent(spellSequence, spellReconstructedText, 3);
    const abortButton = fixture.debugElement.query(By.css('.abort-button'));
    abortButton.nativeElement.click();
    fixture.detectChanges();

    expect(fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
               .length)
        .toEqual(0);

    expect(fixture.debugElement.query(By.css('.expand-button'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).not.toBeNull();
    const expandButton = fixture.debugElement.query(By.css('.expand-button'));
    expandButton.nativeElement.click();

    expect(inputAbbreviationChangeEvents.length).toEqual(1);
    expect(inputAbbreviationChangeEvents[0].requestExpansion).toBeTrue();
    const {abbreviationSpec} = inputAbbreviationChangeEvents[0];
    expect(abbreviationSpec.tokens.length).toEqual(1);
    expect(abbreviationSpec.tokens[0].value).toEqual('aba');
    expect(abbreviationSpec.tokens[0].isKeyword).toBeFalse();
    expect(abbreviationSpec.readableString).toEqual('aba');
  });

  it('chips are shown during refinement', () => {
    inputBarControlSubject.next({
      chips: [
        {
          text: 'i',
        },
        {
          text: 'feel',
        },
        {
          text: 'great',
        }
      ]
    });
    fixture.detectChanges();

    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    expect(chips.length).toEqual(3);
    expect((chips[0].componentInstance as InputBarChipComponent).text)
        .toEqual('i');
    expect((chips[1].componentInstance as InputBarChipComponent).text)
        .toEqual('feel');
    expect((chips[2].componentInstance as InputBarChipComponent).text)
        .toEqual('great');
    expect(fillMaskRequests.length).toEqual(0);
  });

  it('clicking chip during refinement triggers fillMask and calls ' +
         'self-app key inject',
     () => {
       inputBarControlSubject.next({
         chips: [
           {
             text: 'i',
           },
           {
             text: 'feel',
           },
           {
             text: 'great',
           }
         ]
       });
       fixture.detectChanges();
       const chips =
           fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
       chips[2].nativeElement.click();

       expect(fillMaskRequests.length).toEqual(1);
       expect(fillMaskRequests[0]).toEqual({
         speechContent: 'How are you',
         phraseWithMask: 'i feel _',
         maskInitial: 'g',
       });
       expect(testListener.numRequestSoftkeyboardResetCalls).toEqual(1);
     });

  it('types keys during refinement registers manual revision', () => {
    inputBarControlSubject.next({
      chips: [
        {
          text: 'i',
        },
        {
          text: 'feel',
        },
        {
          text: 'great',
        }
      ]
    });
    fixture.detectChanges();
    const keySequence = ['f', 'e', 'l', 't', VIRTUAL_KEY.SPACE];
    const reconstructedText = keySequence.join('');
    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
    chips[1].nativeElement.click();
    enterKeysIntoComponent(keySequence, reconstructedText);
    const speakButton = fixture.debugElement.query(By.css('.speak-button'));
    speakButton.nativeElement.click();

    expect(textEntryEndEvents.length).toEqual(1);
    expect(textEntryEndEvents[0].text).toEqual('i felt great');
    expect(textEntryEndEvents[0].repeatLastNonEmpty).toBeFalse();
    expect(textEntryEndEvents[0].inAppTextToSpeechAudioConfig)
        .not.toBeUndefined();
  });

  it('types keys during refinement registers manual revision: first chip',
     () => {
       inputBarControlSubject.next({
         chips: [
           {
             text: 'i',
           },
           {
             text: 'feel',
           },
           {
             text: 'great',
           }
         ]
       });
       fixture.detectChanges();
       const keySequence = ['i', 't', VIRTUAL_KEY.SPACE];
       const reconstructedText = keySequence.join('');
       const chips =
           fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
       chips[0].nativeElement.click();
       enterKeysIntoComponent(keySequence, reconstructedText);
       const speakButton = fixture.debugElement.query(By.css('.speak-button'));
       speakButton.nativeElement.click();

       expect(textEntryEndEvents.length).toEqual(1);
       expect(textEntryEndEvents[0].text).toEqual('it feel great');
       expect(textEntryEndEvents[0].repeatLastNonEmpty).toBeFalse();
       expect(textEntryEndEvents[0].inAppTextToSpeechAudioConfig)
           .not.toBeUndefined();
     });

  it('clicking speak button clears text & clicking again triggers repeat',
     () => {
       enterKeysIntoComponent(['i', 't'], 'it');
       fixture.detectChanges();
       const speakButton = fixture.debugElement.query(By.css('.speak-button'))
                               .query(By.css('.speak-button'));
       speakButton.nativeElement.click();

       expect(textEntryEndEvents.length).toEqual(1);
       expect(textEntryEndEvents[0].text).toEqual('it');
       expect(textEntryEndEvents[0].repeatLastNonEmpty).toBeFalse();

       speakButton.nativeElement.click();
       expect(textEntryEndEvents.length).toEqual(2);
       expect(textEntryEndEvents[1].text).toEqual('');
       expect(textEntryEndEvents[1].repeatLastNonEmpty).toBeTrue();
     });

  it('spell button is shown during word refinement', () => {
    fixture.componentInstance.inputString = 'ifg';
    inputBarControlSubject.next({
      chips: [
        {
          text: 'i',
        },
        {
          text: 'feel',
        },
        {
          text: 'great',
        }
      ]
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.state).toEqual(State.CHOOSING_WORD_CHIP);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    expect(spellButton).not.toBeNull();
  });

  it('spell button is shown when word chip is chosen', () => {
    fixture.componentInstance.inputString = 'ifg';
    inputBarControlSubject.next({
      chips: [
        {
          text: 'i',
        },
        {
          text: 'feel',
        },
        {
          text: 'great',
        }
      ]
    });
    fixture.detectChanges();
    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
    chips[1].nativeElement.click();

    expect(fixture.componentInstance.state).toEqual(State.FOCUSED_ON_WORD_CHIP);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    expect(spellButton).not.toBeNull();
  });

  it('typing after word chips are injected', () => {
    fixture.componentInstance.inputString = 'ifg';
    inputBarControlSubject.next({
      chips: [
        {
          text: 'i',
        },
        {
          text: 'feel',
        },
        {
          text: 'great',
        }
      ]
    });
    fixture.detectChanges();
    fixture.componentInstance.state = State.ENTERING_BASE_TEXT;
    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
    chips[1].nativeElement.click();

    expect(fixture.componentInstance.state).toEqual(State.ENTERING_BASE_TEXT);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    expect(spellButton).not.toBeNull();

    enterKeysIntoComponent(['s', 'o'], 'i feel great so', /* baseLength= */ 13);
    fixture.detectChanges();
    expect(fixture.componentInstance.inputString).toEqual('i feel great so');
  });

  it('clicking spell under word refinement enters spelling mode', () => {
    fixture.componentInstance.inputString = 'ifg';
    inputBarControlSubject.next({
      chips: [
        {
          text: 'i',
        },
        {
          text: 'feel',
        },
        {
          text: 'great',
        }
      ]
    });
    fixture.detectChanges();
    const wordChips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
    wordChips[1].nativeElement.click();
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.state).toEqual(State.CHOOSING_LETTER_CHIP);
    const letterChips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
    expect(letterChips.length).toEqual(3);
    expect((letterChips[0].componentInstance as InputBarChipComponent).text)
        .toEqual('i');
    expect((letterChips[1].componentInstance as InputBarChipComponent).text)
        .toEqual('f');
    expect((letterChips[2].componentInstance as InputBarChipComponent).text)
        .toEqual('g');
  });

  it('clicking inject text button injects keypresses with added final period',
     () => {
       const keySequence =
           ['a', 'l', 'l', VIRTUAL_KEY.SPACE, 'g', 'o', 'o', 'd'];
       const reconstructedText = 'all good';
       enterKeysIntoComponent(keySequence, reconstructedText);
       const injectButton =
           fixture.debugElement.query(By.css('.inject-button'));
       injectButton.nativeElement.click();

       expect(textEntryEndEvents.length).toEqual(1);
       const event = textEntryEndEvents[0];
       expect(event.isFinal).toBeTrue();
       expect(event.text).toEqual('all good. ');
       expect(event.injectedKeys).toEqual([
         'a', 'l', 'l', VIRTUAL_KEY.SPACE, 'g', 'o', 'o', 'd',
         VIRTUAL_KEY.PERIOD, VIRTUAL_KEY.SPACE
       ]);
       expect(event.inAppTextToSpeechAudioConfig).toBeUndefined();
       expect(event.timestampMillis).toBeGreaterThan(0);
       const calls = testListener.injectedKeysCalls;
       expect(calls.length).toEqual(1);
       expect(calls[0]).toEqual([65, 76, 76, 32, 71, 79, 79, 68, 190, 32]);
       expect(testListener.injectedTextCalls).toEqual(['all good. ']);
     });

  it('clicking inject text button injects keypresses without added final period',
     () => {
       const keySequence = [
         'a', 'l', 'l', VIRTUAL_KEY.SPACE, 'g', 'o', 'o', 'd',
         VIRTUAL_KEY.PERIOD
       ];
       const reconstructedText = 'all good';
       enterKeysIntoComponent(keySequence, reconstructedText);
       const injectButton =
           fixture.debugElement.query(By.css('.inject-button'));
       injectButton.nativeElement.click();

       expect(textEntryEndEvents.length).toEqual(1);
       const event = textEntryEndEvents[0];
       expect(event.isFinal).toBeTrue();
       expect(event.text).toEqual('all good. ');
       expect(event.injectedKeys).toEqual([
         'a', 'l', 'l', VIRTUAL_KEY.SPACE, 'g', 'o', 'o', 'd',
         VIRTUAL_KEY.PERIOD, VIRTUAL_KEY.SPACE
       ]);
       expect(event.inAppTextToSpeechAudioConfig).toBeUndefined();
       expect(event.timestampMillis).toBeGreaterThan(0);
     });

  it('Text predicton word chip injection sets correct state', () => {
    inputBarControlSubject.next({
      chips: [
        {
          text: 'i am feeling',
          isTextPrediction: true,
        },
      ]
    });

    expect(fixture.componentInstance.state).toEqual(State.ENTERING_BASE_TEXT);
    expect(fixture.componentInstance.inputString).toEqual('i am feeling ');
  });

  it('type after multi-word text prediction chip and then spell', () => {
    inputBarControlSubject.next({
      chips: [
        {
          text: 'i am feeling',
          isTextPrediction: true,
        },
      ]
    });
    enterKeysIntoComponent(['s', 's', 'g'], 'i am feeling ssg', 13);
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();

    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    expect(chips.length).toEqual(6);
    expect(chips[0].nativeElement.innerText).toEqual('i');
    expect(chips[1].nativeElement.innerText).toEqual('am');
    expect(chips[2].nativeElement.innerText).toEqual('feeling');
    expect(chips[3].nativeElement.innerText).toEqual('s');
    expect(chips[4].nativeElement.innerText).toEqual('s');
    expect(chips[5].nativeElement.innerText).toEqual('g');
    expect(fixture.componentInstance.state).toEqual(State.CHOOSING_LETTER_CHIP);
  });

  it('abort button is shown when text prediction chip is present',
     fakeAsync(() => {
       inputBarControlSubject.next({
         chips: [
           {
             text: 'i am feeling',
           },
         ]
       });
       (fixture.componentInstance as any).cutText = 'i am feeling';
       fixture.componentInstance.state = State.ENTERING_BASE_TEXT;
       fixture.detectChanges();

       const abortButton = fixture.debugElement.query(By.css('.abort-button'));
       expect(abortButton).not.toBeNull();

       const prevNumCalls = testListener.updateButtonBoxesCalls.length;
       abortButton.nativeElement.click();
       expect(fixture.componentInstance.state)
           .toEqual(State.ENTERING_BASE_TEXT);
       expect(fixture.componentInstance.chips.length).toEqual(0);
       expect(fixture.componentInstance.inputString).toEqual('');
       tick();
       expect(testListener.updateButtonBoxesCalls.length)
           .toEqual(prevNumCalls + 3);
       const lastCall =
           testListener
               .updateButtonBoxesCalls[testListener.updateButtonBoxesCalls.length - 1];
       expect(lastCall[0].indexOf('InputBarComponent_')).toEqual(0);
     }));

  it('launchin AE with pre-spelled words', () => {
    inputBarControlSubject.next({
      chips: [
        {
          text: 'i',
          preSpelled: true,
        },
        {
          text: 'am',
          preSpelled: true,
        },
        {
          text: 'feeling',
          preSpelled: true,
        },
        {
          text: 's',
        },
        {
          text: 'g',
        },
      ]
    });
    fixture.componentInstance.inputString = 'sg';
    fixture.componentInstance.state = State.CHOOSING_LETTER_CHIP;
    fixture.detectChanges();
    enterKeysIntoComponent(['g', 'o', 'o', 'd'], 'good');
    fixture.detectChanges();

    expect(fixture.componentInstance.state)
        .toEqual(State.FOCUSED_ON_LETTER_CHIP);
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    expect(chips.length).toEqual(5);
    expect(chips[0].nativeElement.innerText).toEqual('i');
    expect(chips[1].nativeElement.innerText).toEqual('am');
    expect(chips[2].nativeElement.innerText).toEqual('feeling');
    expect(chips[3].nativeElement.innerText).toEqual('s');
    expect(chips[4].nativeElement.innerText).toEqual('good |');
    expect(fixture.componentInstance
               .inputStringIsCompatibleWithAbbreviationExpansion)
        .toBeTrue();

    const expandButton = fixture.debugElement.query(By.css('.expand-button'));
    expandButton.nativeElement.click();
    fixture.detectChanges();

    expect(inputAbbreviationChangeEvents.length).toEqual(1);
    const event = inputAbbreviationChangeEvents[0];
    expect(event.requestExpansion).toBeTrue();
    const {abbreviationSpec} = event;
    expect(abbreviationSpec.readableString).toEqual('i am feeling s good');
    expect(abbreviationSpec.lineageId.length).toBeGreaterThan(0);
    expect(abbreviationSpec.tokens.length).toEqual(5);
    expect(abbreviationSpec.tokens[0]).toEqual({value: 'i', isKeyword: true});
    expect(abbreviationSpec.tokens[1]).toEqual({value: 'am', isKeyword: true});
    expect(abbreviationSpec.tokens[2])
        .toEqual({value: 'feeling', isKeyword: true});
    expect(abbreviationSpec.tokens[3]).toEqual({value: 's', isKeyword: false});
    expect(abbreviationSpec.tokens[4])
        .toEqual({value: 'good', isKeyword: true});
  });

  it('Cut and then type after AE option selection', () => {
    inputBarControlSubject.next({
      chips: [
        {
          text: 'i',
        },
        {
          text: 'feel',
        },
        {
          text: 'great',
        }
      ]
    });
    fixture.componentInstance.state = State.CHOOSING_WORD_CHIP;
    fixture.detectChanges();
    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    chips[1].nativeElement.click();
    fixture.detectChanges();

    const expandButton = fixture.debugElement.query(By.css('.cut-button'));
    expandButton.nativeElement.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.state).toEqual(State.ENTERING_BASE_TEXT);
    expect(fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
               .length)
        .toEqual(0);
    expect(fixture.componentInstance.inputString).toEqual('i feel ');

    enterKeysIntoComponent(['v', 'e'], 'i feel ve', /* baseLength= */ 7);
    expect(fixture.componentInstance.inputString).toEqual('i feel ve');
  });

  it('Selecting the last chip does not show cut button', () => {
    inputBarControlSubject.next({
      chips: [
        {
          text: 'i',
        },
        {
          text: 'feel',
        },
        {
          text: 'great',
        }
      ]
    });
    fixture.componentInstance.state = State.CHOOSING_WORD_CHIP;
    fixture.detectChanges();
    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    chips[2].nativeElement.click();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.cut-button'))).toBeNull();
  });

  it('typing then injecting text prediction combines text with prediction',
     () => {
       enterKeysIntoComponent(['w', 'o', 'w'], 'wow');
       inputBarControlSubject.next({
         chips: [{
           text: 'this is',
           isTextPrediction: true,
         }]
       });
       fixture.detectChanges();
       const chips = fixture.debugElement.queryAll(
           By.css('app-input-bar-chip-component'));

       expect(chips.length).toEqual(0);
       const text = fixture.debugElement.query(By.css('.base-text-area'));
       expect(text.nativeElement.innerText).toEqual('wow this is |');
       expect(fixture.componentInstance.state)
           .toEqual(State.ENTERING_BASE_TEXT);
       expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
     });

  it('multi-token abbreviation then hit spell: chips are correct', () => {
    enterKeysIntoComponent(
        [
          's', 'o', VIRTUAL_KEY.SPACE, 'm', 'u', 'c', 'h', VIRTUAL_KEY.SPACE,
          'b', 'v'
        ],
        'so much bv');
    fixture.detectChanges();
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();

    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    expect(chips.length).toEqual(4);
    expect(chips[0].nativeElement.innerText).toEqual('so');
    expect(chips[1].nativeElement.innerText).toEqual('much');
    expect(chips[2].nativeElement.innerText).toEqual('b');
    expect(chips[3].nativeElement.innerText).toEqual('v');
  });

  it('clicking favorite button calls ', () => {
    enterKeysIntoComponent(
        ['s', 'o', VIRTUAL_KEY.SPACE, 'l', 'o', 'n', 'g', VIRTUAL_KEY.SPACE],
        'so long ');
    const addContextualPhraseSpy =
        spyOn(speakFasterServiceForTest, 'addContextualPhrase');
    fixture.detectChanges();
    const favoriteButton =
        fixture.debugElement.query(By.css('app-favorite-button-component'))
            .query(By.css('.favorite-button'));
    favoriteButton.nativeElement.click();
    fixture.detectChanges();

    expect(addContextualPhraseSpy).toHaveBeenCalledOnceWith({
      userId: 'testuser',
      contextualPhrase: {
        phraseId: '',
        text: 'so long',
        tags: ['favorite'],
      },
    });
  });

  it('setting isFocus to false hides cursor', () => {
    fixture.componentInstance.isFocused = false;
    fixture.detectChanges();

    const cursor = fixture.debugElement.query(By.css('.simulated-cursor'));
    expect(cursor.classes['simulated-cursor-hidden']).toBeTrue();
  });

  it('setting isFocus back to true shows cursor', () => {
    fixture.componentInstance.isFocused = false;
    fixture.detectChanges();
    fixture.componentInstance.isFocused = true;
    fixture.detectChanges();

    const cursor = fixture.debugElement.query(By.css('.simulated-cursor'));
    expect(cursor.classes['simulated-cursor-hidden']).toBeUndefined();
  });

  it('append text signal in input bar control subject works', () => {
    inputBarControlSubject.next({appendText: 'foo bar'});
    fixture.detectChanges();

    expect(fixture.componentInstance.inputString).toEqual('foo bar ');
    expect(fixture.componentInstance.state).toEqual(State.ENTERING_BASE_TEXT);
  });

  it('onFavoritePhraseAdded with success issues text-entry end event', () => {
    fixture.componentInstance.onFavoritePhraseAdded(
        {text: 'foo', success: true});

    expect(textEntryEndEvents.length).toEqual(1);
    expect(textEntryEndEvents[0].isFinal).toBeTrue();
    expect(textEntryEndEvents[0].text).toEqual('foo');
    expect(textEntryEndEvents[0].timestampMillis).toBeGreaterThan(0);
  });

  it('onFavoritePhraseAdded with failure issues text-entry end event', () => {
    fixture.componentInstance.onFavoritePhraseAdded(
        {text: 'foo', success: false});

    expect(textEntryEndEvents.length).toEqual(0);
  });

  // TODO(cais): Test spelling valid word triggers AE, with debounce.
});
