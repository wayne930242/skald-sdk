// packages/dice/src/macro/body-parser.ts
//
// Parses a macro body DSL source string into a MacroStatement[] AST.
// Grammar:
//   Statement   := IfStatement | AssignStatement | RollStatement | ReturnStatement
//   IfStatement := "if" "(" Expr ")" Block ("elif" "(" Expr ")" Block)* ("else" Block)?
//   Block       := "{" Statement* "}"
//   AssignStatement := ("@" Identifier | "@" "(" Expr ")") ":=" Expr ";"
//   RollStatement    := "roll" "(" StringLiteral ")" ";"
//   ReturnStatement  := "return" ("roll" "(" StringLiteral ")" | Expr) ";"
// Expr is parsed by the existing formula grammar (parseFormula) — this file
// only tokenizes statement-level structure and hands expression substrings
// off whole.

import { parseFormula } from "../formula/parser";
import type { MacroStatement, MacroWriteTarget } from "./types";

export class MacroParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MacroParseError";
  }
}

/** Macro bodies must never reference another macro — this is the loop-prevention mechanism (D3). */
const MACRO_REFERENCE_PATTERN = /\{\{#[a-zA-Z_]/;

interface Cursor {
  s: string;
  i: number;
}

function skipWs(c: Cursor): void {
  while (c.i < c.s.length && /\s/.test(c.s[c.i])) c.i++;
}

function atEnd(c: Cursor): boolean {
  skipWs(c);
  return c.i >= c.s.length;
}

function peekKeyword(c: Cursor, kw: string): boolean {
  skipWs(c);
  if (!c.s.startsWith(kw, c.i)) return false;
  const next = c.s[c.i + kw.length];
  return next === undefined || !/[a-zA-Z0-9_]/.test(next);
}

function consumeKeyword(c: Cursor, kw: string): void {
  skipWs(c);
  c.i += kw.length;
}

function consumeChar(c: Cursor, ch: string): void {
  skipWs(c);
  if (c.s[c.i] !== ch) {
    throw new MacroParseError(
      `Expected '${ch}' at position ${c.i}, got "${c.s.slice(c.i, c.i + 20)}"`,
    );
  }
  c.i++;
}

/** Scans a balanced `( ... )`, returning the inner content (parens consumed) */
function scanParen(c: Cursor): string {
  consumeChar(c, "(");
  const start = c.i;
  let depth = 1;
  while (c.i < c.s.length && depth > 0) {
    const ch = c.s[c.i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "'" || ch === '"') {
      const quote = ch;
      c.i++;
      while (c.i < c.s.length && c.s[c.i] !== quote) c.i++;
    }
    if (depth > 0) c.i++;
  }
  const content = c.s.slice(start, c.i);
  consumeChar(c, ")");
  return content;
}

/** Scans a balanced `{ ... }`, returning the inner content (braces consumed) */
function scanBrace(c: Cursor): string {
  consumeChar(c, "{");
  const start = c.i;
  let depth = 1;
  while (c.i < c.s.length && depth > 0) {
    const ch = c.s[c.i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === "'" || ch === '"') {
      const quote = ch;
      c.i++;
      while (c.i < c.s.length && c.s[c.i] !== quote) c.i++;
    }
    if (depth > 0) c.i++;
  }
  const content = c.s.slice(start, c.i);
  consumeChar(c, "}");
  return content;
}

function scanStringLiteral(c: Cursor): string {
  skipWs(c);
  const quote = c.s[c.i];
  if (quote !== '"' && quote !== "'") {
    throw new MacroParseError(`Expected a string literal at position ${c.i}`);
  }
  consumeChar(c, quote);
  const start = c.i;
  while (c.i < c.s.length && c.s[c.i] !== quote) c.i++;
  const content = c.s.slice(start, c.i);
  consumeChar(c, quote);
  return content;
}

/** Scans up to (and consumes) the next top-level ';' */
function scanUntilSemicolon(c: Cursor): string {
  skipWs(c);
  const start = c.i;
  let depth = 0;
  while (c.i < c.s.length) {
    const ch = c.s[c.i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "'" || ch === '"') {
      const quote = ch;
      c.i++;
      while (c.i < c.s.length && c.s[c.i] !== quote) c.i++;
    } else if (ch === ";" && depth === 0) {
      break;
    }
    c.i++;
  }
  const content = c.s.slice(start, c.i).trim();
  consumeChar(c, ";");
  return content;
}

function parseCondition(c: Cursor) {
  const src = scanParen(c);
  const ast = parseFormula(src);
  if (!ast) throw new MacroParseError(`Invalid condition: ${src}`);
  return ast;
}

function parseBlock(c: Cursor): MacroStatement[] {
  const src = scanBrace(c);
  return parseStatements({ s: src, i: 0 });
}

function parseRollTemplate(c: Cursor): string {
  consumeKeyword(c, "roll");
  skipWs(c);
  consumeChar(c, "(");
  const template = scanStringLiteral(c);
  skipWs(c);
  consumeChar(c, ")");
  return template;
}

function parseIf(c: Cursor): MacroStatement {
  consumeKeyword(c, "if");
  const condition = parseCondition(c);
  const body = parseBlock(c);
  const branches: Array<{ condition: ReturnType<typeof parseCondition>; body: MacroStatement[] }> = [
    { condition, body },
  ];
  let elseBody: MacroStatement[] | undefined;

  for (;;) {
    if (peekKeyword(c, "elif")) {
      consumeKeyword(c, "elif");
      const elifCondition = parseCondition(c);
      const elifBody = parseBlock(c);
      branches.push({ condition: elifCondition, body: elifBody });
      continue;
    }
    if (peekKeyword(c, "else")) {
      consumeKeyword(c, "else");
      elseBody = parseBlock(c);
    }
    break;
  }

  return { kind: "if", branches, elseBody };
}

function parseWriteTarget(c: Cursor): MacroWriteTarget {
  consumeChar(c, "@");
  skipWs(c);
  if (c.s[c.i] === "(") {
    const src = scanParen(c);
    const ast = parseFormula(src);
    if (!ast) throw new MacroParseError(`Invalid write target expression: ${src}`);
    return { kind: "dynamic", expr: ast };
  }
  const start = c.i;
  while (c.i < c.s.length && /[\w.]/.test(c.s[c.i])) c.i++;
  const name = c.s.slice(start, c.i);
  if (!name) throw new MacroParseError(`Expected field name after '@' at position ${c.i}`);
  return { kind: "static", field: name };
}

function parseAssign(c: Cursor): MacroStatement {
  const target = parseWriteTarget(c);
  skipWs(c);
  if (c.s.slice(c.i, c.i + 2) !== ":=") {
    throw new MacroParseError(`Expected ':=' at position ${c.i}`);
  }
  c.i += 2;
  const exprSrc = scanUntilSemicolon(c);
  const expr = parseFormula(exprSrc);
  if (!expr) throw new MacroParseError(`Invalid assignment value: ${exprSrc}`);
  return { kind: "assign", target, expr };
}

function parseRollStatement(c: Cursor): MacroStatement {
  const template = parseRollTemplate(c);
  skipWs(c);
  consumeChar(c, ";");
  return { kind: "roll", template };
}

function parseReturn(c: Cursor): MacroStatement {
  consumeKeyword(c, "return");
  skipWs(c);
  if (peekKeyword(c, "roll")) {
    const template = parseRollTemplate(c);
    skipWs(c);
    consumeChar(c, ";");
    return { kind: "return", value: { kind: "roll", template } };
  }
  const exprSrc = scanUntilSemicolon(c);
  const expr = parseFormula(exprSrc);
  if (!expr) throw new MacroParseError(`Invalid return expression: ${exprSrc}`);
  return { kind: "return", value: { kind: "expr", expr } };
}

function parseStatement(c: Cursor): MacroStatement {
  skipWs(c);
  if (peekKeyword(c, "if")) return parseIf(c);
  if (peekKeyword(c, "return")) return parseReturn(c);
  if (peekKeyword(c, "roll")) return parseRollStatement(c);
  if (c.s[c.i] === "@") return parseAssign(c);

  if (peekKeyword(c, "for") || peekKeyword(c, "while")) {
    throw new MacroParseError(
      "Loop constructs (for/while) are not supported in macro bodies.",
    );
  }
  if (peekKeyword(c, "switch")) {
    throw new MacroParseError(
      "switch/case is not supported in macro bodies — use if/elif/else.",
    );
  }

  throw new MacroParseError(
    `Unexpected token at position ${c.i}: "${c.s.slice(c.i, c.i + 20)}"`,
  );
}

function parseStatements(c: Cursor): MacroStatement[] {
  const statements: MacroStatement[] = [];
  while (!atEnd(c)) {
    statements.push(parseStatement(c));
  }
  return statements;
}

/**
 * Parse a macro body source string into a statement AST.
 * Throws MacroParseError on any syntax error, unsupported construct
 * (loops, switch/case), or macro-to-macro reference.
 */
export function parseMacroBody(source: string): MacroStatement[] {
  if (MACRO_REFERENCE_PATTERN.test(source)) {
    throw new MacroParseError(
      "Macro bodies may not reference another macro ({{#...}}) — this would allow constructing a loop through indirection.",
    );
  }
  return parseStatements({ s: source, i: 0 });
}
