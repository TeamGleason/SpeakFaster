/** Unit test for the StudyManager class and related functions. */

import {Subscription} from 'rxjs';

import {HttpEventLogger} from '../event-logger/event-logger-impl';

import {isCommand, setDelaysForTesting, StudyManager, StudyUserTurn} from './study-manager';

describe('Study Manager', () => {
  describe('isCommand()', () => {
    it('returns true for actual commands', () => {
      expect(isCommand('Study on')).toBeTrue();
      expect(isCommand('study off')).toBeTrue();
      expect(isCommand('Start abbrev dummy1 '));
      expect(isCommand('Start abbrev dummy1 a'));
      expect(isCommand('Start abbrev dummy1 b'));
      expect(isCommand(' Dialog stop'));
    });

    it('returns false for non-commands', () => {
      expect(isCommand('')).toBeFalse();
      expect(isCommand('study')).toBeFalse();
      expect(isCommand('Dialog')).toBeFalse();
      expect(isCommand('start abbrev')).toBeFalse();
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
          await studyManager.maybeHandleRemoteControlCommand('Study on');

      expect(handled).toBeTrue();
      expect(HttpEventLogger.isFullLogging()).toBeTrue();
    });

    it('sets logging mode to default after study off', async () => {
      await studyManager.maybeHandleRemoteControlCommand('study on');
      const handled =
          await studyManager.maybeHandleRemoteControlCommand('Study off ');

      expect(handled).toBeTrue();
      expect(HttpEventLogger.isFullLogging()).toBeFalse();
    });

    it('returns correct states when there is no ongoing dialog', async () => {
      expect(studyManager.getDialogId()).toBeNull();
      expect(studyManager.getDialogTurnIndex()).toBeNull();
      expect(studyManager.getDialogTurnText()).toBeNull();
      expect(studyManager.getPreviousDialogTurns()).toBeNull();
      expect(studyManager.isUserTurn).toBeFalse();
    });

    it('sets logging to full and states on start dialog command', async () => {
      const handled = await studyManager.maybeHandleRemoteControlCommand(
          'start abbrev dummy1 a');

      expect(handled).toBeTrue();
      expect(HttpEventLogger.isFullLogging()).toBeTrue();
      expect(studyManager.getDialogId()).toBe('dummy1');
      expect(studyManager.getDialogTurnIndex()).toEqual(0);
      expect(studyManager.getDialogTurnText())
          .toEqual('Shall we go to the movies today');
      expect(studyManager.getPreviousDialogTurns()).toEqual([]);
      expect(studyManager.isUserTurn).toBeTrue();
    });

    it('incrementTurn moves the state onto the partner turn', async () => {
      await studyManager.maybeHandleRemoteControlCommand('start abbrev dummy1');
      const incrementResult = studyManager.incrementTurn();

      expect(incrementResult.turnIndex).toEqual(1);
      expect(incrementResult.isComplete).toBeFalse();
      expect(studyManager.getDialogId()).toBe('dummy1');
      expect(studyManager.getDialogTurnIndex()).toEqual(1);
      expect(studyManager.getDialogTurnText())
          .toEqual('What good movies are on right now');
      const previousTurns = studyManager.getPreviousDialogTurns()!;
      expect(previousTurns.length).toEqual(1);
      expect(previousTurns[0].text).toEqual('Shall we go to the movies today');
      expect(previousTurns[0].partnerId).toBeNull();
      expect(previousTurns[0].timestamp.getTime()).toBeGreaterThan(0);
      expect(studyManager.isUserTurn).toBeFalse();
    });

    it('delay after incrementTurn: auto-increments again', done => {
      studyManager.maybeHandleRemoteControlCommand('start abbrev dummy1')
          .then(() => {
            studyManager.incrementTurn();

            setTimeout(() => {
              expect(studyManager.getDialogId()).toBe('dummy1');
              expect(studyManager.getDialogTurnIndex()).toEqual(2);
              expect(studyManager.getDialogTurnText())
                  .toEqual('We can check on our way there');
              const previousTurns = studyManager.getPreviousDialogTurns()!;
              expect(previousTurns.length).toEqual(2);
              expect(previousTurns[0].text)
                  .toEqual('Shall we go to the movies today');
              expect(previousTurns[0].partnerId).toBeNull();
              expect(previousTurns[0].timestamp.getTime()).toBeGreaterThan(0);
              expect(previousTurns[1].text)
                  .toEqual('What good movies are on right now');
              expect(previousTurns[1].partnerId).toEqual('Partner');
              expect(previousTurns[1].timestamp.getTime())
                  .toBeGreaterThan(previousTurns[0].timestamp.getTime());
              expect(studyManager.isUserTurn).toBeTrue();

              setTimeout(() => {
                const lastUserTurn = studyUserTurns[studyUserTurns.length - 1];
                expect(lastUserTurn.text)
                    .toEqual('We can check on our way there');
                expect(lastUserTurn.isComplete).toBeFalse();
                done();
              }, 20);
            }, 10);
          });
    });

    it('incrementTurn after auto-increment: sets correct states', done => {
      studyManager.maybeHandleRemoteControlCommand('start abbrev dummy1')
          .then(() => {
            studyManager.incrementTurn();
            setTimeout(() => {
              const incrementResult = studyManager.incrementTurn();
              expect(incrementResult.turnIndex).toEqual(3);
              expect(incrementResult.isComplete).toBeFalse();
              expect(studyManager.getDialogId()).toBe('dummy1');
              expect(studyManager.getDialogTurnIndex()).toEqual(3);
              expect(studyManager.getDialogTurnText())
                  .toEqual('Not sure I want to see a movie right now');
              const previousTurns = studyManager.getPreviousDialogTurns()!;
              expect(previousTurns.length).toEqual(3);
              expect(previousTurns[2].text)
                  .toEqual('We can check on our way there');
              expect(previousTurns[2].partnerId).toBeNull();
              expect(previousTurns[2].timestamp.getTime()).toBeGreaterThan(0);
              expect(studyManager.isUserTurn).toBeFalse();

              setTimeout(() => {
                const lastUserTurn = studyUserTurns[studyUserTurns.length - 1];
                expect(lastUserTurn.text)
                    .toEqual('How about going to the mall');
                expect(lastUserTurn.isComplete).toBeFalse();
                done();
              }, 20);
            }, 10);
          });
    });

    for (const [command, isAbbreviation] of [
             ['Start abbrev dummy1 B', true], ['Start full dummy1 B', false]] as
         Array<[string, boolean]>) {
      it('start from partner turn: auto increments initially', done => {
        studyManager.maybeHandleRemoteControlCommand(command).then(() => {
          expect(studyManager.getDialogId()).toEqual('dummy1');
          expect(studyManager.getDialogTurnIndex()).toEqual(1);
          expect(studyManager.getDialogTurnText())
              .toEqual('What good movies are on right now');
          const previousTurns = studyManager.getPreviousDialogTurns()!;
          expect(previousTurns.length).toEqual(1);
          expect(previousTurns[0].text)
              .toEqual('Shall we go to the movies today');
          expect(previousTurns[0].partnerId).toEqual('Partner');
          expect(previousTurns[0].timestamp.getTime()).toBeGreaterThan(0);

          setTimeout(() => {
            expect(studyUserTurns).toEqual([{
              text: 'What good movies are on right now',
              isAbbreviation: isAbbreviation,
              isComplete: false,
            }]);
            done();
          }, 30);
        });
      });
    }

    it('start from partner turn: incrementTurn after partner turn', done => {
      studyManager.maybeHandleRemoteControlCommand('Start abbrev dummy1 b')
          .then(() => {
            setTimeout(() => {
              const incrementResult = studyManager.incrementTurn();

              expect(incrementResult.turnIndex).toEqual(2);
              expect(incrementResult.isComplete).toBeFalse();
              expect(studyManager.getDialogId()).toEqual('dummy1');
              expect(studyManager.getDialogTurnIndex()).toEqual(2);
              expect(studyManager.getDialogTurnText())
                  .toEqual('We can check on our way there');
              const previousTurns = studyManager.getPreviousDialogTurns()!;
              expect(previousTurns.length).toEqual(2);
              expect(previousTurns[1].text)
                  .toEqual('What good movies are on right now');
              expect(previousTurns[1].partnerId).toBeNull();
              expect(previousTurns[1].timestamp.getTime()).toBeGreaterThan(0);
              const lastUserTurn = studyUserTurns[studyUserTurns.length - 1];
              expect(lastUserTurn.text).toBeNull();
              expect(lastUserTurn.isComplete).toBeFalse();
              done();
            }, 30);
          });
    });

    it('Dialog stop command reset state', async () => {
      await studyManager.maybeHandleRemoteControlCommand(
          'start abbrev dummy1 b');
      await studyManager.maybeHandleRemoteControlCommand('Dialog stop');

      expect(studyManager.getDialogId()).toBeNull();
      expect(studyManager.getDialogTurnIndex()).toBeNull();
      expect(studyManager.isUserTurn).toBeFalse();
      const lastUserTurn = studyUserTurns[studyUserTurns.length - 1];
      expect(lastUserTurn.text).toBeNull();
      expect(lastUserTurn.isComplete).toBeTrue();
    });

    it('Invalid dialog ID throws error', async () => {
      await expectAsync(
          studyManager.startDialog('', /* isAbbreviation= */ true))
          .toBeRejected();
    });

    it('ending dialog resets state: started by user', done => {
      studyManager.maybeHandleRemoteControlCommand('start abbrev dummy2_2turns')
          .then(() => {
            studyManager.incrementTurn();
            setTimeout(() => {
              expect(studyManager.getDialogId()).toBeNull();
              const lastUserTurn = studyUserTurns[studyUserTurns.length - 1];
              expect(lastUserTurn.text).toBeNull();
              expect(lastUserTurn.isAbbreviation).toBeTrue();
              done();
            }, 40);
          });
    });

    it('ending dialog resets state: started by partner', done => {
      studyManager
          .maybeHandleRemoteControlCommand('Start abbrev dummy2_2turns B')
          .then(() => {
            expect(studyManager.getDialogId()).toEqual('dummy2_2turns');
            expect(studyManager.getDialogTurnIndex()).toEqual(1);
            studyManager.incrementTurn();
            setTimeout(() => {
              expect(studyManager.getDialogId()).toBeNull();
              const lastUserTurn = studyUserTurns[studyUserTurns.length - 1];
              expect(lastUserTurn.text).toBeNull();
              expect(lastUserTurn.isAbbreviation).toBeTrue();
              done();
            }, 30);
          });
    });
  });
});
