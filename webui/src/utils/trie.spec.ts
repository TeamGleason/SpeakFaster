/** Unit tests for Trie. */

import {Trie} from './trie';

fdescribe('Trie', () => {
  let trie: Trie;
  beforeEach(() => {
    trie = new Trie();
  });

  it('Initial query with empty sequence returns empty result', () => {
    expect(trie.query([])).toEqual([]);
  });

  it('Initial query with non-empty sequence returns empty result', () => {
    expect(trie.query(['the'])).toEqual([]);
  });

  it('Inserting a single length-1 sequence works', () => {
    trie.insert(['a']);
    expect(trie.query([])).toEqual([{token: 'a', count: 1}]);
  });

  it('Inserting multiple length-1 works', () => {
    trie.insert(['b']);
    trie.insert(['a']);
    trie.insert(['b']);
    trie.insert(['c']);
    trie.insert(['b']);
    trie.insert(['c']);
    expect(trie.query([])).toEqual([
      {token: 'b', count: 3 / 6}, {token: 'c', count: 2 / 6},
      {token: 'a', count: 1 / 6}
    ]);
  });

  it('Inserting a single length-2 sequence workds', () => {
    trie.insert(['apple', 'juice']);
    expect(trie.query([])).toEqual([{token: 'apple', count: 1}]);
    expect(trie.query(['apple'])).toEqual([{token: 'juice', count: 1}]);
    expect(trie.query(['apple', 'juice'])).toEqual([]);
    expect(trie.query(['banana'])).toEqual([]);
  });

  it('Inserting multiple single length-1 and length-2 sequence workds', () => {
    trie.insert(['apple']);
    trie.insert(['orange', 'juice']);
    trie.insert(['apple', 'juice']);
    trie.insert(['apple', 'sauce']);
    trie.insert(['apple', 'juice']);
    expect(trie.query([])).toEqual([
      {token: 'apple', count: 4 / 5}, {token: 'orange', count: 1 / 5}
    ]);
    expect(trie.query(['apple'])).toEqual([
      {token: 'juice', count: 2 / 3}, {token: 'sauce', count: 1 / 3}
    ]);
    expect(trie.query(['apple', 'juice'])).toEqual([]);
    expect(trie.query(['apple', 'sauce'])).toEqual([]);
    expect(trie.query(['apple', 'pie'])).toEqual([]);
  });

  it('Inserting a single length-3 sequence workds', () => {
    trie.insert(['apple', 'juice', 'and']);
    expect(trie.query([])).toEqual([{token: 'apple', count: 1}]);
    expect(trie.query(['apple'])).toEqual([{token: 'juice', count: 1}]);
    expect(trie.query(['apple', 'juice'])).toEqual([{token: 'and', count: 1}]);
    expect(trie.query(['apple', 'sauce'])).toEqual([]);
    expect(trie.query(['apple', 'juice', 'and'])).toEqual([]);
    expect(trie.query(['banana'])).toEqual([]);
  });

  it('Inserting empty token leads to error', () => {
    expect(() => trie.insert([])).toThrowError(/Cannot insert empty tokens/);
  });

  it('Serialize to string: empty trie', () => {
    expect(trie.serialize()).toEqual(JSON.stringify({'__trie__': {}}));
  });

  it('Serialize to string: non-empty trie', () => {
    trie.insert(['apple']);
    trie.insert(['orange', 'juice']);
    trie.insert(['apple', 'juice']);
    expect(trie.serialize()).toEqual(JSON.stringify({
      '__trie__': {
        'apple': {'count': 2, '__children__': {'juice': {'count': 1}}},
        'orange': {'count': 1, '__children__': {'juice': {'count': 1}}},
      }
    }));
  });
});
