import type { Rule } from "postcss";
import selectorParser from "postcss-selector-parser";
import type { TemplateValidationIssue } from "@skald/sheet-sdk/modules/sheet-schema";
import { CUSTOM_CLASS_PREFIX, allowedTags, allowedPseudoClasses, MAX_SELECTOR_DEPTH } from "./allowlist";
import { cssIssue } from "./issue";

export function validateSelector(rule: Rule): TemplateValidationIssue[] {
  const path = ["template", "scopedStyles", "css"];
  const issues: TemplateValidationIssue[] = [];

  try {
    const root = selectorParser().astSync(rule.selector);
    root.each((selector) => {
      const nodes = selector.nodes.filter((node) => node.type !== "comment");
      const first = nodes[0];
      if (first?.type !== "class" || !first.value.startsWith(CUSTOM_CLASS_PREFIX)) {
        issues.push(
          cssIssue(
            "global_selector_forbidden",
            `Every selector must start with .${CUSTOM_CLASS_PREFIX}*.`,
            path,
            rule,
          ),
        );
      }

      let depth = 1;
      for (const node of nodes) {
        if (node.type === "combinator") {
          if (node.value.trim() !== "" && node.value.trim() !== ">") {
            issues.push(
              cssIssue(
                "selector_combinator_forbidden",
                `Selector combinator "${node.value.trim()}" is not allowed.`,
                path,
                rule,
              ),
            );
          }
          depth += 1;
          continue;
        }
        if (node.type === "class") {
          if (!node.value.startsWith(CUSTOM_CLASS_PREFIX)) {
            issues.push(
              cssIssue(
                "selector_class_forbidden",
                `Class ".${node.value}" must start with .${CUSTOM_CLASS_PREFIX}.`,
                path,
                rule,
              ),
            );
          }
          continue;
        }
        if (node.type === "tag") {
          if (!allowedTags.has(node.value.toLowerCase())) {
            issues.push(
              cssIssue(
                "selector_tag_forbidden",
                `Element selector "${node.value}" is not allowed.`,
                path,
                rule,
              ),
            );
          }
          continue;
        }
        if (node.type === "pseudo") {
          if (!allowedPseudoClasses.has(node.value)) {
            issues.push(
              cssIssue(
                "selector_pseudo_forbidden",
                `Pseudo-class "${node.value}" is not allowed.`,
                path,
                rule,
              ),
            );
          }
          continue;
        }
        issues.push(
          cssIssue(
            "selector_token_forbidden",
            `Selector token "${node.type}" is not allowed.`,
            path,
            rule,
          ),
        );
      }

      if (depth > MAX_SELECTOR_DEPTH) {
        issues.push(
          cssIssue(
            "selector_too_deep",
            `Selector depth must not exceed ${MAX_SELECTOR_DEPTH}.`,
            path,
            rule,
          ),
        );
      }
    });
  } catch (error) {
    issues.push(
      cssIssue(
        "selector_invalid",
        error instanceof Error ? error.message : "Selector is invalid.",
        path,
        rule,
      ),
    );
  }
  return issues;
}

export function scopeValue(scopeId: string): string {
  return encodeURIComponent(scopeId);
}
