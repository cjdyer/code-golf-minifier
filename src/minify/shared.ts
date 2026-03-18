export function isWhitespace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\v' || ch === '\f';
}

export function isDigit(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return code >= 48 && code <= 57;
}

export function isIdStart(ch: string | undefined, allowDollar = false): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (allowDollar && ch === '$') return true;
  return ch === '_' || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

export function isIdPart(ch: string | undefined, allowDollar = false): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return isIdStart(ch, allowDollar) || (code >= 48 && code <= 57);
}

export function isWordChar(ch: string | undefined, allowDollar = false): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  if (allowDollar && ch === '$') return true;
  return (
    ch === '_' ||
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

export function matchOperator(input: string, i: number, opsByLength: string[]): string {
  for (const op of opsByLength) {
    if (input.startsWith(op, i)) return op;
  }
  return input[i] ?? '';
}

export function readQuoted(
  input: string,
  start: number,
  quoteIndex: number
): { value: string; end: number } {
  const len = input.length;
  const quote = input[quoteIndex];
  let i = quoteIndex + 1;
  while (i < len) {
    const ch = input[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) {
      i++;
      break;
    }
    i++;
  }
  return { value: input.slice(start, i), end: i };
}
