/**
 * 條件評估工具函數
 *
 * 用於評估 visibleWhen 等條件表達式
 */

/**
 * 根據路徑從巢狀物件取得值
 *
 * @example
 * getValueByPath({ a: { b: 1 } }, "a.b") // => 1
 */
export function getValueByPath(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * 評估 visibleWhen 條件
 *
 * 支援的語法：
 * - {{path.to.value}}          - 檢查值是否為 truthy
 * - {{!path.to.value}}         - 檢查值是否為 falsy
 * - {{path == 'value'}}        - 相等比較
 * - {{path != 'value'}}        - 不等比較
 * - {{path >= value}}          - 大於等於比較
 * - {{path <= value}}          - 小於等於比較
 * - {{path > value}}           - 大於比較
 * - {{path < value}}           - 小於比較
 * - {{path.to.bool}}           - 布林值檢查
 * - {{path1 && path2}}         - AND 運算
 * - {{path1 || path2}}         - OR 運算
 *
 * @example
 * evaluateCondition("{{pulpSettings.useArchetype}}", data)
 * evaluateCondition("{{archetypeLabel}}", data)
 * evaluateCondition("{{era == 'cold_war'}}", data)
 * evaluateCondition("{{age >= 15 && age <= 89}}", data)
 */
export function evaluateCondition(
  condition: string | undefined,
  data: Record<string, unknown> | undefined | null,
): boolean {
  if (!condition) return true;
  if (!data) return false;

  // 移除 {{ }}
  let expr = condition.trim();
  if (expr.startsWith("{{")) expr = expr.slice(2);
  if (expr.endsWith("}}")) expr = expr.slice(0, -2);
  expr = expr.trim();

  if (!expr) return true;

  // 處理 AND 運算 (&&)
  if (expr.includes("&&")) {
    const parts = expr.split("&&").map((p) => p.trim());
    return parts.every((part) => evaluateCondition(`{{${part}}}`, data));
  }

  // 處理 OR 運算 (||)
  if (expr.includes("||")) {
    const parts = expr.split("||").map((p) => p.trim());
    return parts.some((part) => evaluateCondition(`{{${part}}}`, data));
  }

  // 處理否定 !path
  if (expr.startsWith("!")) {
    const path = expr.slice(1).trim();
    const value = getValueByPath(data, path);
    return !value;
  }

  // 處理比較 path == 'value' 或 path != 'value'
  const eqMatch = expr.match(/^([\w.]+)\s*==\s*['"]?(.+?)['"]?$/);
  if (eqMatch) {
    const path = eqMatch[1];
    const expected = eqMatch[2];
    const actual = getValueByPath(data, path);
    return String(actual) === expected;
  }

  const neqMatch = expr.match(/^([\w.]+)\s*!=\s*['"]?(.+?)['"]?$/);
  if (neqMatch) {
    const path = neqMatch[1];
    const expected = neqMatch[2];
    const actual = getValueByPath(data, path);
    return String(actual) !== expected;
  }

  // 處理技能等級檢查 skills:skillId >= value (特殊語法)
  const skillGteMatch = expr.match(/^skills:(\w+)\s*>=\s*(-?\d+(?:\.\d+)?)$/);
  if (skillGteMatch) {
    const skillId = skillGteMatch[1];
    const expected = parseFloat(skillGteMatch[2]);
    const skillsData = getValueByPath(data, "skills.skills") as Array<{ id: string; level: number }> | undefined;
    if (!skillsData || !Array.isArray(skillsData)) return false;
    const skill = skillsData.find((s) => s.id === skillId);
    return skill ? skill.level >= expected : false;
  }

  // 處理數值比較 path >= value, path <= value, path > value, path < value
  // 注意: >= 和 <= 必須在 > 和 < 之前檢查
  const gteMatch = expr.match(/^([\w.]+)\s*>=\s*(-?\d+(?:\.\d+)?)$/);
  if (gteMatch) {
    const path = gteMatch[1];
    const expected = parseFloat(gteMatch[2]);
    const actual = getValueByPath(data, path);
    return typeof actual === "number" && actual >= expected;
  }

  const lteMatch = expr.match(/^([\w.]+)\s*<=\s*(-?\d+(?:\.\d+)?)$/);
  if (lteMatch) {
    const path = lteMatch[1];
    const expected = parseFloat(lteMatch[2]);
    const actual = getValueByPath(data, path);
    return typeof actual === "number" && actual <= expected;
  }

  const gtMatch = expr.match(/^([\w.]+)\s*>\s*(-?\d+(?:\.\d+)?)$/);
  if (gtMatch) {
    const path = gtMatch[1];
    const expected = parseFloat(gtMatch[2]);
    const actual = getValueByPath(data, path);
    return typeof actual === "number" && actual > expected;
  }

  const ltMatch = expr.match(/^([\w.]+)\s*<\s*(-?\d+(?:\.\d+)?)$/);
  if (ltMatch) {
    const path = ltMatch[1];
    const expected = parseFloat(ltMatch[2]);
    const actual = getValueByPath(data, path);
    return typeof actual === "number" && actual < expected;
  }

  // 處理布林比較 path == true 或 path == false
  const boolMatch = expr.match(/^([\w.]+)\s*==\s*(true|false)$/);
  if (boolMatch) {
    const path = boolMatch[1];
    const expected = boolMatch[2] === "true";
    const actual = getValueByPath(data, path);
    return Boolean(actual) === expected;
  }

  // 預設：檢查路徑值是否為 truthy
  const value = getValueByPath(data, expr);
  return Boolean(value);
}
