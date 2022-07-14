/** Trie data structure. */

const TRIE_ROOT_KEY = '__trie__';
const CHILD_KEY = '__children__';
const SEQUENCE_LENGTH_LIMIT = 50;

export interface TokenCandidate {
  token: string;
  count: number;
}

class TrieNode {
  // A TrieNode without any children is a leaf node.
  private children: Array<{token: string; node: TrieNode; count: number;}> = [];

  /**
   * Constructor for TrieNode.
   *
   * @param node The string for the current node, the special token '' is used
   *     to indicate the root of the Trie.
   */
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
      // this.childNodes.push(childNode);
      // this.counts.push(1);
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
                                       count: child.count / totalCount,
                                     }));
    // Sort in descending order.
    output.sort((a: TokenCandidate, b: TokenCandidate) => {
      if (a.count > b.count) {
        return -1;
      } else if (a.count < b.count) {
        return 1;
      } else {
        if (a.token > b.token) {
          return -1;
        } else if (a.token < b.token) {
          return 1;
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
      }
      if (child.node.hasChildren) {
        output[child.token][CHILD_KEY] = child.node.serializeToObject();
      }
    });
    return output;
  }
}

export class Trie {
  private readonly root: TrieNode = new TrieNode();

  constructor() {}

  /**
   * Insert a sequence to the trie.
   * @param sequence A sequence of units. Typically a sequence of words.
   */
  public insert(sequence: string[]) {
    // TODO(cais): Add length limit.
    this.root.insert(sequence);
  }

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
}
