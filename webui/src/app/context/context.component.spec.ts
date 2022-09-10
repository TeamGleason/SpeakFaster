import {HttpClientModule} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {ComponentFixture, TestBed, tick} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {Observable, of, Subject} from 'rxjs';

import {HttpEventLogger} from '../event-logger/event-logger-impl';
import {RetrieveContextResponse, SpeakFasterService} from '../speakfaster-service';
import {setDelaysForTesting, StudyManager} from '../study/study-manager';
import {ConversationTurn} from '../types/conversation';
import {TextEntryEndEvent} from '../types/text-entry';

import {ContextComponent} from './context.component';
import {ContextModule} from './context.module';

@Injectable()
class SpeakFasterServiceForTest {
  retrieveContext(userId: string): Observable<RetrieveContextResponse> {
    return of({
      result: 'SUCCESS',
      contextSignals: [],
    });
  }
}

describe('ContextComponent', () => {
  let fixture: ComponentFixture<ContextComponent>;
  let textEntryEndSubject: Subject<TextEntryEndEvent>;
  let studyManager: StudyManager;
  let emittedSelectedTurns: ConversationTurn[][];

  beforeEach(async () => {
    studyManager = new StudyManager(null, null);
    await TestBed
        .configureTestingModule({
          imports: [ContextModule, HttpClientModule],
          declarations: [ContextComponent],
          providers: [
            {
              provide: SpeakFasterService,
              useValue: new SpeakFasterServiceForTest()
            },
            {
              provide: StudyManager,
              useValue: studyManager,
            }
          ],
        })
        .compileComponents();
    textEntryEndSubject = new Subject();
    fixture = TestBed.createComponent(ContextComponent);
    fixture.componentInstance.disableContinuousContextRetrieval();
    fixture.componentInstance.textEntryEndSubject = textEntryEndSubject;
    fixture.componentInstance.userId = 'testuser';
    emittedSelectedTurns = [];
    fixture.componentInstance.contextStringsSelected.subscribe(
        (selectedTurns) => {
          emittedSelectedTurns.push(selectedTurns);
        });
    fixture.detectChanges();
  });

  afterEach(async () => {
    (studyManager as any).reset();
    HttpEventLogger.setFullLogging(false);

  });

  it('displays empty context signals when there is none', () => {
    const turnComponents = fixture.debugElement.queryAll(
        By.css('app-conversation-turn-component'));
    expect(turnComponents.length).toEqual(0);
  });

  it('displays single context signal on final text-entry-end event', () => {
    textEntryEndSubject.next({
      text: 'Hello, world',
      timestampMillis: new Date().getTime(),
      isFinal: true,
    });
    fixture.detectChanges();
    const turnComponents = fixture.debugElement.queryAll(
        By.css('app-conversation-turn-component'));
    expect(turnComponents.length).toEqual(1);
    const turnComponent = turnComponents[0];
    expect(turnComponent.query(By.css('.turn-content')).nativeElement.innerText)
        .toEqual('Hello, world');
  });

  it('displays no context signal if text-entry-end event is not final', () => {
    textEntryEndSubject.next({
      text: 'Hello, world',
      timestampMillis: new Date().getTime(),
      isFinal: false,
    });
    fixture.detectChanges();
    const turnComponents = fixture.debugElement.queryAll(
        By.css('app-conversation-turn-component'));
    expect(turnComponents.length).toEqual(0);
  });

  it('displays the latest three elements if there are more than three', () => {
    for (let i = 0; i < 5; ++i) {
      textEntryEndSubject.next({
        text: `Hello, #${i + 1}`,
        timestampMillis: i * 1000,
        isFinal: true,
      });
      fixture.detectChanges();
    }
    const turnComponents = fixture.debugElement.queryAll(
        By.css('app-conversation-turn-component'));
    expect(turnComponents.length).toEqual(3);
    expect(turnComponents[0]
               .query(By.css('.turn-content'))
               .nativeElement.innerText)
        .toEqual('Hello, #3');
    expect(turnComponents[1]
               .query(By.css('.turn-content'))
               .nativeElement.innerText)
        .toEqual('Hello, #4');
    expect(turnComponents[2]
               .query(By.css('.turn-content'))
               .nativeElement.innerText)
        .toEqual('Hello, #5');
  });

  it('text entry event increments study dialog turn count', async () => {
    await studyManager.maybeHandleRemoteControlCommand('start abbrev dummy1');
    textEntryEndSubject.next({
      text: 'Shall we go to the movies today',
      timestampMillis: new Date().getTime(),
      isFinal: true,
    });

    expect(studyManager.getDialogId()).toEqual('dummy1');
    expect(studyManager.getDialogTurnIndex()).toEqual(1);
    const prevTurns = studyManager.getPreviousDialogTurns()!;
    expect(prevTurns.length).toEqual(1);
    expect(prevTurns[0].text).toEqual('Shall we go to the movies today');
    expect(prevTurns[0].partnerId).toBeNull();
    expect(prevTurns[0].timestamp).toBeGreaterThan(0);
  });

  for (let numContextTurns = 1; numContextTurns < 6; ++numContextTurns) {
    it(`receives correct turns from study manager: ${numContextTurns}`,
        async () => {
          setDelaysForTesting(10e3, 50e3);
          fixture.componentInstance.ngAfterViewInit();
          await studyManager.maybeHandleRemoteControlCommand(
              'start abbrev dummy1 a');
          const expectedContextTurns: string[] = [];
          for (let turn = 1; turn <= numContextTurns; ++turn) {
            const contextTurn = `turn ${turn}`;
            studyManager.incrementTurn(contextTurn);
            expectedContextTurns.push(contextTurn);
          }
          (fixture.componentInstance as any).retrieveContext();
          expect(emittedSelectedTurns.length).toEqual(1);
          expect(emittedSelectedTurns[0].length).toEqual(numContextTurns);
          expect(emittedSelectedTurns[0].map(turn => turn.speechContent))
              .toEqual(expectedContextTurns);
        });
  }

  it('isStudyOn is false by default', () => {
    textEntryEndSubject.next({
      text: 'Hello, world',
      timestampMillis: new Date().getTime(),
      isFinal: true,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance.isStudyOn).toBeFalse();
  });

  it('Setting isStudyOn to true sets child properties', () => {
    fixture.componentInstance.isStudyOn = true;
    textEntryEndSubject.next({
      text: 'Hello, world',
      timestampMillis: new Date().getTime(),
      isFinal: true,
    });
    textEntryEndSubject.next({
      text: 'Hello, universe',
      timestampMillis: new Date().getTime(),
      isFinal: true,
    });
    fixture.detectChanges();

    const turnComponents = fixture.debugElement.queryAll(
        By.css('app-conversation-turn-component'));
    expect(turnComponents.length).toEqual(2);
    expect(turnComponents[0].componentInstance.isCompact).toBeTrue();
  });
});
