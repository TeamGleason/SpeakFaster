/**
 * Module that governs how context signals from a partner is used as
 * remote-control commands.
 *
 * Remote-control commands include:
 * - 'study on': Switch app to the study mode, i.e., full logging.
 * - 'study off': Switch app out of study mode, i.e., default (non-full)
 * logging.
 * - 'convo start <n>': Start expeimental conversation #n.
 */

import {HttpEventLogger} from '../event-logger/event-logger-impl';

/**
 * Detect remote-control commands and handle them accordingly
 * @param text
 * @returns whether `text` is handled as a remote-control command.
 * */
export function maybeHandleRemoteControlCommands(text: string): boolean {
  text = text.trim().toLocaleLowerCase();
  if (text === 'study on') {
    HttpEventLogger.setFullLogging(true);
    return true;
  } else if (text === 'study off') {
    HttpEventLogger.setFullLogging(false);
    return true;
  }
  return false;
}
