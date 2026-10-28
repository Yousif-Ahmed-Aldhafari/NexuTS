export type TableKind = "TEST_CASES" | "ISSUE_LOGS";
export type TestCaseStatus = "SUCCESS" | "FAIL";
export type IssuePriority = "HIGH" | "MEDIUM" | "LOW";
export type FixStatus = "NEEDS_FIX" | "NEEDS_RETEST" | "FIXED";

export const TEST_CASE_STATUS_OPTIONS: TestCaseStatus[] = ["SUCCESS", "FAIL"];
export const ISSUE_PRIORITY_OPTIONS: IssuePriority[] = ["HIGH", "MEDIUM", "LOW"];
export const FIX_STATUS_OPTIONS: FixStatus[] = ["NEEDS_FIX", "NEEDS_RETEST", "FIXED"];

type RawEntryRequest = {
  title?: unknown;
  username?: unknown;
  description?: unknown;
  stepsToReproduce?: unknown;
  result?: unknown;
  expectedResult?: unknown;
  status?: unknown;
  priority?: unknown;
  fixStatus?: unknown;
  assignedTo?: unknown;
  screenshotClipName?: unknown;
  screenshotClipUrl?: unknown;
};

export type NormalizedEntryCreateInput = {
  title: string;
  status: string;
  priority: IssuePriority | null;
  assignedTo: string | null;
  description: string;
  username: string;
  stepsToReproduce: string;
  result: string;
  expectedResult: string;
  screenshotClipName: string;
  screenshotClipUrl: string;
  fixStatus: FixStatus | "";
};

const isString = (value: unknown): value is string => typeof value === "string";
const normalize = (value: unknown) => (isString(value) ? value.trim() : "");
const normalizeOptional = (value: unknown) => {
  const normalizedValue = normalize(value);
  return normalizedValue || "";
};

const asStrictStatus = (value: unknown) => {
  const normalizedValue = normalize(value).toUpperCase();
  return TEST_CASE_STATUS_OPTIONS.includes(normalizedValue as TestCaseStatus)
    ? (normalizedValue as TestCaseStatus)
    : null;
};

const asStrictPriority = (value: unknown) => {
  const normalizedValue = normalize(value).toUpperCase();
  return ISSUE_PRIORITY_OPTIONS.includes(normalizedValue as IssuePriority) ? (normalizedValue as IssuePriority) : null;
};

const asStrictFixStatus = (value: unknown) => {
  const normalizedValue = normalize(value).toUpperCase();
  return FIX_STATUS_OPTIONS.includes(normalizedValue as FixStatus) ? (normalizedValue as FixStatus) : null;
};

export function validateAndNormalizeEntryInput(
  rawInput: RawEntryRequest,
  tableType: TableKind,
): { data?: NormalizedEntryCreateInput; error?: string } {
  const title = normalize(rawInput.title);
  const username = normalize(rawInput.username);
  const description = normalize(rawInput.description);
  const stepsToReproduce = normalize(rawInput.stepsToReproduce);
  const assignedToValue = normalize(rawInput.assignedTo);
  const screenshotClipName = normalizeOptional(rawInput.screenshotClipName);
  const screenshotClipUrl = normalizeOptional(rawInput.screenshotClipUrl);

  if (!title) {
    return { error: "Title is required." };
  }
  if (!username) {
    return { error: "Username is required." };
  }
  if (!description) {
    return { error: "Description is required." };
  }
  if (!stepsToReproduce) {
    return { error: "Steps to reproduce is required." };
  }

  if (tableType === "TEST_CASES") {
    const status = asStrictStatus(rawInput.status);
    const result = normalize(rawInput.result);
    const expectedResult = normalize(rawInput.expectedResult);
    const fixStatus = asStrictFixStatus(rawInput.fixStatus);

    if (!status) {
      return { error: "Status must be either Success or Fail." };
    }
    if (!result) {
      return { error: "Result is required." };
    }
    if (!expectedResult) {
      return { error: "Expected result is required." };
    }
    if (status === "FAIL" && !fixStatus) {
      return { error: "Fix Status is required when status is Fail." };
    }
    return {
      data: {
        title,
        status,
        priority: null,
        assignedTo: assignedToValue || null,
        description,
        username,
        stepsToReproduce,
        result,
        expectedResult,
        fixStatus: status === "SUCCESS" ? "FIXED" : fixStatus || "",
        screenshotClipName,
        screenshotClipUrl,
      },
    };
  }

  const priority = asStrictPriority(rawInput.priority ?? rawInput.status);
  const fixStatus = asStrictFixStatus(rawInput.fixStatus);
  if (!priority) {
    return { error: "Priority must be High, Medium, or Low." };
  }
  if (!fixStatus) {
    return { error: "Fix Status is required." };
  }

  const rawStatus = normalize(rawInput.status).toUpperCase();
  const status = rawStatus === "OPEN" || rawStatus === "CLOSED" ? rawStatus : fixStatus === "FIXED" ? "CLOSED" : "OPEN";

  return {
    data: {
      title,
      status,
      priority,
      assignedTo: assignedToValue || null,
      description,
      username,
      stepsToReproduce,
      result: "",
      expectedResult: "",
      fixStatus,
      screenshotClipName,
      screenshotClipUrl,
    },
  };
}
