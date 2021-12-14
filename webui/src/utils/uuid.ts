/** UUID-related utilities. */

export function createUuid(): string {
  // https://stackoverflow.com/a/44078785/2116766
  const u =
      Date.now().toString(16) + Math.random().toString(16) + '0'.repeat(16);
  return [
    u.substr(0, 8), u.substr(8, 4), '4000-8' + u.substr(13, 3), u.substr(16, 12)
  ].join('-');
}
