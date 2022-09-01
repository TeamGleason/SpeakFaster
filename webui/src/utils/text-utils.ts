/** Text utilities. */

/**
 * Limit the length of a string by truncating the head or tail.
 *
 * Respects word boundaries whenever possible.
 */
export function limitStringLength(
    input: string, limit: number, truncate: 'head'|'tail' = 'head'): string {
  if (truncate !== 'head') {
    throw new Error(`Not implemented yet: truncate = ${truncate}`);
  }
  if (input.length <= limit) {
    return input;
  }
  const tokens = input.split(' ');
  let output = '';
  for (let i = tokens.length - 1; i >= 0; --i) {
    const separator = output.length > 0 ? ' ' : '';
    if (tokens[i].length + output.length + separator.length > limit) {
      break;
    }
    output = tokens[i] + separator + output;
  }
  return output;
}

/** Determines if an array of strings ends with the specified suffix. */
export function keySequenceEndsWith(
    keySequence: string[], suffix: string[]): boolean {
  return keySequence.length >= suffix.length &&
      allItemsEqual(
             keySequence.slice(keySequence.length - suffix.length), suffix);
}

export function allItemsEqual(array1: string[], array2: string[]): boolean {
  if (array1.length !== array2.length) {
    return false;
  }
  for (let i = 0; i < array1.length; ++i) {
    if (array1[i] !== array2[i]) {
      return false;
    }
  }
  return true;
}

/** Determine whether a string is a single alphanumeric character. */
export function isAlphanumericChar(str: string): boolean {
  if (str.length !== 1) {
    return false;
  }
  str = str.toLowerCase();
  return str >= 'a' && str <= 'z' || str >= '0' && str <= '9';
}

/** Determine whether a string ends with sentence-end punctuation. */
export function endsWithSentenceEndPunctuation(text: string): boolean {
  text = text.trim();
  return text.match(/.*[\.\!\?]$/) !== null;
}

/**
 * Determine whether a string ends with punctuation (nt necessarily
 * sentence-end).
 */
export function endsWithPunctuation(text: string): boolean {
  return extractEndPunctuation(text) !== '';
}

export function extractEndPunctuation(text: string): string {
  const searchIndex = text.search(/[\,\;\:\.\!\?]+$/);
  return searchIndex === -1 ? '' : text.substring(searchIndex);
}

/**
 * Trim string from the head, respecting word boundary.
 * @param str Input string.
 * @param maxLength Maximum allowed length.
 */
export function trimStringAtHead(str: string, maxLength: number): string {
  const length = str.length;
  if (length <= maxLength) {
    return str;
  }
  const trimAt = length - maxLength;
  let trimmed = str.substring(length - maxLength, length);
  if (!str[trimAt - 1].match(/^\s$/)) {
    trimmed = trimmed.substring(trimmed.search(/\s/));
  }
  return trimmed.trim();
}

/** Remove punctuation characters from a string. */
export function removePunctuation(str: string): string {
  return str.replace(/[\.\!\?]/g, '');
}
