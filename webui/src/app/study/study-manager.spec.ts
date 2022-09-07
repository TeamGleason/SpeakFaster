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
      expect(isCommand('Start abbrev u1'));
      expect(isCommand('Start abbrev u2 '));
      expect(isCommand('Start abbrev u3 a'));
      expect(isCommand('Start abbrev u3 b '));
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
      studyManager =
          new StudyManager(/* httpClient= */ null, /* httpEventLogger= */ null);
      studyUserTurns = [];
      studyUserTurnsSubscription =
          studyManager.studyUserTurns.subscribe((turn) => {
            studyUserTurns.push(turn);
          });
    });

    afterEach(async () => {
      studyUserTurnsSubscription.unsubscribe();
    });

    it('isStudyOn isAbbreviationMode are initially false', () => {
      expect(studyManager.isStudyOn).toBeFalse();
      expect(studyManager.isAbbreviationMode).toBeFalse();
    });

    it('sets logging mode to full for command study on', async () => {
      const handled =
          await studyManager.maybeHandleRemoteControlCommand('Study on');

      expect(handled).toBeTrue();
      expect(studyManager.isStudyOn).toBeTrue();
      expect(studyManager.isAbbreviationMode).toBeFalse();
      expect(HttpEventLogger.isFullLogging()).toBeTrue();
    });

    it('sets logging mode to default after study off', async () => {
      await studyManager.maybeHandleRemoteControlCommand('study on');
      const handled =
          await studyManager.maybeHandleRemoteControlCommand('Study off ');

      expect(handled).toBeTrue();
      expect(studyManager.isStudyOn).toBeFalse();
      expect(studyManager.isAbbreviationMode).toBeFalse();
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
      expect(studyManager.isAbbreviationMode).toBeTrue();
      expect(studyManager.waitingForPartnerTurnAfter).toBeNull();
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

      expect(studyManager.isStudyOn).toBeTrue();
      expect(studyManager.isAbbreviationMode).toBeTrue();
      expect(incrementResult.turnIndex).toEqual(1);
      expect(incrementResult.isComplete).toBeFalse();
      expect(studyManager.getDialogId()).toBe('dummy1');
      expect(studyManager.waitingForPartnerTurnAfter).toBeNull();
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
              expect(studyManager.isStudyOn).toBeTrue();
              expect(studyManager.isAbbreviationMode).toBeTrue();
              expect(studyManager.getDialogId()).toBe('dummy1');
              expect(studyManager.waitingForPartnerTurnAfter).toBeNull();
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
              expect(studyManager.isStudyOn).toBeTrue();
              expect(studyManager.isAbbreviationMode).toBeTrue();
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

    it('increment turn with user turn', (done) => {
      studyManager.maybeHandleRemoteControlCommand('start abbrev dummy1 a')
          .then(() => {
            studyManager.incrementTurn('unexpected question');
            setTimeout(() => {
              expect(studyManager.isStudyOn).toBeTrue();
              expect(studyManager.isAbbreviationMode).toBeTrue();
              expect(studyManager.getDialogTurnIndex()).toEqual(2);
              expect(studyManager.waitingForPartnerTurnAfter).toBeNull();
              const prevTurns = studyManager.getPreviousDialogTurns();
              expect(prevTurns!.length).toEqual(2);
              expect(prevTurns![0].text).toEqual('unexpected question');
              expect(prevTurns![0].partnerId).toBeNull();
              expect(prevTurns![1].text)
                  .toEqual('What good movies are on right now');
              expect(prevTurns![1].partnerId).toEqual('Partner');
              done();
            }, 10);
          });
    });

    it('increment turn with user turn', (done) => {
      studyManager.maybeHandleRemoteControlCommand('start abbrev dummy1 b')
          .then(() => {
            setTimeout(() => {
              expect(studyManager.isStudyOn).toBeTrue();
              expect(studyManager.isAbbreviationMode).toBeTrue();
              expect(studyManager.getDialogTurnIndex()).toEqual(1);
              studyManager.incrementTurn('random reply');

              expect(studyManager.getDialogTurnIndex()).toEqual(2);
              expect(studyManager.waitingForPartnerTurnAfter).toBeNull();
              const prevTurns = studyManager.getPreviousDialogTurns();
              expect(prevTurns!.length).toEqual(2);
              expect(prevTurns![0].text)
                  .toEqual('Shall we go to the movies today');
              expect(prevTurns![0].partnerId).toEqual('Partner');
              expect(prevTurns![1].text).toEqual('random reply');
              expect(prevTurns![1].partnerId).toBeNull();
              done();
            }, 10);
          });
    });

    it('unscripted dialog goes into waiting mode', (done) => {
      studyManager.maybeHandleRemoteControlCommand('start abbrev utest1')
          .then(() => {
            setTimeout(() => {
              expect(studyManager.isStudyOn).toBeTrue();
              expect(studyManager.isAbbreviationMode).toBeTrue();
              expect(studyUserTurns.length).toEqual(1);
              expect(studyUserTurns[0].instruction)
                  .toEqual('Enter your reply in abbreviation.');
              expect(studyUserTurns[0].text).toEqual('');
              expect(studyUserTurns[0].isComplete).toBeFalse();

              expect(HttpEventLogger.isFullLogging()).toBeTrue();
              expect(studyManager.getDialogTurnIndex()).toEqual(1);
              expect(studyManager.waitingForPartnerTurnAfter).toBeNull();

              studyManager.incrementTurn('I like the weather today');
              expect(studyManager.getDialogTurnIndex()).toEqual(2);
              expect(studyManager.waitingForPartnerTurnAfter)
                  .toBeGreaterThan(0);
              const prevTurns = studyManager.getPreviousDialogTurns();
              expect(prevTurns!.length).toEqual(2);
              expect(prevTurns![0].text)
                  .toEqual('How do you like the weather today?');
              expect(prevTurns![0].partnerId).toBe('Partner');
              expect(prevTurns![1].text).toEqual('I like the weather today');
              expect(prevTurns![1].partnerId).toBeNull();
              done();
            }, 20);
          });
    });

    for (const role of ['', 'a', 'b']) {
      it('unscripted dialog: user role a is overridden: ' + role, (done) => {
        studyManager.maybeHandleRemoteControlCommand(`start abbrev utest1 ${role}`)
            .then(() => {
              expect(studyManager.getDialogId()).toEqual('utest1');
              expect(studyManager.getDialogTurnIndex()).toEqual(1);
              expect(studyManager.isUserTurn).toBeTrue();
              expect(studyManager.waitingForPartnerTurnAfter).toBeNull();
              done();
            });
      });
    }

    it('unscripted dialog: provide manual partner turn', (done) => {
      studyManager.maybeHandleRemoteControlCommand('start abbrev utest1')
          .then(() => {
            setTimeout(() => {
              studyManager.incrementTurn('I like the weather today');

              setTimeout(() => {
                studyManager.incrementTurn('What is your favorite season?');

                expect(studyManager.getDialogTurnIndex()).toEqual(3);
                expect(studyManager.waitingForPartnerTurnAfter).toBeNull();
                const prevTurns = studyManager.getPreviousDialogTurns();
                expect(prevTurns!.length).toEqual(3);
                expect(prevTurns![0].text)
                    .toEqual('How do you like the weather today?');
                expect(prevTurns![0].partnerId).toBe('Partner');
                expect(prevTurns![1].text).toEqual('I like the weather today');
                expect(prevTurns![1].partnerId).toBeNull();
                expect(prevTurns![2].text)
                    .toEqual('What is your favorite season?');
                expect(prevTurns![2].partnerId).toBe('Partner');
                done();
              }, 10);
            }, 10);
          });
    });

    for (const [command, isAbbreviation, expectedInstruction] of [
             ['Start abbrev dummy1 B', true, 'Enter in abbreviation:'],
             ['Start full dummy1 B', false, 'Enter in full:'],
    ] as Array<[string, boolean, string]>) {
      it('start from partner turn: auto increments initially', done => {
        studyManager.maybeHandleRemoteControlCommand(command).then(() => {
          expect(studyManager.isAbbreviationMode).toEqual(isAbbreviation);
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
              instruction: expectedInstruction,
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
      expect(studyManager.isStudyOn).toBeTrue();
    });

    it('Invalid dialog ID throws error', async () => {
      await expectAsync(
          studyManager.startDialog('', /* isAbbreviation= */ true))
          .toBeRejected();
    });

    it('ending dialog resets state: started by user', done => {
      studyManager.maybeHandleRemoteControlCommand('start abbrev dummy2')
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
      studyManager.maybeHandleRemoteControlCommand('Start abbrev dummy2 B')
          .then(() => {
            expect(studyManager.getDialogId()).toEqual('dummy2');
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
