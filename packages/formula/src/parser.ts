import type { FormulaToken } from "./tokenizer";
import { tokenizeFormula } from "./tokenizer";
import type { FormulaIssue } from "./types";

export type FormulaSyntaxNode =
  | { type: "literal"; value: number | string | boolean; start: number; end: number }
  | { type: "reference"; value: string; start: number; end: number }
  | {
      type: "unary";
      operator: "-";
      operand: FormulaSyntaxNode;
      start: number;
      end: number;
    }
  | {
      type: "binary";
      operator: string;
      left: FormulaSyntaxNode;
      right: FormulaSyntaxNode;
      start: number;
      end: number;
    }
  | {
      type: "call";
      name: string;
      arguments: FormulaSyntaxNode[];
      start: number;
      end: number;
    };

export type FormulaParseResult =
  | { success: true; expression: FormulaSyntaxNode }
  | { success: false; issues: FormulaIssue[] };

class ParseFailure extends Error {
  constructor(
    message: string,
    readonly token: FormulaToken
  ) {
    super(message);
  }
}

class FormulaParser {
  private position = 0;

  constructor(private readonly tokens: FormulaToken[]) {}

  parse(): FormulaSyntaxNode {
    const expression = this.parseComparison();
    const trailing = this.peek();
    if (trailing.type !== "eof") {
      throw new ParseFailure("Unexpected token after expression.", trailing);
    }
    return expression;
  }

  private peek(): FormulaToken {
    return this.tokens[this.position];
  }

  private consume(): FormulaToken {
    const token = this.peek();
    this.position += 1;
    return token;
  }

  private expect(type: FormulaToken["type"]): FormulaToken {
    const token = this.consume();
    if (token.type !== type) {
      throw new ParseFailure(`Expected ${type}.`, token);
    }
    return token;
  }

  private hasOperator(operators: string[]): boolean {
    const token = this.peek();
    return token.type === "operator" && operators.includes(token.value);
  }

  private parseComparison(): FormulaSyntaxNode {
    let left = this.parseAdditive();
    while (this.hasOperator(["=", "<>", "<", "<=", ">", ">="])) {
      const operator = this.consume();
      const right = this.parseAdditive();
      left = {
        type: "binary",
        operator: operator.type === "operator" ? operator.value : "",
        left,
        right,
        start: left.start,
        end: right.end,
      };
    }
    return left;
  }

  private parseAdditive(): FormulaSyntaxNode {
    let left = this.parseMultiplicative();
    while (this.hasOperator(["+", "-"])) {
      const operator = this.consume();
      const right = this.parseMultiplicative();
      left = {
        type: "binary",
        operator: operator.type === "operator" ? operator.value : "",
        left,
        right,
        start: left.start,
        end: right.end,
      };
    }
    return left;
  }

  private parseMultiplicative(): FormulaSyntaxNode {
    let left = this.parseUnary();
    while (this.hasOperator(["*", "/"])) {
      const operator = this.consume();
      const right = this.parseUnary();
      left = {
        type: "binary",
        operator: operator.type === "operator" ? operator.value : "",
        left,
        right,
        start: left.start,
        end: right.end,
      };
    }
    return left;
  }

  private parseUnary(): FormulaSyntaxNode {
    const token = this.peek();
    if (token.type === "operator" && token.value === "-") {
      this.consume();
      const operand = this.parseUnary();
      return {
        type: "unary",
        operator: "-",
        operand,
        start: token.start,
        end: operand.end,
      };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaSyntaxNode {
    const token = this.consume();
    if (token.type === "number" || token.type === "string" || token.type === "boolean") {
      return {
        type: "literal",
        value: token.value,
        start: token.start,
        end: token.end,
      };
    }
    if (token.type === "reference") {
      return {
        type: "reference",
        value: token.value,
        start: token.start,
        end: token.end,
      };
    }
    if (token.type === "leftParen") {
      const expression = this.parseComparison();
      const closing = this.expect("rightParen");
      return { ...expression, start: token.start, end: closing.end };
    }
    if (token.type === "identifier") {
      return this.parseCall(token);
    }
    throw new ParseFailure("Expected a value, reference, or function call.", token);
  }

  private parseCall(nameToken: Extract<FormulaToken, { type: "identifier" }>): FormulaSyntaxNode {
    this.expect("leftParen");
    const args: FormulaSyntaxNode[] = [];
    if (this.peek().type !== "rightParen") {
      args.push(this.parseComparison());
      while (this.peek().type === "comma") {
        this.consume();
        args.push(this.parseComparison());
      }
    }
    const closing = this.expect("rightParen");
    return {
      type: "call",
      name: nameToken.value,
      arguments: args,
      start: nameToken.start,
      end: closing.end,
    };
  }
}

export function parseFormula(formulaId: string, source: string): FormulaParseResult {
  const tokenized = tokenizeFormula(formulaId, source);
  if (!tokenized.success) return tokenized;
  try {
    return {
      success: true,
      expression: new FormulaParser(tokenized.tokens).parse(),
    };
  } catch (error) {
    const failure = error as ParseFailure;
    const token = failure.token ?? tokenized.tokens.at(-1)!;
    return {
      success: false,
      issues: [
        {
          category: "syntax_error",
          formulaId,
          message: failure.message,
          start: token.start,
          end: token.end,
        },
      ],
    };
  }
}
