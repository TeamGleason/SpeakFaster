/** Unit tests for the SpellComponent. */
import {HttpClientModule} from '@angular/common/http';
import {SimpleChange} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {of, Subject} from 'rxjs';
import { createUuid } from 'src/utils/uuid';

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
      lineageId: createUuid(),
    };
  }

  it('initial state is CHOOSING_TOKEN', () => {
    expect(fixture.componentInstance.state)
        .toEqual(SpellingState.CHOOSING_TOKEN);
  });

  it('displays initial letters given original abbreviaton spec', () => {
    fixture.componentInstance.originalAbbreviationSpec =
        getAbbreviationSpecForTest(['a', 'b', 'c']);
    fixture.componentInstance.spellIndex = 1;
    fixture.detectChanges();
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
    fixture.componentInstance.spellIndex = 1;
    fixture.detectChanges();
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
    fixture.componentInstance.spellIndex = 1;
    fixture.detectChanges();
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
         fixture.detectChanges();
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
    console.log('=== TEST BEGINS');  // DEBUG
    const emittedAbbreviationSpecs: AbbreviationSpec[] = [];
    fixture.componentInstance.newAbbreviationSpec.subscribe(
        spec => emittedAbbreviationSpecs.push(spec));
    fixture.componentInstance.originalAbbreviationSpec =
        getAbbreviationSpecForTest(['a', 'b', 'c']);
    fixture.componentInstance.spellIndex = 1;
    fixture.detectChanges();
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
    // console.log('=== TEST ENDS');  // DEBUG
  });

  it('supports 2nd spelling after 1st one', () => {
    console.log('=== BEGIN');  // DEBUG
    const emittedAbbreviationSpecs: AbbreviationSpec[] = [];

    fixture.componentInstance.newAbbreviationSpec.subscribe(
        spec => emittedAbbreviationSpecs.push(spec));
    const oldAbbreviationSpec = getAbbreviationSpecForTest(['a', 'b'])
    fixture.componentInstance.originalAbbreviationSpec = oldAbbreviationSpec;
    fixture.componentInstance.spellIndex = 0;
    fixture.componentInstance.ngOnInit();
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'a'], 'abc  a');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'a', 'l'], 'abc  al');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'a', 'l', 'l'], 'abc  all');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'a', 'l', 'l', ' '], 'abc  all ');
    fixture.detectChanges();
    // Set up the second AE spelling.
    console.log('=== New AE');  // DEBUG
    const newAbbreviationSpec = getAbbreviationSpecForTest(['s', 'c'])
    fixture.componentInstance.originalAbbreviationSpec = newAbbreviationSpec;
    fixture.componentInstance.spellIndex = 1;
    fixture.detectChanges();
    fixture.componentInstance.ngOnChanges({
      originalAbbreviationSpec: new SimpleChange(
          oldAbbreviationSpec, newAbbreviationSpec, /* firstChange= */ true),
    });
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'a', 'l', 'l', ' ', 's', 'c', ' ', ' '],
        'abc  all sc  ');
    fixture.componentInstance.listenToKeypress(
        ['a', 'b', 'c', ' ', ' ', 'a', 'l', 'l', ' ', 's', 'c', ' ', ' ', 'c'],
        'abc  all sc  c');
    fixture.detectChanges();

    expect(fixture.componentInstance.state)
        .toEqual(SpellingState.SPELLING_TOKEN);
    const tokenButtons =
        fixture.debugElement.queryAll(By.css('.abbreviated-token'));
    // Spelling has started on 'c' (the 2nd letter). There should be one button
    // for the 1st letter ('s').
    expect(tokenButtons.length).toEqual(1);
    expect(tokenButtons[0].nativeElement.innerText).toEqual('s');
    const spellInputs = fixture.debugElement.queryAll(By.css('.spell-input'));
    expect(spellInputs.length).toEqual(1);
    expect(spellInputs[0].nativeElement.value).toEqual('c');
    console.log('=== END');  // DEBUG
  });

  // TODO(cais): Test spelling a new abbreviation.
  // TODO(cais): Verify that KSR is correct.
});
