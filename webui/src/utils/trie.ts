/** Trie data structure. */

export interface TokenCandidate {
  token: string;
  count: number;
}

class TrieNode {
  // A TrieNode without any children is a leaf node.
  private children: string[] = [];
  private childNodes: Array<TrieNode> = [];
  private counts: number[] = [];

  /**
   * Constructor for TrieNode.
   *
   * @param node The string for the current node, the special token '' is used
   *     to indicate the root of the Trie.
   */
  constructor() {
    // this.token = node;  // TODO(cais): Clean up.
  }

  public insert(tokens: string[]) {
    if (tokens.length === 0) {
      throw new Error('Cannot insert empty tokens');
    }
    const childIndex = this.children.indexOf(tokens[0]);
    let childNode: TrieNode;
    if (childIndex === -1) {
      childNode = new TrieNode();
      this.children.push(tokens[0]);
      this.childNodes.push(childNode);
      this.counts.push(1);
    } else {  // Child node already exists.
      this.counts[childIndex]++;
      childNode = this.childNodes[childIndex];
    }
    if (tokens.length > 1) {
      childNode!.insert(tokens.slice(1));
    }
  }

  public get isLeaf(): boolean {
    return this.children.length === 0;
  }

  public getChild(token: string): TrieNode|null {
    const index = this.children.indexOf(token);
    if (index === -1) {
      return null;
    } else {
      return this.childNodes[index];
    }
  }

  public getPredictions(): TokenCandidate[] {
    if (this.children.length === 0) {
      return [];
    }
    const totalCount = this.counts.reduce((c, p) => c + p);
    const output = this.children.map((token, i) => ({
                                       token,
                                       count: this.counts[i] / totalCount,
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
}

export class Trie {
  private readonly root: TrieNode = new TrieNode();

  constructor() {}

  /**
   * Insert a sequence to the trie.
   * @param sequence A sequence of units. Typically a sequence of words.
   */
  public insert(sequence: string[]) {
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
}