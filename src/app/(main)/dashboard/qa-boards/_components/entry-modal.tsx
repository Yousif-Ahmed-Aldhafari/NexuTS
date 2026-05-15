"use client";

import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import { getSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/use-i18n";
import {
  FIX_STATUS_OPTIONS,
  type FixStatus,
  ISSUE_PRIORITY_OPTIONS,
  type IssuePriority,
  type TableKind,
  TEST_CASE_STATUS_OPTIONS,
  type TestCaseStatus,
} from "@/lib/qa-entry-schema";

const isAutomationConfigured = process.env.NEXT_PUBLIC_AUTOMATION_ENABLED === "true";

type SharedFormState = {
  username: string;
  title: string;
  description: string;
  stepsToReproduce: string;
  assignedTo: string;
  fixStatus: FixStatus | "";
  screenshotClipName: string;
  screenshotClipUrl: string;
};

type TestCaseFormState = SharedFormState & {
  status: TestCaseStatus | "";
  result: string;
  expectedResult: string;
};

type IssueLogFormState = SharedFormState & {
  priority: IssuePriority | "";
};

type UserOption = {
  value: string;
  label: string;
};

export type EntryModalInitialValues = {
  username?: string;
  title?: string;
  description?: string;
  stepsToReproduce?: string;
  assignedTo?: string;
  fixStatus?: FixStatus | "";
  screenshotClipName?: string;
  screenshotClipUrl?: string;
  status?: TestCaseStatus;
  result?: string;
  expectedResult?: string;
  priority?: IssuePriority | "";
};

function StrictSelect({
  value,
  onValueChange,
  placeholder,
  options,
  disabled,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MediaUploadField({
  onSelect,
  selectedFileName,
  label,
}: {
  onSelect: (fileName: string, dataUrl: string) => void;
  selectedFileName: string;
  label: string;
}) {
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      onSelect(file.name, result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor="entry-media">{label}</Label>
      <Input
        id="entry-media"
        type="file"
        accept="image/*,video/*"
        onChange={handleFileChange}
        className="h-auto py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:font-semibold file:text-slate-700 hover:file:bg-slate-200 dark:file:bg-slate-800 dark:file:text-slate-200"
      />
      {selectedFileName ? <p className="text-muted-foreground text-xs">{selectedFileName}</p> : null}
    </div>
  );
}

function AutomationReproduceSection({
  sectionLabel,
  recordLabel,
  typeScriptLabel,
  recordAlert,
  typeScriptAlert,
}: {
  sectionLabel: string;
  recordLabel: string;
  typeScriptLabel: string;
  recordAlert: string;
  typeScriptAlert: string;
}) {
  if (!isAutomationConfigured) return null;
  return (
    <div className="grid gap-2">
      <Label>{sectionLabel}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => window.alert(recordAlert)}>
          {recordLabel}
        </Button>
        <Button type="button" variant="outline" onClick={() => window.alert(typeScriptAlert)}>
          {typeScriptLabel}
        </Button>
      </div>
    </div>
  );
}

export function EntryModal({
  tableId,
  tableType,
  mode = "create",
  entryId,
  initialValues,
  onSuccess,
  onClose,
}: {
  tableId: string;
  tableType: TableKind;
  mode?: "create" | "edit";
  entryId?: number;
  initialValues?: EntryModalInitialValues;
  onSuccess?: (mode: "create" | "edit") => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [assigneeOptions, setAssigneeOptions] = useState<UserOption[]>([]);
  const [isLoadingAssignees, setIsLoadingAssignees] = useState(true);

  const [testCaseData, setTestCaseData] = useState<TestCaseFormState>({
    username: initialValues?.username || "",
    title: initialValues?.title || "",
    description: initialValues?.description || "",
    stepsToReproduce: initialValues?.stepsToReproduce || "",
    status: initialValues?.status || "",
    result: initialValues?.result || "",
    expectedResult: initialValues?.expectedResult || "",
    assignedTo: initialValues?.assignedTo || "",
    fixStatus: initialValues?.fixStatus || "FIXED",
    screenshotClipName: initialValues?.screenshotClipName || "",
    screenshotClipUrl: initialValues?.screenshotClipUrl || "",
  });

  const [issueLogData, setIssueLogData] = useState<IssueLogFormState>({
    username: initialValues?.username || "",
    title: initialValues?.title || "",
    description: initialValues?.description || "",
    stepsToReproduce: initialValues?.stepsToReproduce || "",
    priority: initialValues?.priority || "",
    assignedTo: initialValues?.assignedTo || "",
    fixStatus: initialValues?.fixStatus || "",
    screenshotClipName: initialValues?.screenshotClipName || "",
    screenshotClipUrl: initialValues?.screenshotClipUrl || "",
  });

  useEffect(() => {
    if (initialValues?.username) return;
    getSession().then((session) => {
      const username = session?.user?.name || session?.user?.email || t("qa.entries.unknown");
      setTestCaseData((prev) => ({ ...prev, username }));
      setIssueLogData((prev) => ({ ...prev, username }));
    });
  }, [initialValues?.username, t]);

  useEffect(() => {
    let isActive = true;

    const loadUsers = async () => {
      try {
        const response = await fetch("/api/users/options", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(t("common.loadingUsers"));
        }

        const users = (await response.json()) as Array<{
          id: number;
          name: string | null;
          email: string | null;
        }>;

        const unique = new Set<string>();
        const options = users
          .map((user) => {
            const displayName = user.name?.trim() || user.email?.trim() || "";
            return {
              value: displayName,
              label: displayName,
            };
          })
          .filter((user) => user.value.length > 0)
          .filter((user) => {
            if (unique.has(user.value)) return false;
            unique.add(user.value);
            return true;
          });

        if (!isActive) return;
        setAssigneeOptions(options);
      } catch (_error) {
        if (!isActive) return;
        setAssigneeOptions([]);
      } finally {
        if (isActive) {
          setIsLoadingAssignees(false);
        }
      }
    };

    void loadUsers();

    return () => {
      isActive = false;
    };
  }, [t]);

  const activeData = tableType === "TEST_CASES" ? testCaseData : issueLogData;
  const isFailStatus = testCaseData.status === "FAIL";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});
    setIsSubmitting(true);

    const errors: Record<string, string> = {};

    const validateShared = (data: SharedFormState) => {
      if (!data.title.trim()) errors.title = t("qa.entryModal.validation.titleRequired");
      if (!data.description.trim()) errors.description = t("qa.entryModal.validation.descriptionRequired");
      if (!data.stepsToReproduce.trim()) errors.stepsToReproduce = t("qa.entryModal.validation.stepsRequired");
    };

    validateShared(activeData);

    if (tableType === "TEST_CASES") {
      if (!testCaseData.status) errors.status = t("qa.entryModal.validation.statusRequired");
      if (!testCaseData.result.trim()) errors.result = t("qa.entryModal.validation.resultRequired");
      if (!testCaseData.expectedResult.trim()) errors.expectedResult = t("qa.entryModal.validation.expectedRequired");
      if (isFailStatus && !testCaseData.fixStatus) errors.fixStatus = t("qa.entryModal.validation.fixForFail");
    }

    if (tableType === "ISSUE_LOGS") {
      if (!issueLogData.priority) errors.priority = t("qa.entryModal.validation.priorityRequired");
      if (!issueLogData.fixStatus) errors.fixStatus = t("qa.entryModal.validation.fixRequired");
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setErrorMessage(t("qa.entryModal.fixFields"));
      setIsSubmitting(false);
      return;
    }

    if (mode === "edit" && !entryId) {
      setErrorMessage(t("qa.entryModal.entryIdMissing"));
      setIsSubmitting(false);
      return;
    }

    const payload =
      tableType === "TEST_CASES"
        ? {
            tableId,
            username: testCaseData.username,
            title: testCaseData.title,
            description: testCaseData.description,
            stepsToReproduce: testCaseData.stepsToReproduce,
            result: testCaseData.result,
            expectedResult: testCaseData.expectedResult,
            status: testCaseData.status,
            fixStatus: testCaseData.status === "SUCCESS" ? "FIXED" : testCaseData.fixStatus,
            assignedTo: testCaseData.assignedTo,
            screenshotClipName: testCaseData.screenshotClipName,
            screenshotClipUrl: testCaseData.screenshotClipUrl,
          }
        : {
            tableId,
            username: issueLogData.username,
            title: issueLogData.title,
            description: issueLogData.description,
            stepsToReproduce: issueLogData.stepsToReproduce,
            priority: issueLogData.priority,
            fixStatus: issueLogData.fixStatus,
            assignedTo: issueLogData.assignedTo,
            screenshotClipName: issueLogData.screenshotClipName,
            screenshotClipUrl: issueLogData.screenshotClipUrl,
          };

    const response = await fetch("/api/entries", {
      method: mode === "edit" ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "edit"
          ? {
              ...payload,
              id: entryId,
            }
          : payload,
      ),
    });

    if (!response.ok) {
      const responseBody = await response.json().catch(() => ({}));
      setErrorMessage(responseBody?.error || t("qa.entryModal.saveFailed"));
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    onSuccess?.(mode);
    onClose();
  };

  const tableLabel = tableType === "TEST_CASES" ? t("qa.entries.testCases") : t("qa.entries.issueLogs");
  const modalActionLabel = mode === "edit" ? t("common.update") : t("common.add");

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-[425px]">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle>
            {modalActionLabel} {tableLabel}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? t("qa.entryModal.updateDesc")
              : tableType === "TEST_CASES"
                ? t("qa.entryModal.createTestCase")
                : t("qa.entryModal.createIssueLog")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [scrollbar-color:rgba(100,116,139,0.45)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/40 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600/50 [&::-webkit-scrollbar]:w-2">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="entry-username">{t("qa.entryModal.username")}</Label>
                <Input id="entry-username" value={activeData.username} disabled />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="entry-title">{t("qa.entryModal.title")}</Label>
                <Input
                  id="entry-title"
                  aria-invalid={Boolean(fieldErrors.title)}
                  className={fieldErrors.title ? "border-destructive focus-visible:ring-destructive/40" : undefined}
                  value={activeData.title}
                  onChange={(event) => {
                    const title = event.target.value;
                    if (tableType === "TEST_CASES") {
                      setTestCaseData((prev) => ({ ...prev, title }));
                    } else {
                      setIssueLogData((prev) => ({ ...prev, title }));
                    }
                  }}
                />
                {fieldErrors.title ? <p className="text-destructive text-xs">{fieldErrors.title}</p> : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="entry-description">{t("qa.entryModal.description")}</Label>
                <Textarea
                  id="entry-description"
                  aria-invalid={Boolean(fieldErrors.description)}
                  className={
                    fieldErrors.description ? "border-destructive focus-visible:ring-destructive/40" : undefined
                  }
                  value={activeData.description}
                  onChange={(event) => {
                    const description = event.target.value;
                    if (tableType === "TEST_CASES") {
                      setTestCaseData((prev) => ({ ...prev, description }));
                    } else {
                      setIssueLogData((prev) => ({ ...prev, description }));
                    }
                  }}
                />
                {fieldErrors.description ? <p className="text-destructive text-xs">{fieldErrors.description}</p> : null}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="entry-steps">{t("qa.entryModal.steps")}</Label>
                <Textarea
                  id="entry-steps"
                  aria-invalid={Boolean(fieldErrors.stepsToReproduce)}
                  className={
                    fieldErrors.stepsToReproduce ? "border-destructive focus-visible:ring-destructive/40" : undefined
                  }
                  value={activeData.stepsToReproduce}
                  onChange={(event) => {
                    const stepsToReproduce = event.target.value;
                    if (tableType === "TEST_CASES") {
                      setTestCaseData((prev) => ({ ...prev, stepsToReproduce }));
                    } else {
                      setIssueLogData((prev) => ({ ...prev, stepsToReproduce }));
                    }
                  }}
                />
                {fieldErrors.stepsToReproduce ? (
                  <p className="text-destructive text-xs">{fieldErrors.stepsToReproduce}</p>
                ) : null}
              </div>

              {tableType === "TEST_CASES" ? (
                <>
                  <div className="grid gap-2">
                    <Label>{t("qa.entryModal.status")}</Label>
                    <StrictSelect
                      value={testCaseData.status}
                      onValueChange={(value) => {
                        const status = value as TestCaseStatus;
                        setTestCaseData((prev) => ({
                          ...prev,
                          status,
                          assignedTo: status === "SUCCESS" ? "" : prev.assignedTo,
                          fixStatus: status === "SUCCESS" ? "FIXED" : prev.fixStatus === "FIXED" ? "" : prev.fixStatus,
                        }));
                      }}
                      placeholder={t("qa.entryModal.selectStatus")}
                      options={TEST_CASE_STATUS_OPTIONS.map((statusOption) => ({
                        value: statusOption,
                        label: statusOption === "SUCCESS" ? t("status.success") : t("status.fail"),
                      }))}
                    />
                    {fieldErrors.status ? <p className="text-destructive text-xs">{fieldErrors.status}</p> : null}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="entry-result">{t("qa.entryModal.result")}</Label>
                    <Textarea
                      id="entry-result"
                      aria-invalid={Boolean(fieldErrors.result)}
                      className={
                        fieldErrors.result ? "border-destructive focus-visible:ring-destructive/40" : undefined
                      }
                      value={testCaseData.result}
                      onChange={(event) => setTestCaseData((prev) => ({ ...prev, result: event.target.value }))}
                    />
                    {fieldErrors.result ? <p className="text-destructive text-xs">{fieldErrors.result}</p> : null}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="entry-expected-result">{t("qa.entryModal.expected")}</Label>
                    <Textarea
                      id="entry-expected-result"
                      aria-invalid={Boolean(fieldErrors.expectedResult)}
                      className={
                        fieldErrors.expectedResult ? "border-destructive focus-visible:ring-destructive/40" : undefined
                      }
                      value={testCaseData.expectedResult}
                      onChange={(event) => setTestCaseData((prev) => ({ ...prev, expectedResult: event.target.value }))}
                    />
                    {fieldErrors.expectedResult ? (
                      <p className="text-destructive text-xs">{fieldErrors.expectedResult}</p>
                    ) : null}
                  </div>

                  <div className="grid gap-2">
                    <Label>{t("qa.entryModal.fixStatus")}</Label>
                    <StrictSelect
                      value={testCaseData.fixStatus}
                      onValueChange={(value) => setTestCaseData((prev) => ({ ...prev, fixStatus: value as FixStatus }))}
                      placeholder={isFailStatus ? t("qa.entryModal.selectFixStatus") : t("status.fixed")}
                      options={FIX_STATUS_OPTIONS.map((fixStatusOption) => ({
                        value: fixStatusOption,
                        label:
                          fixStatusOption === "NEEDS_FIX"
                            ? t("status.needsFix")
                            : fixStatusOption === "NEEDS_RETEST"
                              ? t("status.needsRetest")
                              : t("status.fixed"),
                      }))}
                      disabled={!isFailStatus}
                    />
                    {fieldErrors.fixStatus ? <p className="text-destructive text-xs">{fieldErrors.fixStatus}</p> : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label>{t("qa.entryModal.priority")}</Label>
                    <StrictSelect
                      value={issueLogData.priority}
                      onValueChange={(value) =>
                        setIssueLogData((prev) => ({ ...prev, priority: value as IssuePriority }))
                      }
                      placeholder={t("qa.entryModal.selectPriority")}
                      options={ISSUE_PRIORITY_OPTIONS.map((priorityOption) => ({
                        value: priorityOption,
                        label:
                          priorityOption === "HIGH"
                            ? t("status.high")
                            : priorityOption === "MEDIUM"
                              ? t("status.medium")
                              : t("status.low"),
                      }))}
                    />
                    {fieldErrors.priority ? <p className="text-destructive text-xs">{fieldErrors.priority}</p> : null}
                  </div>

                  <div className="grid gap-2">
                    <Label>{t("qa.entryModal.fixStatus")}</Label>
                    <StrictSelect
                      value={issueLogData.fixStatus}
                      onValueChange={(value) => setIssueLogData((prev) => ({ ...prev, fixStatus: value as FixStatus }))}
                      placeholder={t("qa.entryModal.selectFixStatus")}
                      options={FIX_STATUS_OPTIONS.map((fixStatusOption) => ({
                        value: fixStatusOption,
                        label:
                          fixStatusOption === "NEEDS_FIX"
                            ? t("status.needsFix")
                            : fixStatusOption === "NEEDS_RETEST"
                              ? t("status.needsRetest")
                              : t("status.fixed"),
                      }))}
                    />
                    {fieldErrors.fixStatus ? <p className="text-destructive text-xs">{fieldErrors.fixStatus}</p> : null}
                  </div>
                </>
              )}

              <MediaUploadField
                label={t("qa.entryModal.media")}
                onSelect={(fileName, dataUrl) => {
                  if (tableType === "TEST_CASES") {
                    setTestCaseData((prev) => ({
                      ...prev,
                      screenshotClipName: fileName,
                      screenshotClipUrl: dataUrl,
                    }));
                  } else {
                    setIssueLogData((prev) => ({
                      ...prev,
                      screenshotClipName: fileName,
                      screenshotClipUrl: dataUrl,
                    }));
                  }
                }}
                selectedFileName={activeData.screenshotClipName}
              />

              <div className="grid gap-2">
                <Label>{t("qa.entryModal.assignedTo")}</Label>
                <StrictSelect
                  value={activeData.assignedTo}
                  onValueChange={(value) => {
                    if (tableType === "TEST_CASES") {
                      setTestCaseData((prev) => ({ ...prev, assignedTo: value }));
                    } else {
                      setIssueLogData((prev) => ({ ...prev, assignedTo: value }));
                    }
                  }}
                  placeholder={isLoadingAssignees ? t("qa.entryModal.loadingUsers") : t("qa.entryModal.selectAssignee")}
                  options={assigneeOptions}
                  disabled={isLoadingAssignees || assigneeOptions.length === 0}
                />
                {!isLoadingAssignees && assigneeOptions.length === 0 ? (
                  <p className="text-muted-foreground text-xs">{t("qa.entryModal.noUsers")}</p>
                ) : null}
                {fieldErrors.assignedTo ? <p className="text-destructive text-xs">{fieldErrors.assignedTo}</p> : null}
              </div>

              <AutomationReproduceSection
                sectionLabel={t("qa.entries.reproduce")}
                recordLabel={t("qa.entries.record")}
                typeScriptLabel={t("qa.entries.typeScript")}
                recordAlert={t("qa.entries.recordAlert")}
                typeScriptAlert={t("qa.entries.typeScriptAlert")}
              />

              {errorMessage ? <p className="text-destructive text-sm">{errorMessage}</p> : null}
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t px-6 py-4">
            <Button variant="outline" type="button" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? `${t("common.save")}...`
                : mode === "edit"
                  ? t("common.saveChanges")
                  : t("common.saveEntry")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
