/** Unit test for the StudyManager class and related functions. */

import {Subscription} from 'rxjs';

import {HttpEventLogger} from '../event-logger/event-logger-impl';

import {isCommand, setDelaysForTesting, StudyManager, StudyUserTurn} from './study-manager';

fdescribe('Study Manager', () => {
  describe('isCommand()', () => {
    it('returns true for actual commands', () => {
      expect(isCommand('Study on')).toBeTrue();
      expect(isCommand('study off')).toBeTrue();
      expect(isCommand('Dialog start dummy1 '));
      expect(isCommand('Dialog start dummy1 a'));
      expect(isCommand('Dialog start dummy1 b'));
      expect(isCommand(' Dialog stop'));
    });

    it('returns false for non-commands', () => {
      expect(isCommand('')).toBeFalse();
      expect(isCommand('study')).toBeFalse();
      expect(isCommand('Dialog')).toBeFalse();
      expect(isCommand('dialog start')).toBeFalse();
    });
  });

  describe('StudyManager', () => {
    let studyManager: StudyManager;
    let studyUserTurns: StudyUserTurn[];
    let studyUserTurnsSubscription: Subscription;

    beforeEach(async () => {
      setDelaysForTesting(10, 20);
      HttpEventLogger.setFullLogging(false);
      studyManager = new StudyManager(null);
      studyUserTurns = [];
      studyUserTurnsSubscription =
          studyManager.studyUserTurns.subscribe((turn) => {
            studyUserTurns.push(turn);
          });
    });

    afterEach(async () => {
      studyUserTurnsSubscription.unsubscribe();
    });

    it('sets logging mode to full for command study on', async () => {
      const handled =
          await studyManager.maybeHandleRemoteControlCommands('Study on');

      expect(handled).toBeTrue();
      expect(HttpEventLogger.isFullLogging()).toBeTrue();
    });

    it('sets logging mode to default after study off', async () => {
      await studyManager.maybeHandleRemoteControlCommands('study on');
      const handled =
          await studyManager.maybeHandleRemoteControlCommands('Study off ');

      expect(handled).toBeTrue();
      expect(HttpEventLogger.isFullLogging()).toBeFalse();
    });

    it('returns correct states when there is no ongoing dialog', async () => {
      expect(studyManager.getDialogId()).toBeNull();
      expect(studyManager.getDialogTurnIndex()).toBeNull();
      expect(studyManager.getDialogTurnText()).toBeNull();
      expect(studyManager.getPreviousDialogTurnTexts()).toBeNull();
      expect(studyManager.isUserTurn).toBeFalse();
    });

    it('sets logging to full and states on start dialog command', async () => {
      const handled = await studyManager.maybeHandleRemoteControlCommands(
          'dialog start dummy1 a');

      expect(handled).toBeTrue();
      expect(HttpEventLogger.isFullLogging()).toBeTrue();
      expect(studyManager.getDialogId()).toBe('dummy1');
      expect(studyManager.getDialogTurnIndex()).toEqual(0);
      expect(studyManager.getDialogTurnText()).toEqual('Shall we go');
      expect(studyManager.getPreviousDialogTurnTexts()).toEqual([]);
      expect(studyManager.isUserTurn).toBeTrue();
    });

    it('incrementTurn moves the state onto the partner turn', async () => {
      await studyManager.maybeHandleRemoteControlCommands(
          'dialog start dummy1');
      const incrementResult = studyManager.incrementTurn();

      expect(incrementResult.turnIndex).toEqual(1);
      expect(incrementResult.isComplete).toBeFalse();
      expect(studyManager.getDialogId()).toBe('dummy1');
      expect(studyManager.getDialogTurnIndex()).toEqual(1);
      expect(studyManager.getDialogTurnText()).toEqual('I am not ready yet');
      const previousTurns = studyManager.getPreviousDialogTurnTexts()!;
      expect(previousTurns.length).toEqual(1);
      expect(previousTurns[0].text).toEqual('Shall we go');
      expect(previousTurns[0].partnerId).toBeNull();
      expect(previousTurns[0].timestamp.getTime()).toBeGreaterThan(0);
      expect(studyManager.isUserTurn).toBeFalse();
    });

    it('delay after incrementTurn: auto-increments again', async done => {
      await studyManager.maybeHandleRemoteControlCommands('dialog start dummy1');
      studyManager.incrementTurn();

      setTimeout(() => {
        expect(studyManager.getDialogId()).toBe('dummy1');
        expect(studyManager.getDialogTurnIndex()).toEqual(2);
        expect(studyManager.getDialogTurnText())
            .toEqual('When will you be ready');
        const previousTurns = studyManager.getPreviousDialogTurnTexts()!;
        expect(previousTurns.length).toEqual(2);
        expect(previousTurns[0].text).toEqual('Shall we go');
        expect(previousTurns[0].partnerId).toBeNull();
        expect(previousTurns[0].timestamp.getTime()).toBeGreaterThan(0);
        expect(previousTurns[1].text).toEqual('I am not ready yet');
        expect(previousTurns[1].partnerId).toEqual('Partner');
        expect(previousTurns[1].timestamp.getTime())
            .toBeGreaterThan(previousTurns[0].timestamp.getTime());
        expect(studyManager.isUserTurn).toBeTrue();

        setTimeout(() => {
          const lastUserTurn = studyUserTurns[studyUserTurns.length - 1];
          expect(lastUserTurn.text).toEqual('When will you be ready');
          expect(lastUserTurn.isComplete).toBeFalse();
          done();
        }, 20);
      }, 10);
    });

    it('incrementTurn after auto-increment: sets correct states',
       async done => {
         await studyManager.maybeHandleRemoteControlCommands('dialog start dummy1');
         studyManager.incrementTurn();
         setTimeout(() => {
           const incrementResult = studyManager.incrementTurn();
           expect(incrementResult.turnIndex).toEqual(3);
           expect(incrementResult.isComplete).toBeFalse();
           expect(studyManager.getDialogId()).toBe('dummy1');
           expect(studyManager.getDialogTurnIndex()).toEqual(3);
           expect(studyManager.getDialogTurnText()).toEqual('Not sure');
           const previousTurns = studyManager.getPreviousDialogTurnTexts()!;
           expect(previousTurns.length).toEqual(3);
           expect(previousTurns[2].text).toEqual('When will you be ready');
           expect(previousTurns[2].partnerId).toBeNull();
           expect(previousTurns[2].timestamp.getTime()).toBeGreaterThan(0);
           expect(studyManager.isUserTurn).toBeFalse();

           setTimeout(() => {
             const lastUserTurn = studyUserTurns[studyUserTurns.length - 1];
             expect(lastUserTurn.text).toEqual('Hurry up');
             expect(lastUserTurn.isComplete).toBeFalse();
             done();
           }, 20);
         }, 10);
       });

    it('start from partner turn: auto increments initially', async done => {
      await studyManager.maybeHandleRemoteControlCommands(
          'Dialog start dummy1 B');

      expect(studyManager.getDialogId()).toEqual('dummy1');
      expect(studyManager.getDialogTurnIndex()).toEqual(1);
      expect(studyManager.getDialogTurnText()).toEqual('I am not ready yet');
      const previousTurns = studyManager.getPreviousDialogTurnTexts()!;
      expect(previousTurns.length).toEqual(1);
      expect(previousTurns[0].text).toEqual('Shall we go');
      expect(previousTurns[0].partnerId).toEqual('Partner');
      expect(previousTurns[0].timestamp.getTime()).toBeGreaterThan(0);

      setTimeout(() => {
        expect(studyUserTurns).toEqual([{
          text: 'I am not ready yet',
          isComplete: false,
        }]);
        done();
      }, 30);
    });

    it('start from partner turn: incrementTurn after partner turn',
       async done => {
         await studyManager.maybeHandleRemoteControlCommands(
             'Dialog start dummy1 b');

         setTimeout(() => {
           const incrementResult = studyManager.incrementTurn();

           expect(incrementResult.turnIndex).toEqual(2);
           expect(incrementResult.isComplete).toBeFalse();
           expect(studyManager.getDialogId()).toEqual('dummy1');
           expect(studyManager.getDialogTurnIndex()).toEqual(2);
           expect(studyManager.getDialogTurnText())
               .toEqual('When will you be ready');
           const previousTurns = studyManager.getPreviousDialogTurnTexts()!;
           expect(previousTurns.length).toEqual(2);
           expect(previousTurns[1].text).toEqual('I am not ready yet');
           expect(previousTurns[1].partnerId).toBeNull();
           expect(previousTurns[1].timestamp.getTime()).toBeGreaterThan(0);
           done();
         }, 30);
       });

    it('Dialog stop command reset state', async () => {
      await studyManager.maybeHandleRemoteControlCommands(
          'Dialog start dummy1 b');
      await studyManager.maybeHandleRemoteControlCommands('Dialog stop');

      expect(studyManager.getDialogId()).toBeNull();
      expect(studyManager.getDialogTurnIndex()).toBeNull();
      expect(studyManager.isUserTurn).toBeFalse();
      const lastUserTurn = studyUserTurns[studyUserTurns.length - 1];
      expect(lastUserTurn.text).toBeNull();
      expect(lastUserTurn.isComplete).toBeTrue();
    });

    it('Invalid dialog ID throws error', async () => {
      await expectAsync(studyManager.startDialog('')).toBeRejected();
    });
  });
});
