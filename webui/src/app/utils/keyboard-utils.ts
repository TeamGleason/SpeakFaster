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
