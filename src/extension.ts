/* eslint-disable no-control-regex */
import * as vscode from 'vscode';

type Token = { type: 'literal' | 'ident' | 'number' | 'op'; value: string };

const MULTI_OPS = [
  '>>=', '<<=', '->*', '...', '##',
  '++', '--', '->', '<<', '>>', '<=', '>=', '==', '!=',
  '&&', '||', '+=', '-=', '*=', '/=', '%=', '^=', '&=', '|=',
  '::', '.*'
];

const MERGE_OPS = new Set(MULTI_OPS);
const OPS_BY_LENGTH = [...MULTI_OPS].sort((a, b) => b.length - a.length);

function isWhitespace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\v' || ch === '\f';
}

function isIdStart(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return ch === '_' || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isIdPart(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return isIdStart(ch) || (code >= 48 && code <= 57);
}

function isDigit(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return ch === '_' || (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function matchOperator(input: string, i: number): string {
  for (const op of OPS_BY_LENGTH) {
    if (input.startsWith(op, i)) return op;
  }
  return input[i] ?? '';
}

function readRawString(input: string, start: number, prefixLen: number): { value: string; end: number } | null {
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

function readQuoted(input: string, start: number, quoteIndex: number): { value: string; end: number } {
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

function needsSpace(prev: Token | null, next: Token | null): boolean {
  if (!prev || !next) return false;
  const a = prev.value;
  const b = next.value;
  if (!a || !b) return false;

  const aLast = a[a.length - 1];
  const bFirst = b[0];

  if (isWordChar(aLast) && isWordChar(bFirst)) return true;
  if (MERGE_OPS.has(a + b)) return true;
  if (a === '/' && (b === '/' || b === '*')) return true;
  if (aLast === '.' && bFirst === '.') return true;

  return false;
}

export function minifyCpp(input: string): string {
  const len = input.length;
  let out = '';
  let i = 0;
  let prevToken: Token | null = null;
  let atLineStart = true;
  let inPreprocessor = false;
  let lastNonWsOnLine: string | null = null;
  let sawWsAfterLastNonWs = false;

  function ensureLineStart(): void {
    if (out.length > 0 && out[out.length - 1] !== '\n') {
      out += '\n';
    }
    prevToken = null;
  }

  function emit(token: Token): void {
    if (!token || !token.value) return;
    if (prevToken && needsSpace(prevToken, token)) out += ' ';
    out += token.value;
    prevToken = token;
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
            out += ' ';
          }
          out += '\n';
          prevToken = null;
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
    const op = matchOperator(input, i);
    emit({ type: 'op', value: op });
    i += op.length;
  }

  return out;
}

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('codeGolf.minifyCpp', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('Code Golf: No active editor.');
      return;
    }

    const doc = editor.document;
    const original = doc.getText();
    const minified = minifyCpp(original);

    if (minified === original) {
      vscode.window.showInformationMessage('Code Golf: No changes needed.');
      return;
    }

    const fullRange = new vscode.Range(
      doc.positionAt(0),
      doc.positionAt(original.length)
    );

    await editor.edit(editBuilder => {
      editBuilder.replace(fullRange, minified);
    });
  });

  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
