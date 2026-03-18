export type TokenType = 'literal' | 'ident' | 'number' | 'op';

export type Token = {
  type: TokenType;
  value: string;
};

export type NeedsSpace = (prev: Token, next: Token) => boolean;

export type MinifyEmitter = {
  emitToken: (token: Token) => void;
  emitNewline: () => void;
  emitRaw: (raw: string) => void;
  toString: () => string;
};

export function createEmitter(needsSpace: NeedsSpace): MinifyEmitter {
  let out = '';
  let prev: Token | null = null;

  return {
    emitToken(token: Token): void {
      if (!token || !token.value) return;
      if (prev && needsSpace(prev, token)) out += ' ';
      out += token.value;
      prev = token;
    },
    emitNewline(): void {
      if (out.length > 0 && out[out.length - 1] !== '\n') {
        out += '\n';
      }
      prev = null;
    },
    emitRaw(raw: string): void {
      if (!raw) return;
      out += raw;
    },
    toString(): string {
      return out;
    }
  };
}

export function makeNeedsSpace(options: {
  isWordChar: (ch: string | undefined) => boolean;
  mergeOps: Set<string>;
}): NeedsSpace {
  return (prev: Token, next: Token): boolean => {
    const a = prev.value;
    const b = next.value;
    if (!a || !b) return false;

    const aLast = a[a.length - 1];
    const bFirst = b[0];

    if (options.isWordChar(aLast) && options.isWordChar(bFirst)) return true;
    if (options.mergeOps.has(a + b)) return true;
    if (a === '/' && (bFirst === '/' || bFirst === '*')) return true;
    if (aLast === '.' && bFirst === '.') return true;

    return false;
  };
}
