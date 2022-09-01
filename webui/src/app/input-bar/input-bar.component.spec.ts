/** Unit tests for InputBarComponent. */
import {DebugElement, Injectable} from '@angular/core';
import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Observable, of, Subject} from 'rxjs';

import * as cefSharp from '../../utils/cefsharp';
import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {VIRTUAL_KEY} from '../external/external-events.component';
import {InputBarChipComponent} from '../input-bar-chip/input-bar-chip.component';
import {InputBarChipModule} from '../input-bar-chip/input-bar-chip.module';
import {InputTextPredictionsComponent} from '../input-text-predictions/input-text-predictions.component';
import {InputTextPredictionsModule} from '../input-text-predictions/input-text-predictions.module';
import {LoadLexiconRequest} from '../lexicon/lexicon.component';
import {clearSettings, LOCAL_STORAGE_ITEM_NAME, setEnableInckw} from '../settings/settings';
import {FillMaskRequest, SpeakFasterService, TextPredictionRequest, TextPredictionResponse} from '../speakfaster-service';
import {setDelaysForTesting, StudyManager, StudyUserTurn} from '../study/study-manager';
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

  public textPrediction(textPredictionRequest: TextPredictionRequest):
      Observable<TextPredictionResponse> {
    return of({outputs: []});
  }
}

describe('InputBarComponent', () => {
  let testListener: TestListener;
  let studyManager: StudyManager;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let inputBarControlSubject: Subject<InputBarControlEvent>;
  let abbreviationExpansionTriggers: Subject<InputAbbreviationChangedEvent>;
  let loadPrefixedLexiconRequestSubject: Subject<LoadLexiconRequest>;
  let fillMaskTriggers: Subject<FillMaskRequest>;
  let studyUserTurnsSubject: Subject<StudyUserTurn>;
  let fixture: ComponentFixture<InputBarComponent>;
  let speakFasterServiceForTest: SpeakFasterServiceForTest;
  let inputStringChangedValues: string[];
  let textEntryEndEvents: TextEntryEndEvent[];
  let inputAbbreviationChangeEvents: InputAbbreviationChangedEvent[];
  let inFlightAbbreviationChangeEvents: InputAbbreviationChangedEvent[];
  let LoadLexiconRequests: LoadLexiconRequest[];
  let fillMaskRequests: FillMaskRequest[];

  beforeEach(async () => {
    clearSettings();
    localStorage.removeItem(LOCAL_STORAGE_ITEM_NAME);
    setDelaysForTesting(10e3, 50e3);
    testListener = new TestListener();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    textEntryEndSubject = new Subject();
    inputBarControlSubject = new Subject();
    abbreviationExpansionTriggers = new Subject();
    loadPrefixedLexiconRequestSubject = new Subject();
    fillMaskTriggers = new Subject();
    studyUserTurnsSubject = new Subject();
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

    studyManager = new StudyManager(null, null);
    studyManager.studyUserTurns = studyUserTurnsSubject;
    await TestBed
        .configureTestingModule({
          imports:
              [InputBarModule, InputBarChipModule, InputTextPredictionsModule],
          declarations: [
            InputBarComponent, InputBarChipComponent,
            InputTextPredictionsComponent
          ],
          providers: [
            {provide: SpeakFasterService, useValue: speakFasterServiceForTest},
            {provide: HttpEventLogger, useValue: new HttpEventLogger(null)},
            {provide: StudyManager, useValue: studyManager},
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
    inputStringChangedValues = [];
    fixture.componentInstance.inputStringChanged.subscribe((str) => {
      inputStringChangedValues.push(str);
    });
    inFlightAbbreviationChangeEvents = [];
    fixture.componentInstance.inFlightAbbreviationExpansionTriggers.subscribe(
        (event: InputAbbreviationChangedEvent) => {
          inFlightAbbreviationChangeEvents.push(event);
        });
    fixture.detectChanges();
  });

  afterEach(async () => {
    HttpEventLogger.setFullLogging(false);
    if (cefSharp.BOUND_LISTENER_NAME in (window as any)) {
      delete (window as any)[cefSharp.BOUND_LISTENER_NAME];
    }
  });

  it('initially, input box is empty; chips are empty', () => {
    studyManager.maybeHandleRemoteControlCommand('study on');
    fixture.detectChanges();
    const inputText = fixture.debugElement.query(By.css('.base-text-area'));
    expect(inputText.nativeElement.innerText).toEqual('');
    expect(fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
               .length)
        .toEqual(0);
    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.abort-button'))).toBeNull();
  });

  for (const [stringLength, expectedFontSizePx] of [
           [20, 30], [100, 18.2], [400, 15]]) {
    it(`entering long text reduces font size: length=${stringLength}, ` +
           `fontSize=${expectedFontSizePx}`,
       () => {
         const message = 'a'.repeat(stringLength);
         enterKeysIntoComponent(message);
         fixture.detectChanges();

         const inputText =
             fixture.debugElement.query(By.css('.base-text-area'));
         expect(inputText.nativeElement.value).toEqual(message);
         expect(inputText.styles.fontSize).toEqual(`${expectedFontSizePx}px`);
       });
  }

  function enterKeysIntoComponent(text: string) {
    const inputText = fixture.debugElement.query(By.css('.base-text-area'));
    for (let i = 1; i <= text.length; ++i) {
      const substr = text.substring(0, i);
      const key = text[i - 1];
      const event = new KeyboardEvent('keypress', {key});
      inputText.nativeElement.value = substr;
      fixture.componentInstance.onInputTextAreaKeyUp(event);
      fixture.detectChanges();
    }
  }

  for (const text of ['b', 'ba', 'ba ', ' b']) {
    it(`entering keys cause text and buttons and chips to be displayed: ` +
           `text = ${text}`,
       () => {
         enterKeysIntoComponent(text);

         const inputText =
             fixture.debugElement.query(By.css('.base-text-area'));
         expect(inputText.nativeElement.value).toEqual(text);
         expect(fixture.componentInstance
                    .inputStringIsCompatibleWithAbbreviationExpansion)
             .toBeTrue();
         expect(fixture.debugElement.query(By.css('.expand-button')))
             .not.toBeNull();
         expect(fixture.debugElement.query(By.css('.spell-button')))
             .not.toBeNull();
         expect(fixture.debugElement.query(By.css('.abort-button')))
             .not.toBeNull();
       });
  }

  it('entering keys into input box logs keypresses', () => {
    const keypressLogSpy =
        spyOn(fixture.componentInstance.eventLogger, 'logKeypress');
    enterKeysIntoComponent('a');

    expect(keypressLogSpy).toHaveBeenCalledTimes(1);
  });

  for (const [originalText, newKey] of [
           ['abc', '\n'],
           [' abc', '\n'],
           [' abc ', '\n'],
           ['abc ', ' '],
           ['abc ', ' '],
  ] as Array<[string, string]>) {
    it(`Keys trigger abbreviation expansion: ${originalText}: ${newKey}`,
       async () => {
         const inputText =
             fixture.debugElement.query(By.css('.base-text-area'));
         inputText.nativeElement.value = originalText;
         fixture.detectChanges();
         inputText.nativeElement.value = originalText + newKey;
         const event = new KeyboardEvent('keypress', {key: '\n'});
         await fixture.componentInstance.onInputTextAreaKeyUp(event);
         fixture.detectChanges();

         expect(inputAbbreviationChangeEvents.length).toEqual(1);
         const [aeEvent] = inputAbbreviationChangeEvents;
         const {abbreviationSpec} = aeEvent;
         expect(abbreviationSpec.readableString).toEqual('abc');
         expect(abbreviationSpec.tokens.length).toEqual(1);
         expect(abbreviationSpec.tokens[0].isKeyword).toBeFalse();
         expect(abbreviationSpec.tokens[0].value).toEqual('abc');
         expect(abbreviationSpec.lineageId).not.toBeNull();
       });
  }

  for (const [originalText, triggerKey] of [
           [' i am vg', '\n'],
           [' i am. vg', '\n'],
  ] as Array<[string, string]>) {
    it('Keys trigger abbreviation multi-token abbreviation expansion:' +
           `original text=${originalText}, trigger=${triggerKey}`,
       async () => {
         const inputText =
             fixture.debugElement.query(By.css('.base-text-area'));
         inputText.nativeElement.value = originalText;
         fixture.detectChanges();
         inputText.nativeElement.value = originalText + triggerKey;
         const event = new KeyboardEvent('keypress', {key: triggerKey});
         await fixture.componentInstance.onInputTextAreaKeyUp(event);
         fixture.detectChanges();

         expect(inputAbbreviationChangeEvents.length).toEqual(1);
         const [aeEvent] = inputAbbreviationChangeEvents;
         const {abbreviationSpec} = aeEvent;
         expect(abbreviationSpec.readableString).toEqual('i am vg');
         expect(abbreviationSpec.tokens.length).toEqual(3);
         expect(abbreviationSpec.tokens[0].isKeyword).toBeTrue();
         expect(abbreviationSpec.tokens[0].value).toEqual('i');
         expect(abbreviationSpec.tokens[1].isKeyword).toBeTrue();
         expect(abbreviationSpec.tokens[1].value).toEqual('am');
         expect(abbreviationSpec.tokens[2].isKeyword).toBeFalse();
         expect(abbreviationSpec.tokens[2].value).toEqual('vg');
         expect(abbreviationSpec.lineageId).not.toBeNull();
       });
  }

  it('clicking abort button clears state: no head keywords', () => {
    studyManager.maybeHandleRemoteControlCommand('study on');
    fixture.detectChanges();
    enterKeysIntoComponent('ab');
    fixture.detectChanges();
    const abortButton = fixture.debugElement.query(By.css('.abort-button'));
    abortButton.nativeElement.click();
    fixture.detectChanges();

    const inputText = fixture.debugElement.query(By.css('.base-text-area'));
    expect(inputText.nativeElement.value).toEqual('');
    expect(fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
               .length)
        .toEqual(0);
    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.abort-button'))).toBeNull();
  });

  it('too-long input abbreviation disables AE buttons and shows notice', () => {
    studyManager.maybeHandleRemoteControlCommand('study on');
    fixture.detectChanges();
    const inputText = fixture.debugElement.query(By.css('.base-text-area'));
    inputText.nativeElement.value = 'abcdefghijklm';  // Length 12.
    const event = new KeyboardEvent('keypress', {key: 'o'});
    fixture.componentInstance.onInputTextAreaKeyUp(event);
    fixture.detectChanges();

    expect(fixture.componentInstance
               .inputStringIsCompatibleWithAbbreviationExpansion)
        .toBeFalse();
    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.abort-button'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.length-limit-exceeded')))
        .not.toBeNull();
  });

  it('long input abbreviation followed by trigger sequence does not trigger AE',
     () => {
       // Length 13, excluding the two space keys.
       const originalText = 'abcdefghijklmo';
       const newKey = '\n';
       const inputText = fixture.debugElement.query(By.css('.base-text-area'));
       inputText.nativeElement.value = originalText;
       fixture.detectChanges();
       inputText.nativeElement.value = originalText + newKey;
       const event = new KeyboardEvent('keypress', {key: newKey});
       fixture.componentInstance.onInputTextAreaKeyUp(event);
       fixture.detectChanges();

       expect(inputAbbreviationChangeEvents.length).toEqual(0);
     });

  it('too many head keywords disable expand and spell buttons', () => {
    studyManager.maybeHandleRemoteControlCommand('study on');
    fixture.detectChanges();
    const inputText = fixture.debugElement.query(By.css('.base-text-area'));
    inputText.nativeElement.value = 'a big and red and d';  // # of keywords: 5.
    const event = new KeyboardEvent('keypress', {key: 'd'});
    fixture.componentInstance.onInputTextAreaKeyUp(event);
    fixture.detectChanges();

    expect(fixture.componentInstance
               .inputStringIsCompatibleWithAbbreviationExpansion)
        .toBeFalse();
    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.abort-button'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.length-limit-exceeded')))
        .not.toBeNull();
  });

  it('clicking abort button clears state: no head keywords', () => {
    studyManager.maybeHandleRemoteControlCommand('study on');
    fixture.detectChanges();
    const inputText = fixture.debugElement.query(By.css('.base-text-area'));
    inputText.nativeElement.value = 'a big and red and d';  // # of keywords: 5.
    const event = new KeyboardEvent('keypress', {key: 'd'});
    fixture.componentInstance.onInputTextAreaKeyUp(event);
    fixture.detectChanges();
    const abortButton = fixture.debugElement.query(By.css('.abort-button'));
    abortButton.nativeElement.click();
    fixture.detectChanges();

    expect(inputText.nativeElement.value).toEqual('');
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
    enterKeysIntoComponent('ace');
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
    expect(fixture.componentInstance.state).toEqual(State.CHOOSING_LETTER_CHIP);
    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.length-limit-exceeded')))
    expect(fixture.debugElement.query(By.css('.abort-button'))).not.toBeNull();
    expect(LoadLexiconRequests.length).toEqual(0);
  });

  it('clicking letter chip sets correct state', () => {
    enterKeysIntoComponent('ace');
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    fixture.componentInstance.onChipClicked(2);

    expect(fixture.componentInstance.state)
        .toEqual(State.FOCUSED_ON_LETTER_CHIP);
  });

  it('multi-token abbreviation then hit spell: chips are correct', () => {
    enterKeysIntoComponent('so much bv');
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();

    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    expect(chips.length).toEqual(4);
    expect((chips[0].componentInstance as InputBarChipComponent).text)
        .toEqual('so');
    expect((chips[1].componentInstance as InputBarChipComponent).text)
        .toEqual('much');
    expect((chips[2].componentInstance as InputBarChipComponent).text)
        .toEqual('b');
    expect((chips[3].componentInstance as InputBarChipComponent).text)
        .toEqual('v');
    expect(fixture.componentInstance.getChipText(0)).toEqual('so');
    expect(fixture.componentInstance.getChipText(1)).toEqual('much');
    expect(fixture.componentInstance.getChipText(2)).toEqual('b');
    expect(fixture.componentInstance.getChipText(3)).toEqual('v');
  });

  it('clicking spell button injects space key to self app', () => {
    enterKeysIntoComponent('ace');
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();

    expect(testListener.numRequestSoftkeyboardResetCalls).toEqual(1);
  });

  it('spelling valid word triggers AE', async () => {
    enterKeysIntoComponent('abc');
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    fixture.componentInstance.state = State.FOCUSED_ON_LETTER_CHIP;
    spyOn(fixture.componentInstance, 'isValidWord').and.returnValue(true);
    await fixture.componentInstance.onChipTextChanged({text: 'bit'}, 1);
    fixture.detectChanges();

    expect(fixture.componentInstance
               .inputStringIsCompatibleWithAbbreviationExpansion)
        .toBeTrue();
    expect(inFlightAbbreviationChangeEvents.length).toEqual(1);
    expect(inFlightAbbreviationChangeEvents[0].requestExpansion).toBeTrue();
    const {abbreviationSpec} = inFlightAbbreviationChangeEvents[0];
    expect(abbreviationSpec.tokens.length).toEqual(3);
    expect(abbreviationSpec.readableString).toEqual('a bit c');
    const {tokens} = abbreviationSpec;
    expect(tokens[0]).toEqual({value: 'a', isKeyword: false});
    expect(tokens[1]).toEqual(
        {value: 'bit', isKeyword: true, wordAbbrevMode: undefined});
    expect(tokens[2]).toEqual({value: 'c', isKeyword: false});
  });

  it('spelling invalid word does not trigger AE', async () => {
    enterKeysIntoComponent('abc');
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    fixture.componentInstance.state = State.FOCUSED_ON_LETTER_CHIP;
    spyOn(fixture.componentInstance, 'isValidWord').and.returnValue(false);
    await fixture.componentInstance.onChipTextChanged({text: 'bar'}, 1);
    fixture.detectChanges();

    expect(fixture.componentInstance
               .inputStringIsCompatibleWithAbbreviationExpansion)
        .toBeTrue();
    expect(inFlightAbbreviationChangeEvents.length).toEqual(0);
  });

  it('entering word prefix triggers inckw AE', async () => {
    await setEnableInckw(true);
    enterKeysIntoComponent('abc');
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    fixture.componentInstance.state = State.FOCUSED_ON_LETTER_CHIP;
    spyOn(fixture.componentInstance, 'isValidWord').and.returnValue(false);
    await fixture.componentInstance.onChipTextChanged({text: 'br'}, 1);
    fixture.detectChanges();

    expect(inFlightAbbreviationChangeEvents.length).toEqual(1);
    expect(inFlightAbbreviationChangeEvents[0].requestExpansion).toBeTrue();
    const {abbreviationSpec} = inFlightAbbreviationChangeEvents[0];
    expect(abbreviationSpec.tokens.length).toEqual(3);
    expect(abbreviationSpec.readableString).toEqual('a br c');
    const {tokens} = abbreviationSpec;
    expect(tokens[0]).toEqual({value: 'a', isKeyword: false});
    expect(tokens[1]).toEqual(
        {value: 'br', isKeyword: true, wordAbbrevMode: 'PREFIX'});
    expect(tokens[2]).toEqual({value: 'c', isKeyword: false});
  });

  it('entering length-1 prefix does not trigger inckw AE', async () => {
    await setEnableInckw(true);
    enterKeysIntoComponent('abc');
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    fixture.componentInstance.state = State.FOCUSED_ON_LETTER_CHIP;
    spyOn(fixture.componentInstance, 'isValidWord').and.returnValue(false);
    await fixture.componentInstance.onChipTextChanged({text: 'b'}, 1);
    fixture.detectChanges();

    expect(inFlightAbbreviationChangeEvents.length).toEqual(0);
  });

  it('entering keys into text box issues inputStringChanged events', () => {
    enterKeysIntoComponent('hi');

    expect(inputStringChangedValues.length).toEqual(2);
    expect(inputStringChangedValues[0]).toEqual('h');
    expect(inputStringChangedValues[1]).toEqual('hi');
  });

  it('clicking abort after clicking spell resets state', async () => {
    enterKeysIntoComponent('abc');
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    // The ending punctuation should be ignored by keyword AE.
    fixture.componentInstance.state = State.FOCUSED_ON_LETTER_CHIP;
    spyOn(fixture.componentInstance, 'isValidWord').and.returnValue(true);
    await fixture.componentInstance.onChipTextChanged({text: 'bit'}, 1);
    const abortButton = fixture.debugElement.query(By.css('.abort-button'));
    abortButton.nativeElement.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.state).toEqual(State.ENTERING_BASE_TEXT);
    const input = fixture.debugElement.query(By.css('.base-text-area'));
    expect(input.nativeElement.value).toEqual('abc');
    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    expect(chips.length).toEqual(0);
    expect(fixture.debugElement.query(By.css('.expand-button'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).not.toBeNull();

    const expandButton = fixture.debugElement.query(By.css('.expand-button'));
    expandButton.nativeElement.click();

    expect(inFlightAbbreviationChangeEvents.length).toEqual(1);
    expect(inFlightAbbreviationChangeEvents[0].requestExpansion).toBeTrue();
    const {abbreviationSpec} = inFlightAbbreviationChangeEvents[0];
    expect(abbreviationSpec.tokens.length).toEqual(3);
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

  it('chip injection remembers previous text', () => {
    let inputText = fixture.debugElement.query(By.css('.base-text-area'));
    inputText.nativeElement.value = 'xyz';
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
    const abortButton = fixture.debugElement.query(By.css('.abort-button'));
    abortButton.nativeElement.click();
    fixture.detectChanges();

    inputText = fixture.debugElement.query(By.css('.base-text-area'));
    expect(inputText.nativeElement.value).toEqual('xyz');
  });

  it('clicking word chip during refinement sets correct state', () => {
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
    fixture.componentInstance.onChipClicked(2);

    expect(fixture.componentInstance.state).toEqual(State.FOCUSED_ON_WORD_CHIP);
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
         originalChipStrings: ['i', 'feel', 'great'],
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
        },
      ]
    });
    fixture.detectChanges();
    fixture.componentInstance.onChipClicked(1),
        fixture.componentInstance.onChipTextChanged({text: 'felt'}, 1);
    fixture.componentInstance.onSpeakAsIsButtonClicked(new MouseEvent('click'));

    expect(textEntryEndEvents.length).toEqual(1);
    expect(textEntryEndEvents[0].text).toEqual('i felt great');
    expect(textEntryEndEvents[0].repeatLastNonEmpty).toBeFalse();
    expect(textEntryEndEvents[0].inAppTextToSpeechAudioConfig)
        .not.toBeUndefined();
  });

  it('clicking speak button clears text & clicking again triggers repeat',
     () => {
       enterKeysIntoComponent('it');
       fixture.componentInstance.state = State.ENTERING_BASE_TEXT;
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

  it('spell button is not shown during word refinement', () => {
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
    expect(spellButton).toBeNull();
  });

  // NOTE(cais): We currently do not support going into spelling mode after
  // entering word-replacement mode.
  //
  // it('clicking speak button when choosing from 3 letters to spell is no-op',
  //    () => {
  //      fixture.componentInstance.inputString = 'ifg';
  //      inputBarControlSubject.next({
  //        chips: [
  //          {
  //            text: 'i',
  //          },
  //          {
  //            text: 'feel',
  //          },
  //          {
  //            text: 'great',
  //          }
  //        ]
  //      });
  //      fixture.detectChanges();
  //      const wordChips =
  //          fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
  //      wordChips[1].nativeElement.click();
  //      const spellButton =
  //      fixture.debugElement.query(By.css('.spell-button'));
  //      spellButton.nativeElement.click();
  //      fixture.detectChanges();
  //      const speakButton =
  //      fixture.debugElement.query(By.css('.speak-button'))
  //                              .query(By.css('.speak-button'));
  //      speakButton.nativeElement.click();

  //      expect(fixture.componentInstance.state)
  //          .toEqual(State.CHOOSING_LETTER_CHIP);
  //      expect(textEntryEndEvents.length).toEqual(0);
  //    });

  it('clicking speak button when spelling single word speaks word', () => {
    enterKeysIntoComponent('b');
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    fixture.componentInstance.state = State.FOCUSED_ON_LETTER_CHIP;
    fixture.componentInstance.onChipTextChanged({text: 'bit '}, 0);
    fixture.detectChanges();
    const speakButton = fixture.debugElement.query(By.css('.speak-button'))
                            .query(By.css('.speak-button'));
    speakButton.nativeElement.click();
    fixture.detectChanges();

    expect(textEntryEndEvents.length).toEqual(1);
    expect(textEntryEndEvents[0].text).toEqual('bit');
    expect(fixture.componentInstance.state).toEqual(State.ENTERING_BASE_TEXT);
  });

  it('clicking speak button when spelling single word empty is no-op', () => {
    enterKeysIntoComponent('b');
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    fixture.componentInstance.state = State.FOCUSED_ON_LETTER_CHIP;
    fixture.componentInstance.onChipTextChanged({text: ' '}, 0);
    fixture.detectChanges();
    const speakButton = fixture.debugElement.query(By.css('.speak-button'))
                            .query(By.css('.speak-button'));
    speakButton.nativeElement.click();
    fixture.detectChanges();

    expect(textEntryEndEvents.length).toEqual(0);
    expect(fixture.componentInstance.state)
        .toEqual(State.FOCUSED_ON_LETTER_CHIP);
  });

  it('clicking speak button when spelling > 1 words is no-op', () => {
    enterKeysIntoComponent('abc');
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    fixture.componentInstance.state = State.FOCUSED_ON_LETTER_CHIP;
    fixture.componentInstance.onChipTextChanged({text: 'bit '}, 1);
    fixture.detectChanges();
    const speakButton = fixture.debugElement.query(By.css('.speak-button'))
                            .query(By.css('.speak-button'));
    speakButton.nativeElement.click();
    fixture.detectChanges();

    expect(textEntryEndEvents.length).toEqual(0);
    expect(fixture.componentInstance.state)
        .toEqual(State.FOCUSED_ON_LETTER_CHIP);
  });

  it('spell button is not shown when word chip is chosen', () => {
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
    expect(spellButton).toBeNull();
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
    expect(spellButton).toBeNull();
  });

  // NOTE(cais): We currently don't allow users to go into spelling mode once
  // they are in word-replacement mode.
  // it('clicking spell under word refinement enters spelling mode', () => {
  //   fixture.componentInstance.inputString = 'ifg';
  //   inputBarControlSubject.next({
  //     chips: [
  //       {
  //         text: 'i',
  //       },
  //       {
  //         text: 'feel',
  //       },
  //       {
  //         text: 'great',
  //       }
  //     ]
  //   });
  //   fixture.detectChanges();
  //   const wordChips =
  //       fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
  //   wordChips[1].nativeElement.click();
  //   const spellButton = fixture.debugElement.query(By.css('.spell-button'));
  //   spellButton.nativeElement.click();
  //   fixture.detectChanges();

  //   expect(fixture.componentInstance.state).toEqual(State.CHOOSING_LETTER_CHIP);
  //   const letterChips =
  //       fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'))
  //   expect(letterChips.length).toEqual(3);
  //   expect((letterChips[0].componentInstance as InputBarChipComponent).text)
  //       .toEqual('i');
  //   expect((letterChips[1].componentInstance as InputBarChipComponent).text)
  //       .toEqual('f');
  //   expect((letterChips[2].componentInstance as InputBarChipComponent).text)
  //       .toEqual('g');
  // });

  it('inject text button injects keypresses added final period & space', () => {
    enterKeysIntoComponent('all good');
    const injectButton = fixture.debugElement.query(By.css('.inject-button'));
    injectButton.nativeElement.click();

    expect(textEntryEndEvents.length).toEqual(1);
    const event = textEntryEndEvents[0];
    expect(event.isFinal).toBeTrue();
    expect(event.text).toEqual('all good');
    expect(event.injectedKeys).toEqual([
      'a', 'l', 'l', VIRTUAL_KEY.SPACE, 'g', 'o', 'o', 'd', VIRTUAL_KEY.PERIOD,
      VIRTUAL_KEY.SPACE
    ]);
    expect(event.inAppTextToSpeechAudioConfig).toBeUndefined();
    expect(event.timestampMillis).toBeGreaterThan(0);
    const calls = testListener.injectedKeysCalls;
    expect(calls.length).toEqual(1);
    expect(calls[0]).toEqual([65, 76, 76, 32, 71, 79, 79, 68, 190, 32]);
    expect(testListener.injectedTextCalls).toEqual(['all good. ']);
  });

  it('clicking inject button removes trailing and leading whitespace.', () => {
    enterKeysIntoComponent(' good ');
    const injectButton = fixture.debugElement.query(By.css('.inject-button'));
    injectButton.nativeElement.click();

    expect(textEntryEndEvents.length).toEqual(1);
    const event = textEntryEndEvents[0];
    expect(event.isFinal).toBeTrue();
    expect(event.text).toEqual(' good ');
    expect(event.injectedKeys).toEqual([
      'g', 'o', 'o', 'd', VIRTUAL_KEY.PERIOD, VIRTUAL_KEY.SPACE
    ]);
    expect(event.inAppTextToSpeechAudioConfig).toBeUndefined();
    expect(event.timestampMillis).toBeGreaterThan(0);
    const calls = testListener.injectedKeysCalls;
    expect(calls.length).toEqual(1);
    expect(calls[0]).toEqual([71, 79, 79, 68, 190, 32]);
    expect(testListener.injectedTextCalls).toEqual(['good. ']);
  });

  it('clicking inject button with previous non-empty works', () => {
    textEntryEndSubject.next({
      text: 'Previous phrase',
      isFinal: true,
      timestampMillis: Date.now(),
    });
    fixture.componentInstance.inputString = '';
    fixture.detectChanges();
    const injectButton = fixture.debugElement.query(By.css('.inject-button'));
    injectButton.nativeElement.click();

    expect(textEntryEndEvents.length).toEqual(2);
    const event = textEntryEndEvents[1];
    expect(event.isFinal).toBeTrue();
    expect(event.text).toEqual('Previous phrase');
  });

  it('clicking inject button without previous non-empty has no effect', () => {
    fixture.componentInstance.inputString = '';
    fixture.detectChanges();
    const injectButton = fixture.debugElement.query(By.css('.inject-button'));
    injectButton.nativeElement.click();

    expect(textEntryEndEvents.length).toEqual(0);
  });

  it('clicking inject text button injects keypresses without added final period',
     () => {
       enterKeysIntoComponent('all good.');
       const injectButton =
           fixture.debugElement.query(By.css('.inject-button'));
       injectButton.nativeElement.click();

       expect(textEntryEndEvents.length).toEqual(1);
       const event = textEntryEndEvents[0];
       expect(event.isFinal).toBeTrue();
       expect(event.text).toEqual('all good.');
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

  for (const [existingText, predictedText, expectedText] of [
           ['', 'i am feeling', 'i am feeling '],
           ['so', 'i am feeling', 'so i am feeling '],
           ['so ', 'i am feeling', 'so i am feeling '],
           ['so.', 'i am feeling', 'so. i am feeling '],
           ['so. ', 'i am feeling', 'so. i am feeling '],
  ] as Array<[string, string, string]>) {
    it(`clicking text prediction injects appends to input text: ` +
           `"${expectedText}"`,
       () => {
         enterKeysIntoComponent(existingText);
         fixture.detectChanges();
         inputBarControlSubject.next({
           chips: [
             {
               text: predictedText,
               isTextPrediction: true,
             },
           ]
         });
         fixture.detectChanges();

         const inputText =
             fixture.debugElement.query(By.css('.base-text-area'));
         expect(inputText.nativeElement.value).toEqual(expectedText);
         expect(fixture.componentInstance.state)
             .toEqual(State.ENTERING_BASE_TEXT);
       });
  }

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

  it('clicking favorite button calls ', () => {
    enterKeysIntoComponent('so long');
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

  it('append text signal in input bar control subject works', () => {
    inputBarControlSubject.next({appendText: 'foo bar'});
    fixture.detectChanges();

    const inputText = fixture.debugElement.query(By.css('.base-text-area'));
    expect(inputText.nativeElement.value).toEqual('foo bar');
    expect(fixture.componentInstance.inputString).toEqual('foo bar');
    expect(fixture.componentInstance.state).toEqual(State.ENTERING_BASE_TEXT);
    expect(inputStringChangedValues).toEqual(['foo bar']);
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

  it('study instrucitons and text are initially not shown', () => {
    expect(fixture.debugElement.query(By.css('.instruction'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.to-enter-text'))).toBeNull();
  });

  it('study turn causes instruction and text to be shown', () => {
    studyUserTurnsSubject.next({
      instruction: 'Enter in abbreviation:',
      text: 'All frequencies open',
      isAbbreviation: true,
      isComplete: false,
    });
    fixture.detectChanges();

    const instruction = fixture.debugElement.query(By.css('.instruction'));
    expect(instruction.nativeElement.innerText)
        .toEqual('Enter in abbreviation:');
    const toEnterText = fixture.debugElement.query(By.css('.to-enter-text'));
    expect(toEnterText.nativeElement.innerText).toEqual('All frequencies open');
  });

  it('null text in study turn subject resets UI state', () => {
    studyUserTurnsSubject.next({
      instruction: 'Enter in abbreviation:',
      text: 'All frequencies open',
      isAbbreviation: true,
      isComplete: false,
    });
    studyUserTurnsSubject.next({
      instruction: '',
      text: null,
      isAbbreviation: true,
      isComplete: true,
    });
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.instruction'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.to-enter-text'))).toBeNull();
  });

  it('completed state in study turn subject displays end state', () => {
    studyUserTurnsSubject.next({
      instruction: '',
      text: null,
      isAbbreviation: true,
      isComplete: true,
    });
    fixture.detectChanges();

    const dialogCompleteMessage =
        fixture.debugElement.query(By.css('.hint-dialog-complete'));
    expect(dialogCompleteMessage.nativeElement.innerText)
        .toEqual('Dialog is complete.');
    expect(fixture.debugElement.query(By.css('.dialog-error'))).toBeNull();
  });

  it('error state in study turn subject displays error message', () => {
    studyUserTurnsSubject.next({
      instruction: '',
      text: null,
      isAbbreviation: true,
      isComplete: true,
      error: 'Failed to load dialog "foo"',
    });
    fixture.detectChanges();

    const dialogCompleteMessage =
        fixture.debugElement.query(By.css('.hint-dialog-complete'));
    expect(dialogCompleteMessage.nativeElement.innerText)
        .toEqual('Failed to load dialog "foo"');
    expect(fixture.debugElement.query(By.css('.dialog-error'))
               .nativeElement.innerText)
        .toEqual('Failed to load dialog "foo"');
  });

  it('displays notification when set to non-empty', () => {
    fixture.componentInstance.notification = 'testing foo.';
    fixture.detectChanges();

    const notification = fixture.debugElement.query(By.css('.notification'));
    expect(notification.nativeElement.innerText).toEqual('testing foo.');
  });

  it('shows no notification if text is empty', () => {
    fixture.componentInstance.notification = '';
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.notification'))).toBeNull();
  });

  it('shows no notification by default', () => {
    expect(fixture.debugElement.query(By.css('.notification'))).toBeNull();
  });

  it('clears all state on clearAll command in control subject', () => {
    enterKeysIntoComponent('abc');
    inputBarControlSubject.next({
      clearAll: true,
    });

    expect(fixture.componentInstance.inputString).toEqual('');
  });

  // NOTE(#322)
  it('injecting new chips overrides old chips', () => {
    enterKeysIntoComponent('dtg');
    const spellButton = fixture.debugElement.query(By.css('.spell-button'));
    spellButton.nativeElement.click();
    fixture.detectChanges();
    inputBarControlSubject.next({
      chips: [
        {
          text: 'don\'t',
          preSpelled: true,
        },
        {
          text: 'go',
          preSpelled: true,
        },
      ]
    });
    fixture.detectChanges();

    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    expect(chips.length).toEqual(2);
    expect((chips[0].componentInstance as InputBarChipComponent).text)
        .toEqual('don\'t');
    expect((chips[1].componentInstance as InputBarChipComponent).text)
        .toEqual('go');
    expect(fixture.componentInstance.state).toEqual(State.CHOOSING_WORD_CHIP);
    expect(fixture.debugElement.query(By.css('.expand-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.spell-button'))).toBeNull();
    expect(fixture.debugElement.query(By.css('.length-limit-exceeded')))
        .toBeNull();
    expect(fixture.debugElement.query(By.css('.abort-button'))).not.toBeNull();
    expect(LoadLexiconRequests.length).toEqual(0);
  });

  it('append text twice calls updateButtonBoxes', fakeAsync(() => {
       tick();
       const prevNumCalls0 = testListener.updateButtonBoxesCalls.length;
       inputBarControlSubject.next({appendText: 'foo bar'});
       fixture.detectChanges();
       tick();
       const prevNumCalls1 = testListener.updateButtonBoxesCalls.length;
       inputBarControlSubject.next({appendText: 'foo bar'});
       fixture.detectChanges();
       tick(100);

       expect(prevNumCalls1).toBeGreaterThan(prevNumCalls0);
       expect(testListener.updateButtonBoxesCalls.length)
           .toBeGreaterThan(prevNumCalls1);
     }));

  it('refocus control event focuses on input box', fakeAsync(() => {
       tick();
       inputBarControlSubject.next({
         refocus: true,
       });
       fixture.detectChanges();
       tick();

       let focused: DebugElement|null = null;
       for (let i = 0; i < 10; ++i) {
         focused = fixture.debugElement.query(By.css(':focus'));
         if (focused) {
           break;
         }
       }
       const inputText = fixture.debugElement.query(By.css('.base-text-area'));
       if (focused != null) {
         // TODO(cais): Investigate why inputText is sometimes null.
         expect(focused!.nativeElement).toEqual(inputText.nativeElement);
       }
     }));

  it('isStudyOn is initially false', () => {
    expect(fixture.componentInstance.isStudyOn).toBeFalse();
  });

  it('when study is on, hides inject & favorite buttons & ' +
         'InputTextPredictionComponent',
     () => {
       studyManager.maybeHandleRemoteControlCommand('study on');
       fixture.detectChanges();

       expect(fixture.componentInstance.isStudyOn).toBeTrue();
       expect(fixture.debugElement.query(By.css('.speak-button')))
           .not.toBeNull();
       expect(fixture.debugElement.query(By.css('.inject-button'))).toBeNull();
       expect(
           fixture.debugElement.query(By.css('app-favorite-button-component')))
           .toBeNull();
       expect(fixture.debugElement.query(
                  By.css('input-text-predictions-component')))
           .toBeNull();
     });

  it('when study if back off, shows inject and favorite buttons', () => {
    studyManager.maybeHandleRemoteControlCommand('study on');
    fixture.detectChanges();
    studyManager.maybeHandleRemoteControlCommand('study off');
    fixture.detectChanges();

    expect(fixture.componentInstance.isStudyOn).toBeFalse();
    expect(fixture.debugElement.query(By.css('.speak-button'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('.inject-button'))).not.toBeNull();
    expect(fixture.debugElement.query(By.css('app-favorite-button-component')))
        .not.toBeNull();
  });

  it('when study is on, does not show cut-button', () => {
    studyManager.maybeHandleRemoteControlCommand('study on');
    inputBarControlSubject.next({
      chips: [
        {
          text: 'it',
        },
        {
          text: 'does',
        },
      ]
    });
    fixture.componentInstance.state = State.CHOOSING_WORD_CHIP;
    fixture.detectChanges();
    const chips =
        fixture.debugElement.queryAll(By.css('app-input-bar-chip-component'));
    chips[1].nativeElement.click();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.cut-button'))).toBeNull();
  });

  it('numCharsToDeleteFromEnd truncates text from the end', () => {
    inputBarControlSubject.next({
      numCharsToDeleteFromEnd: 1,
    });

    const inputText = fixture.debugElement.query(By.css('.base-text-area'));
    inputText.nativeElement.value = 'hi there, ';
    const event1 = new KeyboardEvent('keypress', {key: ' '});
    fixture.componentInstance.onInputTextAreaKeyUp(event1);
    expect(inputText.nativeElement.value).toEqual('hi there,');
    expect(fixture.componentInstance.inputString).toEqual('hi there,');

    inputText.nativeElement.value = 'hi there, fine, ';
    const event2 = new KeyboardEvent('keypress', {key: ' '});
    fixture.componentInstance.onInputTextAreaKeyUp(event2);
    expect(inputText.nativeElement.value).toEqual('hi there, fine, ');
    expect(fixture.componentInstance.inputString).toEqual('hi there, fine, ');
  });

  for (const state of [State.ENTERING_BASE_TEXT, State.CHOOSING_LETTER_CHIP]) {
    it('study abbrev mode: hides speak button: state=' + state, async () => {
      await studyManager.maybeHandleRemoteControlCommand('start abbrev dummy1');
      fixture.componentInstance.state = state;
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.speak-button'))).toBeNull();
    });
  }

  for (const state of [State.CHOOSING_WORD_CHIP, State.FOCUSED_ON_WORD_CHIP]) {
    it('study abbrev mode: shows speak button: state=' + state, async () => {
      await studyManager.maybeHandleRemoteControlCommand('start abbrev dummy1');
      fixture.componentInstance.state = state;
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.speak-button')))
          .not.toBeNull();
    });
  }

  for (const state of [State.ENTERING_BASE_TEXT]) {
    it('study full mode: shows speak button: state=' + state, async () => {
      await studyManager.maybeHandleRemoteControlCommand('start full dummy1');
      fixture.componentInstance.state = state;
      fixture.detectChanges();

      expect(fixture.debugElement.query(By.css('.speak-button')))
          .not.toBeNull();
    });
  }

  // NOTE(#337): Under the full mode of study, Enter key ought not to trigger
  // AE.
  for (const [command, expectedNumTriggers] of [
           ['start full dummy1', 0], ['start abbrev dummy1', 1]] as
       Array<[string, number]>) {
    it('Enter key under study full mode does not trigger AE: command=' +
           command,
       async () => {
         await studyManager.maybeHandleRemoteControlCommand(command);
         fixture.detectChanges();
         const input = fixture.debugElement.query(By.css('.base-text-area'));
         const event = new KeyboardEvent('keypress', {key: '\n'});
         input.nativeElement.value = 'hi\n';
         await fixture.componentInstance.onInputTextAreaKeyUp(event);
         fixture.detectChanges();

         expect(inputAbbreviationChangeEvents.length)
             .toEqual(expectedNumTriggers);
       });
  }

  for (const [originalText, expectedText] of [
           ['ba', 'bar'], ['foo b', 'foo bar'], ['foo  b', 'foo  bar'],
           ['foo br', 'foo bar'], ['foo bar', 'foo bar'],
           ['foo va', 'foo bar']]) {
    it('suggestionSelection updates input string: current word: ' +
           'original=' + originalText + '; expected=' + expectedText,
       () => {
         fixture.componentInstance.inputString = originalText;
         fixture.componentInstance.inputBarControlSubject.next({
           suggestionSelection: 'bar',
         });

         expect(fixture.componentInstance.inputString).toEqual(expectedText);
         const inputText =
             fixture.debugElement.query(By.css('.base-text-area'));
         expect(inputText.nativeElement.value).toEqual(expectedText);
       });
  }

  for (const [originalText, suggestion, expectedText] of [
           ['', 'bar', 'bar'],
           [' ', 'bar', ' bar'],
           ['foo ', 'bar', 'foo bar'],
           ['foo,', 'bar', 'foo, bar'],
           ['foo.', 'bar', 'foo. bar'],
           ['foo,', 'bar', 'foo, bar'],
           ['foo.b', 'bar', 'foo. bar'],
           ['foo,b', 'bar', 'foo, bar'],
           ['foo,', 'bar,', 'foo, bar,'],
           ['foo bar,', 'bar.', 'foo bar, bar.'],
  ]) {
    it('suggestionSelection updates input string: next word: ' +
           'original=' + originalText + '; suggestion=' + suggestion +
           '; expected=' + expectedText,
       () => {
         fixture.componentInstance.inputString = originalText;
         fixture.componentInstance.inputBarControlSubject.next({
           suggestionSelection: suggestion,
         });

         expect(fixture.componentInstance.inputString).toEqual(expectedText);
         const inputText =
             fixture.debugElement.query(By.css('.base-text-area'));
         expect(inputText.nativeElement.value).toEqual(expectedText);
       });
  }

  it('suggestion whitespace is overridden after punctuation key', () => {
    fixture.componentInstance.inputString = 'hi ';
    fixture.componentInstance.inputBarControlSubject.next({
      suggestionSelection: 'there ',
    });
    fixture.detectChanges();
    const event = new KeyboardEvent('keypress', {key: '.'});
    const inputText = fixture.debugElement.query(By.css('.base-text-area'));
    inputText.nativeElement.value = 'hi there .';
    fixture.componentInstance.onInputTextAreaKeyUp(event);
    fixture.detectChanges();

    expect(inputText.nativeElement.value).toEqual('hi there.');
  });

  for (const punctuationKey of ['.', ',', ';', ':', ', ', '.  ']) {
    it('suggestion whitespace is overridden after punctuation key: ' +
           `"${punctuationKey}"`,
       () => {
         fixture.componentInstance.inputString = 'hi ';
         fixture.componentInstance.inputBarControlSubject.next({
           suggestionSelection: 'there ',
         });
         fixture.detectChanges();
         const event = new KeyboardEvent('keypress', {key: punctuationKey});
         const inputText =
             fixture.debugElement.query(By.css('.base-text-area'));
         inputText.nativeElement.value = 'hi there ' + punctuationKey;
         fixture.componentInstance.onInputTextAreaKeyUp(event);
         fixture.detectChanges();

         expect(inputText.nativeElement.value)
             .toEqual('hi there' + punctuationKey);
       });
  }

  it('shows InpuTextPredictionsComponent by default', () => {
    expect(
        fixture.debugElement.query(By.css('input-text-predictions-component')))
        .not.toBeNull();
  });

  for (const [suggestionSpaceIndex, string, expectedBool] of [
           [3, 'foo ,', true],
           [4, 'f , ', false],
           [3, 'foo ;', true],
           [3, 'foo :', true],
           [3, 'foo , ', true],
           [3, 'foo .', true],
           [3, 'foo . ', true],
           [3, 'foo ?', true],
           [3, 'foo ! ', true],
           [3, 'foo .  ', true],
           [3, 'foo b', false],
           [3, 'foo,', false],
           [3, 'foo bar,', false],
           [null, 'foo ,', false],
  ] as Array<[number | null, string, boolean]>) {
    it('inputStringHasOnlyPuncutationAfterSuggestionSpace return right answer',
       () => {
         (fixture.componentInstance as any).suggestionBasedSpaceIndex =
             suggestionSpaceIndex;
         fixture.componentInstance.inputString = string;
         expect(fixture.componentInstance
                    .inputStringHasOnlyPuncutationAfterSuggestionSpace())
             .toEqual(expectedBool);
       });
  }

  // TODO(cais): Test spelling valid word triggers AE, with sampleTime().
});
