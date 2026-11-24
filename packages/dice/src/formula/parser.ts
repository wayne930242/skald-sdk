/**
 * 公式語法解析器
 *
 * 語法規則：
 * - {{@ATTR}}             引用屬性（STR, DEX, EDU 等）
 * - {{@ATTR * 4}}         乘法
 * - {{@ATTR / 2}}         除法（預設 floor）
 * - {{@ATTR /ceil 2}}     向上取整除法
 * - {{@ATTR /floor 2}}    向下取整除法（同 /）
 * - {{@STR + @SIZ}}       加法
 * - {{@STR - 10}}         減法
 * - {{(@STR + @SIZ) / 10}}  複合運算
 * - {{max(@STR, @DEX)}}   取最大
 * - {{min(@STR, @DEX)}}   取最小
 * - {{half(@DEX)}}        等同 {{@DEX /floor 2}}
 * - {{fifth(@POW)}}       等同 {{@POW /floor 5}}
 * - {{if(@A > @B, @A, @B)}}  條件判斷
 * - {{lookup(@STR + @SIZ, 'damage-bonus')}}  查表
 */

export type FormulaToken =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "attr"; name: string }
  | {
      type: "op";
      op:
        | "+"
        | "-"
        | "*"
        | "/"
        | "/ceil"
        | "/floor"
        | "<"
        | ">"
        | "<="
        | ">="
        | "=="
        | "!="
        | "&&"
        | "||";
    }
  | { type: "func"; name: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" };

export interface FormulaAST {
  type:
    | "number"
    | "string"
    | "attr"
    | "binary"
    | "unary"
    | "func"
    | "conditional"
    | "excel";
  value?: number | string;
  name?: string;
  op?: string;
  left?: FormulaAST;
  right?: FormulaAST;
  args?: FormulaAST[];
  condition?: FormulaAST;
  trueExpr?: FormulaAST;
  falseExpr?: FormulaAST;
}

import type { LookupResolver } from "./lookup-resolver";
export type ExcelFormulaEvaluator = (
  formula: string,
  context: Record<string, number>,
) => number | string | boolean;

// 屬性名稱對照
const ATTR_ALIASES: Record<string, string> = {
  STR: "str",
  CON: "con",
  SIZ: "siz",
  DEX: "dex",
  APP: "app",
  INT: "int",
  POW: "pow",
  EDU: "edu",
  LUCK: "luck",
  力量: "str",
  體質: "con",
  體型: "siz",
  敏捷: "dex",
  外貌: "app",
  智力: "int",
  意志: "pow",
  教育: "edu",
  幸運: "luck",
};

// External lookup resolver (set by system loader)
let externalLookupResolver: LookupResolver | null = null;
let externalExcelEvaluator: ExcelFormulaEvaluator | null = null;

export type FormulaEvaluationErrorCategory =
  | "runtime_unavailable"
  | "evaluation_error"
  | "reference_not_found"
  | "divide_by_zero"
  | "type_mismatch"
  | "lookup_not_found"
  | "function_not_allowed";

export class FormulaEvaluationError extends Error {
  constructor(
    public readonly category: FormulaEvaluationErrorCategory,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "FormulaEvaluationError";
  }
}

function numericArgument(
  functionName: string,
  args: Array<number | string | boolean>,
  index = 0,
): number {
  const value = args[index];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new FormulaEvaluationError(
    "type_mismatch",
    `${functionName} requires a numeric argument at position ${index + 1}.`,
  );
}

/**
 * Set an external lookup resolver for the formula evaluator.
 * Pass null to clear and use only builtin tables.
 */
export function setLookupResolver(resolver: LookupResolver | null): void {
  externalLookupResolver = resolver;
}

/**
 * Set an external Excel formula evaluator.
 * Typical usage: wire this to a HyperFormula-backed evaluator.
 */
export function setExcelFormulaEvaluator(
  evaluator: ExcelFormulaEvaluator | null,
): void {
  externalExcelEvaluator = evaluator;
}

/**
 * 將舊格式轉換為新的標記語法
 */
export function convertToFormulaMarkup(input: string): string {
  if (!input || typeof input !== "string") return String(input);

  const result = input.trim();

  // 已經是標記格式
  if (result.startsWith("{{") && result.endsWith("}}")) {
    return result;
  }

  // 純數字
  if (/^\d+$/.test(result)) {
    return result;
  }

  // "DEX / 2" 格式
  const divMatch = result.match(/^(\w+)\s*\/\s*(\d+)$/);
  if (divMatch) {
    const attr =
      ATTR_ALIASES[divMatch[1].toUpperCase()] || divMatch[1].toLowerCase();
    return `{{@${attr} /floor ${divMatch[2]}}}`;
  }

  // "EDU x4" 或 "EDU x 4" 或 "EDU×4" 格式
  const mulMatch = result.match(/^(\w+)\s*[x×\*]\s*(\d+)$/i);
  if (mulMatch) {
    const attr =
      ATTR_ALIASES[mulMatch[1].toUpperCase()] || mulMatch[1].toLowerCase();
    return `{{@${attr} * ${mulMatch[2]}}}`;
  }

  // "EDU x2 + DEX x2" 格式
  const multiMatch = result.match(
    /^(\w+)\s*[x×\*]\s*(\d+)\s*\+\s*(\w+)\s*[x×\*]\s*(\d+)$/i,
  );
  if (multiMatch) {
    const attr1 =
      ATTR_ALIASES[multiMatch[1].toUpperCase()] || multiMatch[1].toLowerCase();
    const attr2 =
      ATTR_ALIASES[multiMatch[3].toUpperCase()] || multiMatch[3].toLowerCase();
    return `{{@${attr1} * ${multiMatch[2]} + @${attr2} * ${multiMatch[4]}}}`;
  }

  // "EDU x2 + (STR or DEX) x2" 格式 - 選擇性屬性
  const orMatch = result.match(
    /^(\w+)\s*[x×\*]\s*(\d+)\s*\+\s*\((\w+)\s+or\s+(\w+)\)\s*[x×\*]\s*(\d+)$/i,
  );
  if (orMatch) {
    const attr1 =
      ATTR_ALIASES[orMatch[1].toUpperCase()] || orMatch[1].toLowerCase();
    const attr2 =
      ATTR_ALIASES[orMatch[3].toUpperCase()] || orMatch[3].toLowerCase();
    const attr3 =
      ATTR_ALIASES[orMatch[4].toUpperCase()] || orMatch[4].toLowerCase();
    return `{{@${attr1} * ${orMatch[2]} + max(@${attr2}, @${attr3}) * ${orMatch[5]}}}`;
  }

  // "EDU x2 + (STR or DEX)x2" 無空格版本
  const orMatch2 = result.match(
    /^(\w+)\s*[x×\*]\s*(\d+)\s*\+\s*\((\w+)\s+or\s+(\w+)\)[x×\*](\d+)$/i,
  );
  if (orMatch2) {
    const attr1 =
      ATTR_ALIASES[orMatch2[1].toUpperCase()] || orMatch2[1].toLowerCase();
    const attr2 =
      ATTR_ALIASES[orMatch2[3].toUpperCase()] || orMatch2[3].toLowerCase();
    const attr3 =
      ATTR_ALIASES[orMatch2[4].toUpperCase()] || orMatch2[4].toLowerCase();
    return `{{@${attr1} * ${orMatch2[2]} + max(@${attr2}, @${attr3}) * ${orMatch2[5]}}}`;
  }

  // "(STR or DEX) x2" 格式
  const simpleOrMatch = result.match(
    /^\((\w+)\s+or\s+(\w+)\)\s*[x×\*]\s*(\d+)$/i,
  );
  if (simpleOrMatch) {
    const attr1 =
      ATTR_ALIASES[simpleOrMatch[1].toUpperCase()] ||
      simpleOrMatch[1].toLowerCase();
    const attr2 =
      ATTR_ALIASES[simpleOrMatch[2].toUpperCase()] ||
      simpleOrMatch[2].toLowerCase();
    return `{{max(@${attr1}, @${attr2}) * ${simpleOrMatch[3]}}}`;
  }

  // 單純屬性名
  if (/^[A-Za-z]+$/.test(result) && ATTR_ALIASES[result.toUpperCase()]) {
    const attr = ATTR_ALIASES[result.toUpperCase()];
    return `{{@${attr}}}`;
  }

  // 無法解析，返回原值
  return result;
}

/**
 * 詞法分析：將公式字串轉換為 tokens
 */
function tokenize(input: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  let pos = 0;

  while (pos < input.length) {
    const char = input[pos];

    // 空白
    if (/\s/.test(char)) {
      pos++;
      continue;
    }

    // 數字
    if (/\d/.test(char)) {
      let num = "";
      while (pos < input.length && /[\d.]/.test(input[pos])) {
        num += input[pos++];
      }
      tokens.push({ type: "number", value: parseFloat(num) });
      continue;
    }

    // 字串（單引號）
    if (char === "'") {
      let str = "";
      pos++; // 跳過開頭引號
      while (pos < input.length && input[pos] !== "'") {
        str += input[pos++];
      }
      pos++; // 跳過結尾引號
      tokens.push({ type: "string", value: str });
      continue;
    }

    // 屬性引用 @xxx
    if (char === "@") {
      pos++; // 跳過 @
      let name = "";
      while (pos < input.length && /[\w.]/.test(input[pos])) {
        name += input[pos++];
      }
      // 正規化屬性名
      const normalized = ATTR_ALIASES[name.toUpperCase()] || name.toLowerCase();
      tokens.push({ type: "attr", name: normalized });
      continue;
    }

    // 運算子
    if (char === "+") {
      tokens.push({ type: "op", op: "+" });
      pos++;
      continue;
    }
    if (char === "-") {
      tokens.push({ type: "op", op: "-" });
      pos++;
      continue;
    }
    if (char === "*") {
      tokens.push({ type: "op", op: "*" });
      pos++;
      continue;
    }
    if (char === "/") {
      // 檢查是否為 /ceil 或 /floor
      if (input.slice(pos, pos + 5) === "/ceil") {
        tokens.push({ type: "op", op: "/ceil" });
        pos += 5;
        continue;
      }
      if (input.slice(pos, pos + 6) === "/floor") {
        tokens.push({ type: "op", op: "/floor" });
        pos += 6;
        continue;
      }
      tokens.push({ type: "op", op: "/" });
      pos++;
      continue;
    }

    // 比較運算子
    if (char === "<") {
      if (input[pos + 1] === "=") {
        tokens.push({ type: "op", op: "<=" });
        pos += 2;
      } else {
        tokens.push({ type: "op", op: "<" });
        pos++;
      }
      continue;
    }
    if (char === ">") {
      if (input[pos + 1] === "=") {
        tokens.push({ type: "op", op: ">=" });
        pos += 2;
      } else {
        tokens.push({ type: "op", op: ">" });
        pos++;
      }
      continue;
    }
    if (char === "=" && input[pos + 1] === "=") {
      tokens.push({ type: "op", op: "==" });
      pos += 2;
      continue;
    }
    if (char === "!" && input[pos + 1] === "=") {
      tokens.push({ type: "op", op: "!=" });
      pos += 2;
      continue;
    }
    if (char === "&" && input[pos + 1] === "&") {
      tokens.push({ type: "op", op: "&&" });
      pos += 2;
      continue;
    }
    if (char === "|" && input[pos + 1] === "|") {
      tokens.push({ type: "op", op: "||" });
      pos += 2;
      continue;
    }

    // 括號與逗號
    if (char === "(") {
      tokens.push({ type: "lparen" });
      pos++;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rparen" });
      pos++;
      continue;
    }
    if (char === ",") {
      tokens.push({ type: "comma" });
      pos++;
      continue;
    }

    // 函數名或識別符
    if (/[a-zA-Z_]/.test(char)) {
      let name = "";
      while (pos < input.length && /[\w]/.test(input[pos])) {
        name += input[pos++];
      }
      tokens.push({ type: "func", name: name.toLowerCase() });
      continue;
    }

    // 未知字元，跳過
    pos++;
  }

  return tokens;
}

/**
 * 語法分析器
 */
class Parser {
  private tokens: FormulaToken[];
  private pos: number = 0;

  constructor(tokens: FormulaToken[]) {
    this.tokens = tokens;
  }

  private peek(): FormulaToken | undefined {
    return this.tokens[this.pos];
  }

  private consume(): FormulaToken {
    return this.tokens[this.pos++];
  }

  private expect(type: string): FormulaToken {
    const token = this.consume();
    if (token?.type !== type) {
      throw new Error(`Expected ${type}, got ${token?.type}`);
    }
    return token;
  }

  parse(): FormulaAST | null {
    if (this.tokens.length === 0) return null;
    return this.parseExpression();
  }

  private parseExpression(): FormulaAST {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): FormulaAST {
    let left = this.parseLogicalAnd();

    while (
      this.peek()?.type === "op" &&
      (this.peek() as { op: string }).op === "||"
    ) {
      this.consume();
      const right = this.parseLogicalAnd();
      left = { type: "binary", op: "||", left, right };
    }

    return left;
  }

  private parseLogicalAnd(): FormulaAST {
    let left = this.parseComparison();

    while (
      this.peek()?.type === "op" &&
      (this.peek() as { op: string }).op === "&&"
    ) {
      this.consume();
      const right = this.parseComparison();
      left = { type: "binary", op: "&&", left, right };
    }

    return left;
  }

  private parseComparison(): FormulaAST {
    let left = this.parseAddSub();

    const compOps = ["<", ">", "<=", ">=", "==", "!="];
    while (
      this.peek()?.type === "op" &&
      compOps.includes((this.peek() as { op: string }).op)
    ) {
      const op = (this.consume() as { op: string }).op;
      const right = this.parseAddSub();
      left = { type: "binary", op, left, right };
    }

    return left;
  }

  private parseAddSub(): FormulaAST {
    let left = this.parseMulDiv();

    while (
      this.peek()?.type === "op" &&
      ["+", "-"].includes((this.peek() as { op: string }).op)
    ) {
      const op = (this.consume() as { op: string }).op;
      const right = this.parseMulDiv();
      left = { type: "binary", op, left, right };
    }

    return left;
  }

  private parseMulDiv(): FormulaAST {
    let left = this.parseUnary();

    while (
      this.peek()?.type === "op" &&
      ["*", "/", "/ceil", "/floor"].includes((this.peek() as { op: string }).op)
    ) {
      const op = (this.consume() as { op: string }).op;
      const right = this.parseUnary();
      left = { type: "binary", op, left, right };
    }

    return left;
  }

  private parseUnary(): FormulaAST {
    if (
      this.peek()?.type === "op" &&
      (this.peek() as { op: string }).op === "-"
    ) {
      this.consume();
      const expr = this.parseUnary();
      return { type: "unary", op: "-", right: expr };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaAST {
    const token = this.peek();

    if (!token) {
      throw new Error("Unexpected end of expression");
    }

    // 數字
    if (token.type === "number") {
      this.consume();
      return { type: "number", value: token.value };
    }

    // 字串
    if (token.type === "string") {
      this.consume();
      return { type: "string", value: token.value };
    }

    // 屬性
    if (token.type === "attr") {
      this.consume();
      return { type: "attr", name: token.name };
    }

    // 括號
    if (token.type === "lparen") {
      this.consume();
      const expr = this.parseExpression();
      this.expect("rparen");
      return expr;
    }

    // 函數
    if (token.type === "func") {
      return this.parseFunction();
    }

    throw new Error(`Unexpected token: ${token.type}`);
  }

  private parseFunction(): FormulaAST {
    const nameToken = this.consume() as { type: "func"; name: string };
    const name = nameToken.name;

    this.expect("lparen");
    const args: FormulaAST[] = [];

    if (this.peek()?.type !== "rparen") {
      args.push(this.parseExpression());
      while (this.peek()?.type === "comma") {
        this.consume();
        args.push(this.parseExpression());
      }
    }

    this.expect("rparen");

    // 特殊處理 if 函數
    if (name === "if" && args.length === 3) {
      return {
        type: "conditional",
        condition: args[0],
        trueExpr: args[1],
        falseExpr: args[2],
      };
    }

    return { type: "func", name, args };
  }
}

/**
 * 解析公式標記
 */
export function parseFormula(markup: string): FormulaAST | null {
  // 移除 {{ }}
  let content = markup;
  if (content.startsWith("{{")) {
    content = content.slice(2);
  }
  if (content.endsWith("}}")) {
    content = content.slice(0, -2);
  }
  content = content.trim();

  if (!content) return null;

  // Excel mode: {{excel:...}}
  if (content.toLowerCase().startsWith("excel:")) {
    const excelFormula = content.slice(6).trim();
    if (!excelFormula) return null;
    return {
      type: "excel",
      value: excelFormula,
    };
  }

  try {
    const tokens = tokenize(content);
    const parser = new Parser(tokens);
    return parser.parse();
  } catch (e) {
    // The markup can be author input of any length; log only its start.
    console.warn(
      "Failed to parse formula:",
      markup.length > 200 ? `${markup.slice(0, 200)}… (${markup.length} characters)` : markup,
      e,
    );
    return null;
  }
}

/**
 * 計算公式值
 */
export function evaluateFormula(
  ast: FormulaAST,
  context: Record<string, number>,
  lookupTables?: Record<
    string,
    Array<{ threshold: number; value: string | number }>
  >,
): number | string | boolean {
  switch (ast.type) {
    case "excel": {
      const rawFormula = String(ast.value ?? "").trim();
      if (!rawFormula) {
        throw new FormulaEvaluationError(
          "evaluation_error",
          "Excel formula is empty.",
        );
      }
      if (!externalExcelEvaluator) {
        throw new FormulaEvaluationError(
          "runtime_unavailable",
          "Excel formula evaluator is not configured. Use setExcelFormulaEvaluator() first.",
        );
      }
      try {
        const result = externalExcelEvaluator(rawFormula, context);
        if (typeof result === "number" && !Number.isFinite(result)) {
          throw new Error("Excel formula returned a non-finite number.");
        }
        return result;
      } catch (error) {
        throw new FormulaEvaluationError(
          "evaluation_error",
          `Failed to evaluate Excel formula: ${rawFormula}`,
          { cause: error },
        );
      }
    }

    case "number": {
      const value = ast.value as number;
      if (!Number.isFinite(value)) {
        throw new FormulaEvaluationError(
          "evaluation_error",
          "Formula contains a non-finite number.",
        );
      }
      return value;
    }

    case "string":
      return ast.value as string;

    case "attr": {
      const name = ast.name!;
      // 支援巢狀屬性如 hp.current
      if (name.includes(".")) {
        // 簡化處理，假設 context 已經扁平化
        const flatKey = name.replace(".", "_");
        if (Object.hasOwn(context, flatKey)) {
          return context[flatKey];
        }
      }
      if (Object.hasOwn(context, name)) return context[name];
      const caseInsensitiveKey = Object.keys(context).find(
        (key) => key.toLowerCase() === name.toLowerCase(),
      );
      if (caseInsensitiveKey) return context[caseInsensitiveKey];
      throw new FormulaEvaluationError(
        "reference_not_found",
        `Formula reference not found: ${name}`,
      );
    }

    case "unary": {
      const value = evaluateFormula(ast.right!, context, lookupTables);
      if (ast.op === "-" && typeof value === "number") {
        return -value;
      }
      throw new FormulaEvaluationError(
        "type_mismatch",
        `Unary operator ${ast.op ?? "unknown"} requires a number.`,
      );
    }

    case "binary": {
      const left = evaluateFormula(ast.left!, context, lookupTables);
      const right = evaluateFormula(ast.right!, context, lookupTables);

      // 數學運算
      if (typeof left === "number" && typeof right === "number") {
        if (
          (ast.op === "/" || ast.op === "/floor" || ast.op === "/ceil") &&
          right === 0
        ) {
          throw new FormulaEvaluationError(
            "divide_by_zero",
            "Formula cannot divide by zero.",
          );
        }
        switch (ast.op) {
          case "+":
            return left + right;
          case "-":
            return left - right;
          case "*":
            return left * right;
          case "/":
          case "/floor":
            return Math.floor(left / right);
          case "/ceil":
            return Math.ceil(left / right);
          case "<":
            return left < right;
          case ">":
            return left > right;
          case "<=":
            return left <= right;
          case ">=":
            return left >= right;
          case "==":
            return left === right;
          case "!=":
            return left !== right;
        }
      }

      // 邏輯運算
      if (ast.op === "&&") {
        return Boolean(left) && Boolean(right);
      }
      if (ast.op === "||") {
        return Boolean(left) || Boolean(right);
      }
      if (ast.op === "==") {
        return left === right;
      }
      if (ast.op === "!=") {
        return left !== right;
      }

      throw new FormulaEvaluationError(
        "type_mismatch",
        `Operator ${ast.op ?? "unknown"} received incompatible values.`,
      );
    }

    case "conditional": {
      const condition = evaluateFormula(ast.condition!, context, lookupTables);
      if (condition) {
        return evaluateFormula(ast.trueExpr!, context, lookupTables);
      } else {
        return evaluateFormula(ast.falseExpr!, context, lookupTables);
      }
    }

    case "func": {
      const args = ast.args!.map((arg) =>
        evaluateFormula(arg, context, lookupTables),
      );

      switch (ast.name) {
        case "half":
          return Math.floor(numericArgument("half", args) / 2);
        case "fifth":
          return Math.floor(numericArgument("fifth", args) / 5);
        case "floor":
          return Math.floor(numericArgument("floor", args));
        case "ceil":
          return Math.ceil(numericArgument("ceil", args));
        case "max": {
          const values = args.map((_, index) =>
            numericArgument("max", args, index),
          );
          if (values.length === 0) {
            throw new FormulaEvaluationError(
              "type_mismatch",
              "max requires at least one numeric argument.",
            );
          }
          return Math.max(...values);
        }
        case "min": {
          const values = args.map((_, index) =>
            numericArgument("min", args, index),
          );
          if (values.length === 0) {
            throw new FormulaEvaluationError(
              "type_mismatch",
              "min requires at least one numeric argument.",
            );
          }
          return Math.min(...values);
        }
        case "abs":
          return Math.abs(numericArgument("abs", args));
        case "round":
          return Math.round(numericArgument("round", args));

        // 查表函數
        case "lookup": {
          const lookupValue = args[0];
          const tableName = args[1];

          if (
            typeof lookupValue !== "number" ||
            typeof tableName !== "string"
          ) {
            throw new FormulaEvaluationError(
              "type_mismatch",
              "lookup requires a numeric value and a string table name.",
            );
          }

          // Try external lookup resolver first
          if (externalLookupResolver) {
            const externalResult = externalLookupResolver(tableName, lookupValue);
            if (externalResult !== undefined) {
              return externalResult;
            }
          }

          // 特殊處理 damage-bonus 和 build：支援超出表格範圍的動態計算
          // 規則：165-204 為 +1D6/build 2，之後每 40 點各 +1D6/+1 build
          if (tableName === "damage-bonus") {
            if (lookupValue < 2) return "-2";
            if (lookupValue < 65) return "-2";
            if (lookupValue < 85) return "-1";
            if (lookupValue < 125) return "0";
            if (lookupValue < 165) return "+1D4";
            // 165 以上：動態計算
            const dice = 1 + Math.floor((lookupValue - 165) / 40);
            return `+${dice}D6`;
          }

          if (tableName === "build") {
            if (lookupValue < 2) return -2;
            if (lookupValue < 65) return -2;
            if (lookupValue < 85) return -1;
            if (lookupValue < 125) return 0;
            if (lookupValue < 165) return 1;
            // 165 以上：動態計算
            return 2 + Math.floor((lookupValue - 165) / 40);
          }

          // 使用內建查表或外部表格
          const table = lookupTables?.[tableName] || BUILTIN_TABLES[tableName];
          if (!table) {
            return `[lookup:${tableName}]`;
          }

          // 找到對應的值（閾值查找）
          for (let i = table.length - 1; i >= 0; i--) {
            if (lookupValue >= table[i].threshold) {
              return table[i].value;
            }
          }
          if (table.length === 0) {
            throw new FormulaEvaluationError(
              "lookup_not_found",
              `Lookup table is empty: ${tableName}`,
            );
          }
          return table[0].value;
        }

        default:
          throw new FormulaEvaluationError(
            "function_not_allowed",
            `Unknown function: ${ast.name ?? "unknown"}`,
          );
      }
    }

    default:
      throw new FormulaEvaluationError(
        "evaluation_error",
        `Unsupported formula node: ${String(ast.type)}`,
      );
  }
}

// 內建查表（CoC 7e）
const BUILTIN_TABLES: Record<
  string,
  Array<{ threshold: number; value: string | number }>
> = {
  "damage-bonus": [
    { threshold: 2, value: "-2" },
    { threshold: 65, value: "-1" },
    { threshold: 85, value: "0" },
    { threshold: 125, value: "+1D4" },
    { threshold: 165, value: "+1D6" },
    { threshold: 205, value: "+2D6" },
    { threshold: 285, value: "+3D6" },
    { threshold: 365, value: "+4D6" },
    { threshold: 445, value: "+5D6" },
  ],
  build: [
    { threshold: 2, value: -2 },
    { threshold: 65, value: -1 },
    { threshold: 85, value: 0 },
    { threshold: 125, value: 1 },
    { threshold: 165, value: 2 },
    { threshold: 205, value: 3 },
    { threshold: 285, value: 4 },
    { threshold: 365, value: 5 },
    { threshold: 445, value: 6 },
  ],
  // 年齡對 MOV 的修正值
  "age-mov-modifier": [
    { threshold: 15, value: 0 }, // 15-39: 無修正
    { threshold: 40, value: -1 }, // 40-49: -1
    { threshold: 50, value: -2 }, // 50-59: -2
    { threshold: 60, value: -3 }, // 60-69: -3
    { threshold: 70, value: -4 }, // 70-79: -4
    { threshold: 80, value: -5 }, // 80+: -5
  ],
};
