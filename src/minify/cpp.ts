/* eslint-disable no-control-regex */
import { createEmitter, makeNeedsSpace, Token } from './core';
import {
  isDigit,
  isIdPart,
  isIdStart,
  isWhitespace,
  isWordChar,
  matchOperator,
  readQuoted
} from './shared';

const MULTI_OPS = [
  '>>=',
  '<<=',
  '->*',
  '...',
  '##',
  '++',
  '--',
  '->',
  '<<',
  '>>',
  '<=',
  '>=',
  '==',
  '!=',
  '&&',
  '||',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '^=',
  '&=',
  '|=',
  '::',
  '.*'
];

const MERGE_OPS = new Set(MULTI_OPS);
const OPS_BY_LENGTH = [...MULTI_OPS].sort((a, b) => b.length - a.length);

function readRawString(
  input: string,
  start: number,
  prefixLen: number
): { value: string; end: number } | null {
  const len = input.length;
  let i = start + prefixLen; // positioned after R"
  const delimStart = i;
  while (i < len && input[i] !== '(') i++;
  if (i >= len) return null;
  const delim = input.slice(delimStart, i);
  const closeSeq = ')' + delim + '"';
  const bodyStart = i + 1;
  const closeIndex = input.indexOf(closeSeq, bodyStart);
  if (closeIndex === -1) {
    return { value: input.slice(start), end: len };
  }
  const end = closeIndex + closeSeq.length;
  return { value: input.slice(start, end), end };
}

function tryReadLiteral(input: string, i: number): { value: string; end: number } | null {
  if (input.startsWith('u8R"', i)) return readRawString(input, i, 4);
  if (input.startsWith('uR"', i)) return readRawString(input, i, 3);
  if (input.startsWith('UR"', i)) return readRawString(input, i, 3);
  if (input.startsWith('LR"', i)) return readRawString(input, i, 3);
  if (input.startsWith('R"', i)) return readRawString(input, i, 2);

  if (input.startsWith('u8"', i)) return readQuoted(input, i, i + 2);
  if (input.startsWith('u"', i)) return readQuoted(input, i, i + 1);
  if (input.startsWith('U"', i)) return readQuoted(input, i, i + 1);
  if (input.startsWith('L"', i)) return readQuoted(input, i, i + 1);
  if (input.startsWith("u'", i)) return readQuoted(input, i, i + 1);
  if (input.startsWith("U'", i)) return readQuoted(input, i, i + 1);
  if (input.startsWith("L'", i)) return readQuoted(input, i, i + 1);

  if (input[i] === '"' || input[i] === "'") {
    return readQuoted(input, i, i);
  }

  return null;
}

export function minifyCpp(input: string): string {
  const emitter = createEmitter(makeNeedsSpace({ isWordChar, mergeOps: MERGE_OPS }));
  const len = input.length;
  let i = 0;
  let atLineStart = true;
  let inPreprocessor = false;
  let lastNonWsOnLine: string | null = null;
  let sawWsAfterLastNonWs = false;

  function ensureLineStart(): void {
    emitter.emitNewline();
  }

  function emit(token: Token): void {
    if (!token || !token.value) return;
    emitter.emitToken(token);
    atLineStart = false;
    if (inPreprocessor) {
      lastNonWsOnLine = token.value[token.value.length - 1];
      sawWsAfterLastNonWs = false;
    }
  }

  while (i < len) {
    const ch = input[i];

    // Handle whitespace
    if (isWhitespace(ch)) {
      if (ch === '\r' || ch === '\n') {
        // Normalize CRLF to a single newline event
        if (ch === '\r' && input[i + 1] === '\n') i++;

        if (inPreprocessor) {
          if (lastNonWsOnLine === '\\' && sawWsAfterLastNonWs) {
            emitter.emitRaw(' ');
          }
          emitter.emitNewline();
          if (lastNonWsOnLine === '\\' && !sawWsAfterLastNonWs) {
            inPreprocessor = true;
          } else {
            inPreprocessor = false;
          }
          lastNonWsOnLine = null;
          sawWsAfterLastNonWs = false;
        }
        atLineStart = true;
        i++;
        continue;
      }

      if (inPreprocessor && lastNonWsOnLine !== null) {
        sawWsAfterLastNonWs = true;
      }
      i++;
      continue;
    }

    // Line comment
    if (ch === '/' && input[i + 1] === '/') {
      i += 2;
      while (i < len && input[i] !== '\n' && input[i] !== '\r') i++;
      continue;
    }

    // Block comment
    if (ch === '/' && input[i + 1] === '*') {
      i += 2;
      while (i < len) {
        if (input[i] === '*' && input[i + 1] === '/') {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }

    // Preprocessor directive detection
    if (atLineStart && ch === '#') {
      ensureLineStart();
      inPreprocessor = true;
    }

    // String / char / raw string literals
    const literal = tryReadLiteral(input, i);
    if (literal) {
      emit({ type: 'literal', value: literal.value });
      i = literal.end;
      continue;
    }

    // Identifier / keyword
    if (isIdStart(ch)) {
      let j = i + 1;
      while (j < len && isIdPart(input[j])) j++;
      emit({ type: 'ident', value: input.slice(i, j) });
      i = j;
      continue;
    }

    // Number literal
    if (isDigit(ch) || (ch === '.' && isDigit(input[i + 1]))) {
      let j = i + 1;
      let allowSign = false;
      while (j < len) {
        const c = input[j];
        if (!c) break;
        if (isDigit(c) || c === '.' || c === '_' || c === "'") {
          allowSign = false;
          j++;
          continue;
        }
        if (c === 'e' || c === 'E' || c === 'p' || c === 'P') {
          allowSign = true;
          j++;
          continue;
        }
        if ((c === '+' || c === '-') && allowSign) {
          allowSign = false;
          j++;
          continue;
        }
        if (isIdStart(c)) {
          allowSign = false;
          j++;
          continue;
        }
        break;
      }
      emit({ type: 'number', value: input.slice(i, j) });
      i = j;
      continue;
    }

    // Operators / punctuators / misc single-char tokens
    const op = matchOperator(input, i, OPS_BY_LENGTH);
    emit({ type: 'op', value: op });
    i += op.length;
  }

  return emitter.toString();
}
