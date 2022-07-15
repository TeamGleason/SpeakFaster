/** Trie data structure. */

const TRIE_ROOT_KEY = '__trie__';
const CHILDREN_KEY = '__children__';
const SEQUENCE_LENGTH_LIMIT = 50;

export interface TokenCandidate {
  token: string;
  score: number;
}

class TrieNode {
  // A TrieNode without any children is a leaf node.
  private children: Array<{token: string; node: TrieNode; count: number;}> = [];

  constructor() {}

  public insert(tokens: string[]) {
    if (tokens.length === 0) {
      throw new Error('Cannot insert empty tokens');
    }
    const childIndex = this.children.map(t => t.token).indexOf(tokens[0]);
    let childNode: TrieNode;
    if (childIndex === -1) {
      childNode = new TrieNode();
      this.children.push({
        token: tokens[0],
        node: childNode,
        count: 1,
      });
    } else {  // Child node already exists.
      this.children[childIndex].count++;
      childNode = this.children[childIndex].node;
    }
    if (tokens.length > 1) {
      childNode!.insert(tokens.slice(1));
    }
  }

  public get isLeaf(): boolean {
    return this.children.length === 0;
  }

  public getChild(token: string): TrieNode|null {
    const index = this.children.map(t => t.token).indexOf(token);
    if (index === -1) {
      return null;
    } else {
      return this.children[index].node;
    }
  }

  public getPredictions(): TokenCandidate[] {
    if (this.children.length === 0) {
      return [];
    }
    let totalCount = 0;
    this.children.forEach(child => {
      totalCount += child.count;
    });
    const output = this.children.map((child, i) => ({
                                       token: child.token,
                                       score: child.count / totalCount,
                                     }));
    // Sort in descending order of score and then ascending order of token.
    output.sort((a: TokenCandidate, b: TokenCandidate) => {
      if (a.score > b.score) {
        return -1;
      } else if (a.score < b.score) {
        return 1;
      } else {
        if (a.token > b.token) {
          return 1;
        } else if (a.token < b.token) {
          return -1;
        } else {
          return 0;
        }
      }
    });
    return output;
  }

  public get hasChildren(): boolean {
    return this.children.length > 0;
  }

  public serializeToObject(): {[token: string]: any} {
    if (this.children.length === 0) {
      return {};
    }
    const output: {[token: string]: any} = {};
    this.children.forEach(child => {
      output[child.token] = {
        count: child.count,
      };
      if (child.node.hasChildren) {
        output[child.token][CHILDREN_KEY] = child.node.serializeToObject();
      }
    });
    return output;
  }

  public deserialize(object: {[token: string]: any}) {
    this.children.splice(0);
    for (const token in object) {
      const child = {
        token,
        count: object[token].count as number,
        node: new TrieNode(),
      };
      if (object[token][CHILDREN_KEY]) {
        child.node.deserialize(object[token][CHILDREN_KEY]);
      }
      this.children.push(child);
    }
  }
}

export class Trie {
  private root: TrieNode = new TrieNode();

  constructor() {}

  /**
   * Insert a sequence to the trie.
   * @param sequence A sequence of units. Typically a sequence of words.
   */
  public insert(sequence: string[]) {
    if (sequence.length > SEQUENCE_LENGTH_LIMIT) {
      sequence = sequence.slice(0, SEQUENCE_LENGTH_LIMIT);
    }
    this.root.insert(sequence);
  }

  /**
   * Query the try for the next token.
   *
   * @param prefix: A list of string tokens as the prefix.
   * @returns The candidates, sorted in descending order the candidates' scores.
   *   The scores are determined by count (frequency). In case of tie in the
   *   scores, the candidates are sorted in alphabetical order.
   */
  public query(prefix: string[]): TokenCandidate[] {
    let node: TrieNode|null = this.root;
    let i = 0;
    while (!node.isLeaf && i < prefix.length) {
      const childNode = node.getChild(prefix[i]);
      i++;
      node = childNode;
      if (!node) {
        break;
      }
    }
    if (node) {
      return node.getPredictions();
    } else {
      return [];
    }
  }

  private serializeToObject(): {[key: string]: any} {
    const output: {[key: string]: any} = {};
    output[TRIE_ROOT_KEY] = this.root.serializeToObject();
    return output;
  }

  /** Serialize the entire Trie to a JSON parsable string. */
  public serialize(): string {
    return JSON.stringify(this.serializeToObject());
  }

  /** Deserialize trie from a serialized form. */
  public static deserialize(serialized: string): Trie {
    const trie = new Trie();
    const parsed = JSON.parse(serialized);
    trie.root = new TrieNode();
    trie.root.deserialize(parsed[TRIE_ROOT_KEY]);
    return trie;
  }
}
