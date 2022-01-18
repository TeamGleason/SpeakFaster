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
  return keySequence.length > suffix.length &&
      allItemsEqual(
             keySequence.slice(keySequence.length - suffix.length), suffix);
}

function allItemsEqual(array1: string[], array2: string[]): boolean {
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
