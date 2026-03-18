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
  '>>>=',
  '===',
  '!==',
  '>>>',
  '<<=',
  '>>=',
  '**=',
  '&&=',
  '||=',
  '??=',
  '=>',
  '?.',
  '...',
  '++',
  '--',
  '**',
  '<<',
  '>>',
  '<=',
  '>=',
  '==',
  '!=',
  '&&',
  '||',
  '??',
  '+=',
  '-=',
  '*=',
  '/=',
  '%=',
  '&=',
  '|=',
  '^='
];

const MERGE_OPS = new Set(MULTI_OPS);
const OPS_BY_LENGTH = [...MULTI_OPS].sort((a, b) => b.length - a.length);
const REGEX_PREFIX_KEYWORDS = new Set([
  'return',
  'throw',
  'case',
  'else',
  'do',
  'yield',
  'await',
  'typeof',
  'void',
  'delete',
  'new',
  'in',
  'of'
]);
const REGEX_DISALLOW_AFTER_OP = new Set([')', ']', '}', '++', '--']);

function readRegexLiteral(input: string, start: number): { value: string; end: number } {
  const len = input.length;
  let i = start + 1;
  let inClass = false;
  while (i < len) {
    const ch = input[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '[') {
      inClass = true;
      i++;
      continue;
    }
    if (ch === ']' && inClass) {
      inClass = false;
      i++;
      continue;
    }
    if (ch === '/' && !inClass) {
      i++;
      break;
    }
    i++;
  }
  while (i < len) {
    const c = input[i];
    if (!c) break;
    const code = c.charCodeAt(0);
    const isLetter = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (!isLetter) break;
    i++;
  }
  return { value: input.slice(start, i), end: i };
}

function readTemplateLiteral(input: string, start: number): { value: string; end: number } {
  const len = input.length;
  let i = start + 1;
  while (i < len) {
    const ch = input[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '`') {
      i++;
      break;
    }
    if (ch === '$' && input[i + 1] === '{') {
      i += 2;
      let depth = 1;
      while (i < len && depth > 0) {
        const c = input[i];
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '"' || c === "'") {
          const quoted = readQuoted(input, i, i);
          i = quoted.end;
          continue;
        }
        if (c === '`') {
          const nested = readTemplateLiteral(input, i);
          i = nested.end;
          continue;
        }
        if (c === '/' && input[i + 1] === '/') {
          i += 2;
          while (i < len && input[i] !== '\n' && input[i] !== '\r') i++;
          continue;
        }
        if (c === '/' && input[i + 1] === '*') {
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
        if (c === '{') {
          depth++;
          i++;
          continue;
        }
        if (c === '}') {
          depth--;
          i++;
          continue;
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return { value: input.slice(start, i), end: i };
}

function isRegexStart(prev: Token | null): boolean {
  if (!prev) return true;
  if (prev.type === 'ident') return REGEX_PREFIX_KEYWORDS.has(prev.value);
  if (prev.type === 'number' || prev.type === 'literal') return false;
  if (prev.type === 'op') return !REGEX_DISALLOW_AFTER_OP.has(prev.value);
  return true;
}

export function minifyJavascript(input: string): string {
  const emitter = createEmitter(
    makeNeedsSpace({
      isWordChar: (ch: string | undefined) => isWordChar(ch, true),
      mergeOps: MERGE_OPS
    })
  );
  const len = input.length;
  let i = 0;
  let prevToken: Token | null = null;

  function emit(token: Token): void {
    emitter.emitToken(token);
    prevToken = token;
  }

  while (i < len) {
    const ch = input[i];

    if (isWhitespace(ch)) {
      i++;
      continue;
    }

    if (ch === '/' && input[i + 1] === '/') {
      i += 2;
      while (i < len && input[i] !== '\n' && input[i] !== '\r') i++;
      continue;
    }

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

    if (ch === '`') {
      const literal = readTemplateLiteral(input, i);
      emit({ type: 'literal', value: literal.value });
      i = literal.end;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const literal = readQuoted(input, i, i);
      emit({ type: 'literal', value: literal.value });
      i = literal.end;
      continue;
    }

    if (ch === '/' && input[i + 1] !== '/' && input[i + 1] !== '*' && isRegexStart(prevToken)) {
      const literal = readRegexLiteral(input, i);
      emit({ type: 'literal', value: literal.value });
      i = literal.end;
      continue;
    }

    if (isIdStart(ch, true)) {
      let j = i + 1;
      while (j < len && isIdPart(input[j], true)) j++;
      emit({ type: 'ident', value: input.slice(i, j) });
      i = j;
      continue;
    }

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
        if (c === 'e' || c === 'E') {
          allowSign = true;
          j++;
          continue;
        }
        if ((c === '+' || c === '-') && allowSign) {
          allowSign = false;
          j++;
          continue;
        }
        if (isIdStart(c, true)) {
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

    const op = matchOperator(input, i, OPS_BY_LENGTH);
    emit({ type: 'op', value: op });
    i += op.length;
  }

  return emitter.toString();
}
