/** Unit tests for the SpellComponent. */
import {HttpClientModule} from '@angular/common/http';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {of, Subject} from 'rxjs';

import * as cefSharp from '../../utils/cefsharp';
import {repeatVirtualKey, VIRTUAL_KEY} from '../external/external-events.component';
import {TestListener} from '../test-utils/test-cefsharp-listener';
import {AbbreviationSpec, AbbreviationToken, InputAbbreviationChangedEvent} from '../types/abbreviation';
import {TextEntryEndEvent} from '../types/text-entry';

import {SpellComponent, SpellingState} from './spell.component';
import {SpellModule} from './spell.module';

// TODO(cais): Removeo fdescribe. DO NOT SUBMIT.
fdescribe('SpellComponent', () => {
  let abbreviationExpansionTriggers: Subject<InputAbbreviationChangedEvent>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let fixture: ComponentFixture<SpellComponent>;
  let testListener: TestListener;
  let abbreviationChangeEvents: InputAbbreviationChangedEvent[];

  beforeEach(async () => {
    testListener = new TestListener();
    (window as any)[cefSharp.BOUND_LISTENER_NAME] = testListener;
    await TestBed
        .configureTestingModule({
          imports: [SpellModule, HttpClientModule],
          declarations: [SpellComponent],
        })
        .compileComponents();
    abbreviationExpansionTriggers = new Subject();
    abbreviationChangeEvents = [];
    abbreviationExpansionTriggers.subscribe(
        (event) => abbreviationChangeEvents.push(event));
    textEntryEndSubject = new Subject();
    fixture = TestBed.createComponent(SpellComponent);
  });

  function getAbbreviationSpecForTest(initialLetters: string[]):
      AbbreviationSpec {
    const tokens: AbbreviationToken[] = [];
    for (const letter of initialLetters) {
      tokens.push({
        value: letter,
        isKeyword: false,
      });
    }
    return {
      tokens,
      readableString: initialLetters.join(''),
      eraserSequence:
          repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, initialLetters.length + 2),
    };
  }

  it('initial state is CHOOSING_TOKEN', () => {
    expect(fixture.componentInstance.state)
        .toEqual(SpellingState.CHOOSING_TOKEN);
  });

  it('displays initial letters given original abbreviaton spec', () => {
    fixture.componentInstance.originalAbbreviationSpec =
        getAbbreviationSpecForTest(['a', 'b', 'c']);
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b'], 'abc  b');
    fixture.detectChanges();

    expect(fixture.componentInstance.state)
        .toEqual(SpellingState.SPELLING_TOKEN);
    const tokenButtons =
        fixture.debugElement.queryAll(By.css('.abbreviated-token'));
    // Spelling has started on 'b' (the 2nd letter). There should be buttons
    // for the two remaining letters ('a' and 'c').
    expect(tokenButtons.length).toEqual(2);
    expect(tokenButtons[0].nativeElement.innerText).toEqual('a');
    expect(tokenButtons[1].nativeElement.innerText).toEqual('c');
    const spellInputs = fixture.debugElement.queryAll(By.css('.spell-input'));
    expect(spellInputs.length).toEqual(1);
    expect(spellInputs[0].nativeElement.value).toEqual('b');
  });

  it('typing letters for spelled word populates spell input', () => {
    fixture.componentInstance.originalAbbreviationSpec =
        getAbbreviationSpecForTest(['a', 'b', 'c']);
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b'], 'abc  b');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b', 'i'], 'abc  bi');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b', 'i', 't'], 'abc  bit');
    fixture.detectChanges();

    const spellInput = fixture.debugElement.query(By.css('.spell-input'));
    expect(spellInput.nativeElement.value).toEqual('bit');
  });

  it('typing with Backspace for spelled word populates spell input', () => {
    fixture.componentInstance.originalAbbreviationSpec =
        getAbbreviationSpecForTest(['a', 'b', 'c']);
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b'], 'abc  b');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b', 'i'], 'abc  bi');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b', 'i', VIRTUAL_KEY.BACKSPACE], 'abc  b');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b', 'i', VIRTUAL_KEY.BACKSPACE, 'y'],
        'abc  by');
    fixture.detectChanges();

    const spellInput = fixture.debugElement.query(By.css('.spell-input'));
    expect(spellInput.nativeElement.value).toEqual('by');
  });

  for (const triggerKey of [' ', VIRTUAL_KEY.ENTER]) {
    it(`typing followed by space triggers new abbreviation ` +
           `expansion: trigger key = ${triggerKey}`,
       () => {
         const emittedAbbreviationSpecs: AbbreviationSpec[] = [];
         fixture.componentInstance.newAbbreviationSpec.subscribe(
             spec => emittedAbbreviationSpecs.push(spec));
         fixture.componentInstance.originalAbbreviationSpec =
             getAbbreviationSpecForTest(['a', 'b', 'c']);
         fixture.componentInstance.spellIndex = 1;
         fixture.componentInstance.ngOnInit();
         fixture.componentInstance.listenToKeypress(
             ['a', 'b', 'c', ' ', ' ', 'b'], 'abc  b');
         fixture.componentInstance.listenToKeypress(
             ['a', 'b', 'c', ' ', ' ', 'b', 'i'], 'abc  bi');
         fixture.componentInstance.listenToKeypress(
             ['a', 'b', 'c', ' ', ' ', 'b', 'i', 't'], 'abc  bit');
         const finalText =
             'abc  bit' + (triggerKey === VIRTUAL_KEY.ENTER ? '\n' : ' ');
         fixture.componentInstance.listenToKeypress(
             ['a', 'b', 'c', ' ', ' ', 'b', 'i', 't', triggerKey], finalText);
         fixture.detectChanges();

         expect(fixture.componentInstance.state).toEqual(SpellingState.DONE);
         expect(fixture.componentInstance.spelledWords).toEqual([
           null, 'bit', null
         ]);
         expect(emittedAbbreviationSpecs.length).toEqual(1);
         expect(emittedAbbreviationSpecs[0].tokens.length).toEqual(3);
         expect(emittedAbbreviationSpecs[0].tokens[0]).toEqual({
           value: 'a',
           isKeyword: false,
         });
         expect(emittedAbbreviationSpecs[0].tokens[1]).toEqual({
           value: 'bit',
           isKeyword: true,
         });
         expect(emittedAbbreviationSpecs[0].tokens[2]).toEqual({
           value: 'c',
           isKeyword: false,
         });
         expect(emittedAbbreviationSpecs[0].readableString).toEqual('a bit c');
         expect(emittedAbbreviationSpecs[0].eraserSequence)
             .toEqual(repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, 5 + 4));
         const tokenButtons =
             fixture.debugElement.queryAll(By.css('.abbreviated-token'));
         expect(tokenButtons.length).toEqual(3);
         expect(tokenButtons[0].nativeElement.innerText).toEqual('a');
         expect(tokenButtons[1].nativeElement.innerText).toEqual('bit');
         expect(tokenButtons[2].nativeElement.innerText).toEqual('c');
       });
  }

  it(`supports spelling 2nd word after spelling the first`, () => {
    const emittedAbbreviationSpecs: AbbreviationSpec[] = [];
    fixture.componentInstance.newAbbreviationSpec.subscribe(
        spec => emittedAbbreviationSpecs.push(spec));
    fixture.componentInstance.originalAbbreviationSpec =
        getAbbreviationSpecForTest(['a', 'b', 'c']);
    fixture.componentInstance.spellIndex = 1;
    fixture.componentInstance.ngOnInit();
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b'], 'abc  b');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b', 'i'], 'abc  bi');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b', 'i', 't'], 'abc  bit');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b', 'i', 't', ' '], 'abc  bit ');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b', 'i', 't', ' ', 'c'], 'abc  bit c');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b', 'i', 't', ' ', 'c', 'o'], 'abc  bit co');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b', 'i', 't', ' ', 'c', 'o', 'l'],
        'abc  bit col');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b', 'i', 't', ' ', 'c', 'o', 'l', 'd'],
        'abc  bit cold');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'b', 'i', 't', ' ', 'c', 'o', 'l', 'd', ' '],
        'abc  bit cold ');
    fixture.detectChanges();

    expect(fixture.componentInstance.state).toEqual(SpellingState.DONE);
    expect(fixture.componentInstance.spelledWords).toEqual([
      null, 'bit', 'cold'
    ]);
    expect(emittedAbbreviationSpecs.length).toEqual(2);
    expect(emittedAbbreviationSpecs[1].tokens.length).toEqual(3);
    expect(emittedAbbreviationSpecs[1].tokens[0]).toEqual({
      value: 'a',
      isKeyword: false,
    });
    expect(emittedAbbreviationSpecs[1].tokens[1]).toEqual({
      value: 'bit',
      isKeyword: true,
    });
    expect(emittedAbbreviationSpecs[1].tokens[2]).toEqual({
      value: 'cold',
      isKeyword: true,
    });
    expect(emittedAbbreviationSpecs[1].readableString).toEqual('a bit cold');
    expect(emittedAbbreviationSpecs[1].eraserSequence)
        .toEqual(repeatVirtualKey(VIRTUAL_KEY.BACKSPACE, 5 + 4 + 5));
    const tokenButtons =
        fixture.debugElement.queryAll(By.css('.abbreviated-token'));
    expect(tokenButtons.length).toEqual(3);
    expect(tokenButtons[0].nativeElement.innerText).toEqual('a');
    expect(tokenButtons[1].nativeElement.innerText).toEqual('bit');
    expect(tokenButtons[2].nativeElement.innerText).toEqual('cold');
  });
});
