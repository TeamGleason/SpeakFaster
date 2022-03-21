/** Utilities for keyboard and keypresses. */

export function isPlainAlphanumericKey(
    event: KeyboardEvent, key: string,
    caseSensitive: boolean = false): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }
  if (caseSensitive) {
    return event.key === key;
  } else {
    return event.key.toLocaleLowerCase() === key.toLocaleLowerCase();
  }
}

const PUNCTUATION_KEYS: string[] = [
  ',', '.', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '=', '_', '+'
];

export function isTextContentKey(event: KeyboardEvent) {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return false;
  }
  return (
      event.key.length === 1 &&
      ((event.key >= 'A' && event.key <= 'Z') ||
       (event.key >= 'a' && event.key <= 'z') ||
       (event.key >= '0' && event.key <= '9') || event.key === '\'' ||
       event.key === ';' || PUNCTUATION_KEYS.indexOf(event.key) !== -1 ||
       (event.key === ' ')));
}