/** Unit test for the StudyManager class and related functions. */

import {HttpEventLogger} from '../event-logger/event-logger-impl';

import {isCommand, StudyManager} from './study-manager';

// DO NOT SUBMIT.
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
    beforeEach(async () => {
      HttpEventLogger.setFullLogging(false);
      studyManager = new StudyManager(null);
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

  });
});
