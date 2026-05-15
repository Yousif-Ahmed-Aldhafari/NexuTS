"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import Image from "next/image";

import { ChevronDown, Download, FileSpreadsheet, FileText, Pencil, PlusCircle, Trash2, X } from "lucide-react";

import { LayoutSwitcher, type LayoutSwitcherValue } from "@/components/layout-switcher";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, downloadPdf, downloadXlsx } from "@/lib/export-downloads";
import { useI18n } from "@/lib/i18n/use-i18n";
import { showSuccessMessage } from "@/lib/notifications";
import type { FixStatus, IssuePriority, TableKind } from "@/lib/qa-entry-schema";

import { EntryModal, type EntryModalInitialValues } from "./entry-modal";
import { FilterSelect } from "./filter-select";
import { QaStatusBadge } from "./status-badges";

type Entry = {
  id: number;
  tableId: string;
  title: string;
  description: string;
  status: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  username: string | null;
  stepsToReproduce: string | null;
  fixStatus: string | null;
  result: string | null;
  expectedResult: string | null;
  screenshotClipName: string | null;
  screenshotClipUrl: string | null;
};

const ENTRY_LAYOUT_STORAGE_KEY = "qa-entry-layout-mode";

const truncateFallback = (value: string, maxLength = 100) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
};

const isAutomationConfigured = process.env.NEXT_PUBLIC_AUTOMATION_ENABLED === "true";
const hasBeenUpdated = (createdAt: string, updatedAt: string) =>
  new Date(updatedAt).getTime() > new Date(createdAt).getTime();

const isImageMedia = (mediaUrl: string) => mediaUrl.startsWith("data:image/");
const isVideoMedia = (mediaUrl: string) => mediaUrl.startsWith("data:video/");
const isFixStatus = (value: string): value is FixStatus =>
  value === "NEEDS_FIX" || value === "NEEDS_RETEST" || value === "FIXED";
const isIssuePriority = (value: string): value is IssuePriority =>
  value === "HIGH" || value === "MEDIUM" || value === "LOW";

type ExportColumnDefinition = {
  header: string;
  value: (entry: Entry) => string;
};

export function DataTable({ tableId, tableType }: { tableId: string; tableType: TableKind }) {
  const { t, locale } = useI18n();
  const localeCode = locale === "ar" ? "ar-SA" : "en-US";

  const unknownLabel = t("qa.entries.unknown");
  const unassignedLabel = t("qa.entries.unassigned");
  const noAttachmentLabel = t("qa.entries.noAttachment");

  const getFixStatusLabel = useCallback(
    (fixStatus: string) => {
      if (fixStatus === "NEEDS_FIX") return t("status.needsFix");
      if (fixStatus === "NEEDS_RETEST") return t("status.needsRetest");
      if (fixStatus === "FIXED") return t("status.fixed");
      return "-";
    },
    [t],
  );

  const formatLastUpdated = useCallback(
    (createdAt: string, updatedAt: string) =>
      hasBeenUpdated(createdAt, updatedAt) ? new Date(updatedAt).toLocaleDateString(localeCode) : "-",
    [localeCode],
  );

  const [entries, setEntries] = useState<Entry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [assignedToFilter, setAssignedToFilter] = useState("ALL");
  const [usernameFilter, setUsernameFilter] = useState("ALL");
  const [layoutMode, setLayoutMode] = useState<LayoutSwitcherValue>(() => {
    if (typeof window === "undefined") {
      return "table";
    }

    const storedValue = window.localStorage.getItem(ENTRY_LAYOUT_STORAGE_KEY);
    if (storedValue === "grid" || storedValue === "table") return storedValue;
    if (storedValue === "cards") return "grid";
    return "table";
  });
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<Entry | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);

  const fetchEntries = useCallback(async () => {
    const response = await fetch(`/api/tables/${tableId}/entries`);
    if (response.ok) {
      setEntries(await response.json());
    }
  }, [tableId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    window.localStorage.setItem(ENTRY_LAYOUT_STORAGE_KEY, layoutMode);
  }, [layoutMode]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = selectedEntry ? "hidden" : "";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedEntry]);

  useEffect(() => {
    if (!selectedEntry) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEntry(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [selectedEntry]);

  const assignedToOptions = useMemo(
    () =>
      Array.from(new Set(entries.map((entry) => entry.assignedTo || unassignedLabel))).map((assignee) => ({
        value: assignee,
        label: assignee,
      })),
    [entries, unassignedLabel],
  );

  const usernameOptions = useMemo(
    () =>
      Array.from(new Set(entries.map((entry) => entry.username || unknownLabel))).map((username) => ({
        value: username,
        label: username,
      })),
    [entries, unknownLabel],
  );

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        const matchesSearch =
          !normalizedQuery || [entry.title, entry.description].join(" ").toLowerCase().includes(normalizedQuery);

        const matchesAssignedTo =
          assignedToFilter === "ALL" || (entry.assignedTo || unassignedLabel) === assignedToFilter;
        const matchesUsername = usernameFilter === "ALL" || (entry.username || unknownLabel) === usernameFilter;
        const matchesStatus = tableType !== "TEST_CASES" || statusFilter === "ALL" || entry.status === statusFilter;
        const matchesPriority =
          tableType !== "ISSUE_LOGS" || priorityFilter === "ALL" || entry.status === priorityFilter;

        return matchesSearch && matchesAssignedTo && matchesUsername && matchesStatus && matchesPriority;
      }),
    [
      assignedToFilter,
      entries,
      priorityFilter,
      searchQuery,
      statusFilter,
      tableType,
      unassignedLabel,
      unknownLabel,
      usernameFilter,
    ],
  );
  const exportColumns = useMemo<ExportColumnDefinition[]>(
    () =>
      tableType === "TEST_CASES"
        ? [
            { header: t("qa.entries.id"), value: (entry) => String(entry.id) },
            { header: t("qa.entries.reporter"), value: (entry) => entry.username || unknownLabel },
            { header: t("qa.entryModal.title"), value: (entry) => entry.title },
            { header: t("qa.entryModal.description"), value: (entry) => entry.description || "" },
            { header: t("qa.entryModal.steps"), value: (entry) => entry.stepsToReproduce || "" },
            { header: t("qa.entryModal.result"), value: (entry) => entry.result || "" },
            { header: t("qa.entryModal.expected"), value: (entry) => entry.expectedResult || "" },
            { header: t("qa.entryModal.status"), value: (entry) => entry.status },
            { header: t("qa.entryModal.fixStatus"), value: (entry) => getFixStatusLabel(entry.fixStatus || "") },
            {
              header: t("qa.entryModal.media"),
              value: (entry) => entry.screenshotClipName || noAttachmentLabel,
            },
            { header: t("qa.entryModal.assignedTo"), value: (entry) => entry.assignedTo || unassignedLabel },
            {
              header: t("common.dateAdded"),
              value: (entry) => new Date(entry.createdAt).toLocaleDateString(localeCode),
            },
            { header: t("common.lastUpdated"), value: (entry) => formatLastUpdated(entry.createdAt, entry.updatedAt) },
          ]
        : [
            { header: t("qa.entries.id"), value: (entry) => String(entry.id) },
            { header: t("qa.entries.reporter"), value: (entry) => entry.username || unknownLabel },
            { header: t("qa.entryModal.title"), value: (entry) => entry.title },
            { header: t("qa.entryModal.description"), value: (entry) => entry.description || "" },
            { header: t("qa.entryModal.steps"), value: (entry) => entry.stepsToReproduce || "" },
            { header: t("qa.entryModal.priority"), value: (entry) => entry.status },
            { header: t("qa.entryModal.fixStatus"), value: (entry) => getFixStatusLabel(entry.fixStatus || "") },
            {
              header: t("qa.entryModal.media"),
              value: (entry) => entry.screenshotClipName || noAttachmentLabel,
            },
            { header: t("qa.entryModal.assignedTo"), value: (entry) => entry.assignedTo || unassignedLabel },
            {
              header: t("common.dateAdded"),
              value: (entry) => new Date(entry.createdAt).toLocaleDateString(localeCode),
            },
            { header: t("common.lastUpdated"), value: (entry) => formatLastUpdated(entry.createdAt, entry.updatedAt) },
          ],
    [formatLastUpdated, getFixStatusLabel, localeCode, noAttachmentLabel, t, tableType, unassignedLabel, unknownLabel],
  );
  const exportHeaders = useMemo(() => exportColumns.map((column) => column.header), [exportColumns]);
  const exportRows = useMemo(
    () => filteredEntries.map((entry) => exportColumns.map((column) => column.value(entry))),
    [exportColumns, filteredEntries],
  );

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
    setAssignedToFilter("ALL");
    setUsernameFilter("ALL");
  };

  const isClearDisabled =
    !searchQuery &&
    statusFilter === "ALL" &&
    priorityFilter === "ALL" &&
    assignedToFilter === "ALL" &&
    usernameFilter === "ALL";

  const triggerAutomationReproduce = (entryId: number) => {
    window.alert(t("qa.entries.automationTriggered", { id: entryId }));
  };

  const openEntryDetails = (entry: Entry) => {
    setSelectedEntry(entry);
  };

  const openEntryDetailsFromImage = (event: React.MouseEvent<HTMLElement>, entry: Entry) => {
    event.stopPropagation();
    openEntryDetails(entry);
  };

  const closeEntryDetails = () => {
    setSelectedEntry(null);
  };

  const getInitialValuesFromEntry = (entry: Entry): EntryModalInitialValues => ({
    username: entry.username || unknownLabel,
    title: entry.title,
    description: entry.description,
    stepsToReproduce: entry.stepsToReproduce || "",
    assignedTo: entry.assignedTo || "",
    fixStatus: entry.fixStatus && isFixStatus(entry.fixStatus) ? entry.fixStatus : "",
    screenshotClipName: entry.screenshotClipName || "",
    screenshotClipUrl: entry.screenshotClipUrl || "",
    ...(tableType === "TEST_CASES"
      ? {
          status: entry.status === "FAIL" ? "FAIL" : "SUCCESS",
          result: entry.result || "",
          expectedResult: entry.expectedResult || "",
        }
      : {
          priority: isIssuePriority(entry.status) ? entry.status : "",
        }),
  });

  const handleStartEditEntry = (event: React.MouseEvent, entry: Entry) => {
    event.stopPropagation();
    setEditingEntry(entry);
  };

  const handleDeleteEntry = async () => {
    if (!entryToDelete) return;

    setDeletingEntryId(entryToDelete.id);
    try {
      const response = await fetch(`/api/entries?id=${entryToDelete.id}`, { method: "DELETE" });
      if (!response.ok) return;

      if (selectedEntry?.id === entryToDelete.id) {
        setSelectedEntry(null);
      }
      await fetchEntries();
      setEntryToDelete(null);
      showSuccessMessage(t("qa.entries.deletedSuccess"));
    } finally {
      setDeletingEntryId(null);
    }
  };

  const exportToCSV = () => {
    const baseFileName = tableType === "TEST_CASES" ? "test-cases" : "issue-logs";
    downloadCsv({
      headers: exportHeaders,
      rows: exportRows,
      fileName: `${baseFileName}-export.csv`,
    });
    showSuccessMessage(t("qa.entries.exportCsvDownloaded"));
  };

  const exportToPDF = () => {
    const baseFileName = tableType === "TEST_CASES" ? "test-cases" : "issue-logs";
    const title =
      tableType === "TEST_CASES" ? t("qa.entries.exportTitleTestCases") : t("qa.entries.exportTitleIssueLogs");
    downloadPdf({
      title,
      headers: exportHeaders,
      rows: exportRows,
      fileName: `${baseFileName}-export.pdf`,
    });
    showSuccessMessage(t("qa.entries.exportPdfDownloaded"));
  };

  const exportToSheet = () => {
    const isTestCases = tableType === "TEST_CASES";
    downloadXlsx({
      headers: exportHeaders,
      rows: exportRows,
      sheetName: isTestCases ? t("qa.entries.testCases") : t("qa.entries.issueLogs"),
      fileName: `${isTestCases ? "test-cases" : "issue-logs"}-export.xlsx`,
    });
    showSuccessMessage(t("qa.entries.exportSheetDownloaded"));
  };

  const tableColumnCount = 5 + (tableType === "TEST_CASES" ? 3 : 1) + 2 + (isAutomationConfigured ? 1 : 0) + 3;
  const tableColumnKeys = useMemo(
    () => Array.from({ length: tableColumnCount }, (_, columnNumber) => `table-col-${columnNumber + 1}`),
    [tableColumnCount],
  );
  const minColumnWidthPx = 170;
  const tableMinWidthPx = Math.max(tableColumnCount * minColumnWidthPx, 1400);
  const renderCellActions = (entry: Entry) => (
    <div className="pointer-events-none absolute end-1 top-1 z-20 flex items-center gap-1 rounded-md border bg-background/95 p-1 opacity-0 shadow-sm transition-opacity duration-150 group-hover/cell:pointer-events-auto group-hover/cell:opacity-100 dark:bg-slate-950/95">
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-7 w-7"
        aria-label={t("qa.entries.updateEntryAria", { title: entry.title })}
        onClick={(event) => handleStartEditEntry(event, entry)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="h-7 w-7 text-destructive hover:text-destructive"
        aria-label={t("qa.entries.deleteEntryAria", { title: entry.title })}
        disabled={deletingEntryId === entry.id}
        onClick={(event) => {
          event.stopPropagation();
          setEntryToDelete(entry);
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-4 overflow-x-hidden">
      <div className="flex w-full min-w-0 max-w-full flex-wrap items-start justify-between gap-3 overflow-x-hidden">
        <h2 className="font-semibold text-xl">
          {tableType === "TEST_CASES" ? t("qa.entries.testCases") : t("qa.entries.issueLogs")}
        </h2>

        <div className="flex w-full min-w-0 max-w-full flex-col items-end gap-2 overflow-x-hidden">
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 overflow-x-hidden">
            <span className="text-muted-foreground text-xs">
              {filteredEntries.length} {t("qa.entries.results")}
            </span>
            <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 overflow-x-hidden">
              <Input
                placeholder={t("qa.entries.searchPlaceholder")}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="h-9 w-full min-w-0 max-w-[220px]"
              />

              <FilterSelect
                value={usernameFilter}
                onValueChange={setUsernameFilter}
                options={usernameOptions}
                allLabel={t("qa.entries.allReporters")}
                widthClassName="w-[145px]"
              />

              <FilterSelect
                value={assignedToFilter}
                onValueChange={setAssignedToFilter}
                options={assignedToOptions}
                allLabel={t("qa.entries.allAssignees")}
                widthClassName="w-fit"
              />

              {tableType === "TEST_CASES" ? (
                <FilterSelect
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                  options={[
                    { value: "SUCCESS", label: t("status.success") },
                    { value: "FAIL", label: t("status.fail") },
                  ]}
                  allLabel={t("qa.entries.allStatuses")}
                  widthClassName="w-[130px]"
                />
              ) : (
                <FilterSelect
                  value={priorityFilter}
                  onValueChange={setPriorityFilter}
                  options={[
                    { value: "HIGH", label: t("status.high") },
                    { value: "MEDIUM", label: t("status.medium") },
                    { value: "LOW", label: t("status.low") },
                  ]}
                  allLabel={t("qa.entries.allPriorities")}
                  widthClassName="w-[140px]"
                />
              )}

              <Button variant="ghost" size="sm" className="h-9 px-2" onClick={clearFilters} disabled={isClearDisabled}>
                {t("qa.entries.clear")}
              </Button>

              <LayoutSwitcher value={layoutMode} onChange={setLayoutMode} />
            </div>
          </div>

          <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 overflow-x-hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="me-2 h-4 w-4" />
                  {t("qa.entries.export")}
                  <ChevronDown className="ms-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportToPDF}>
                  <FileText className="me-2 h-4 w-4" />
                  {t("qa.entries.exportPdf")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToCSV}>
                  <Download className="me-2 h-4 w-4" />
                  {t("qa.entries.exportCsv")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={exportToSheet}>
                  <FileSpreadsheet className="me-2 h-4 w-4" />
                  {t("qa.entries.exportSheet")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setIsModalOpen(true)}>
              <PlusCircle className="me-2 h-4 w-4" />
              {t("qa.entries.addEntry")}
            </Button>
          </div>
        </div>
      </div>

      {layoutMode === "table" ? (
        <div className="w-full min-w-0 overflow-hidden rounded-md border">
          <div className="w-full min-w-0 overflow-x-auto">
            <Table
              className="w-full table-fixed text-sm [&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_th]:py-3"
              style={{ minWidth: `${tableMinWidthPx}px` }}
            >
              <colgroup>
                {tableColumnKeys.map((columnKey) => (
                  <col key={columnKey} style={{ width: `${100 / tableColumnCount}%` }} />
                ))}
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("qa.entries.id")}</TableHead>
                  <TableHead>{t("qa.entries.reporter")}</TableHead>
                  <TableHead>{t("qa.entryModal.title")}</TableHead>
                  <TableHead>{t("qa.entryModal.description")}</TableHead>
                  <TableHead>{t("qa.entryModal.steps")}</TableHead>
                  {tableType === "TEST_CASES" ? (
                    <>
                      <TableHead>{t("qa.entryModal.result")}</TableHead>
                      <TableHead>{t("qa.entries.expectedShort")}</TableHead>
                      <TableHead>{t("qa.entryModal.status")}</TableHead>
                    </>
                  ) : (
                    <TableHead>{t("qa.entryModal.priority")}</TableHead>
                  )}
                  <TableHead>{t("qa.entryModal.fixStatus")}</TableHead>
                  <TableHead>{t("qa.entries.media")}</TableHead>
                  {isAutomationConfigured && <TableHead>{t("qa.entries.reproduce")}</TableHead>}
                  <TableHead>{t("qa.entryModal.assignedTo")}</TableHead>
                  <TableHead>{t("common.dateAdded")}</TableHead>
                  <TableHead className="text-end">{t("common.lastUpdated")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={tableColumnCount} className="h-24 text-center">
                      {t("qa.entries.noEntries")}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((entry) => (
                    <TableRow
                      key={entry.id}
                      className="group cursor-pointer hover:bg-muted/40"
                      onClick={() => openEntryDetails(entry)}
                    >
                      <TableCell className="group/cell relative truncate font-medium" title={String(entry.id)}>
                        <span className="block truncate pe-16">{entry.id}</span>
                        {renderCellActions(entry)}
                      </TableCell>
                      <TableCell className="group/cell relative truncate" title={entry.username || unknownLabel}>
                        <span className="block truncate pe-16">{entry.username || unknownLabel}</span>
                        {renderCellActions(entry)}
                      </TableCell>
                      <TableCell className="group/cell relative truncate font-medium" title={entry.title}>
                        <span className="block truncate pe-16">{entry.title}</span>
                        {renderCellActions(entry)}
                      </TableCell>
                      <TableCell className="group/cell relative truncate" title={entry.description || "-"}>
                        <span className="block truncate pe-16">{entry.description || "-"}</span>
                        {renderCellActions(entry)}
                      </TableCell>
                      <TableCell className="group/cell relative truncate" title={entry.stepsToReproduce || "-"}>
                        <span className="block truncate pe-16">{entry.stepsToReproduce || "-"}</span>
                        {renderCellActions(entry)}
                      </TableCell>
                      {tableType === "TEST_CASES" ? (
                        <>
                          <TableCell className="group/cell relative truncate" title={entry.result || "-"}>
                            <span className="block truncate pe-16">{entry.result || "-"}</span>
                            {renderCellActions(entry)}
                          </TableCell>
                          <TableCell className="group/cell relative truncate" title={entry.expectedResult || "-"}>
                            <span className="block truncate pe-16">{entry.expectedResult || "-"}</span>
                            {renderCellActions(entry)}
                          </TableCell>
                          <TableCell className="group/cell relative">
                            <QaStatusBadge value={entry.status} />
                            {renderCellActions(entry)}
                          </TableCell>
                        </>
                      ) : (
                        <TableCell className="group/cell relative">
                          <QaStatusBadge value={entry.status} />
                          {renderCellActions(entry)}
                        </TableCell>
                      )}
                      <TableCell className="group/cell relative truncate">
                        <QaStatusBadge value={entry.fixStatus || ""} />
                        {renderCellActions(entry)}
                      </TableCell>
                      <TableCell className="group/cell relative">
                        {entry.screenshotClipUrl ? (
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs hover:bg-muted"
                            onClick={(event) => openEntryDetailsFromImage(event, entry)}
                          >
                            {t("qa.entries.preview")}
                          </button>
                        ) : (
                          <span className="text-muted-foreground text-xs">{t("qa.entries.noMedia")}</span>
                        )}
                        {renderCellActions(entry)}
                      </TableCell>
                      {isAutomationConfigured && (
                        <TableCell className="group/cell relative">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              triggerAutomationReproduce(entry.id);
                            }}
                          >
                            {t("qa.entries.run")}
                          </Button>
                          {renderCellActions(entry)}
                        </TableCell>
                      )}
                      <TableCell className="group/cell relative truncate" title={entry.assignedTo || unassignedLabel}>
                        <span className="block truncate pe-16">{entry.assignedTo || unassignedLabel}</span>
                        {renderCellActions(entry)}
                      </TableCell>
                      <TableCell className="group/cell relative truncate">
                        <span className="block truncate pe-16">
                          {new Date(entry.createdAt).toLocaleDateString(localeCode)}
                        </span>
                        {renderCellActions(entry)}
                      </TableCell>
                      <TableCell className="group/cell relative truncate text-end">
                        <span className="block truncate pe-16">
                          {formatLastUpdated(entry.createdAt, entry.updatedAt)}
                        </span>
                        {renderCellActions(entry)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-md border py-14 text-center text-muted-foreground">{t("qa.entries.noEntries")}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 transition-all sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {filteredEntries.map((entry) => (
            // biome-ignore lint/a11y/noStaticElementInteractions: Card click interaction is intentional for opening details.
            <div
              key={entry.id}
              className="group relative flex h-full cursor-pointer flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:bg-muted/20"
              onClick={() => openEntryDetails(entry)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openEntryDetails(entry);
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="truncate font-semibold" title={entry.title}>
                  {entry.title}
                </h3>
                <div className="transition-opacity duration-200 group-focus-within:opacity-0 group-hover:opacity-0">
                  <QaStatusBadge value={entry.status} />
                </div>
              </div>
              <div className="pointer-events-none absolute end-3 top-3 flex items-center gap-1 opacity-0 transition-all duration-200 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8"
                  aria-label={t("qa.entries.updateEntryAria", { title: entry.title })}
                  onClick={(event) => handleStartEditEntry(event, entry)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  aria-label={t("qa.entries.deleteEntryAria", { title: entry.title })}
                  disabled={deletingEntryId === entry.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setEntryToDelete(entry);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <p className="truncate text-muted-foreground text-sm" title={entry.description || "-"}>
                {entry.description || "-"}
              </p>

              <div className="grid gap-1 text-sm">
                <p className="truncate" title={entry.username || unknownLabel}>
                  <span className="text-muted-foreground">{t("qa.entries.reporterLabel")}:</span>{" "}
                  {entry.username || unknownLabel}
                </p>
                <p className="truncate" title={entry.assignedTo || unassignedLabel}>
                  <span className="text-muted-foreground">{t("qa.entries.assignedToLabel")}:</span>{" "}
                  {entry.assignedTo || unassignedLabel}
                </p>
              </div>

              {entry.screenshotClipUrl ? (
                <button
                  type="button"
                  className="group relative overflow-hidden rounded-md border bg-muted text-left"
                  onClick={(event) => openEntryDetailsFromImage(event, entry)}
                >
                  {isImageMedia(entry.screenshotClipUrl) ? (
                    <div className="relative h-32 w-full">
                      <Image
                        src={entry.screenshotClipUrl}
                        alt={entry.screenshotClipName || t("qa.entries.entryMediaPreviewAlt")}
                        fill
                        unoptimized
                        className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                    </div>
                  ) : (
                    <div className="flex h-20 items-center justify-center px-2 text-muted-foreground text-sm">
                      {truncateFallback(entry.screenshotClipName || t("qa.entries.openAttachment"), 36)}
                    </div>
                  )}
                </button>
              ) : null}

              <div className="mt-auto flex items-center justify-between pt-1">
                <span className="text-muted-foreground text-xs">{t("qa.entries.entryId", { id: entry.id })}</span>
                {isAutomationConfigured && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      triggerAutomationReproduce(entry.id);
                    }}
                  >
                    {t("qa.entries.run")}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedEntry ? (
        // biome-ignore lint/a11y/noStaticElementInteractions: Overlay click closes the details modal.
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 p-6 backdrop-blur-lg md:p-8 dark:bg-black/50"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEntryDetails();
            }
          }}
        >
          <div className="fade-in-0 zoom-in-95 relative h-[90vh] max-h-[90vh] w-full max-w-6xl animate-in overflow-hidden rounded-3xl border border-black/10 bg-white/80 text-foreground shadow-2xl shadow-black/20 backdrop-blur-xl transition-all duration-200 ease-out dark:border-white/10 dark:bg-zinc-900/70 dark:text-white dark:shadow-black/50">
            <button
              type="button"
              onClick={closeEntryDetails}
              className="absolute end-4 top-4 z-[10000] rounded-full bg-black/10 p-2 text-black backdrop-blur-md transition hover:bg-black/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">{t("qa.entries.closeDetailsModal")}</span>
            </button>

            <div className="grid h-full w-full grid-cols-1 bg-transparent md:grid-cols-2">
              <section className="h-full w-full min-w-0 overflow-y-auto overflow-x-hidden border-black/10 bg-white/40 p-8 text-foreground backdrop-blur-xl md:border-r dark:border-white/10 dark:bg-white/5 dark:text-white">
                <div className="mb-6 pe-12 text-start">
                  <h3 className="break-words font-semibold text-2xl [overflow-wrap:anywhere] md:text-3xl">
                    {selectedEntry.title}
                  </h3>
                  <p className="text-foreground/70 text-sm dark:text-white/70">
                    {t("qa.entries.entryId", { id: selectedEntry.id })}
                  </p>
                </div>

                <div className="grid w-full gap-5 text-sm md:text-base">
                  <div className="grid gap-3 md:grid-cols-2">
                    <p className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="block text-foreground/60 text-xs uppercase tracking-wide dark:text-white/60">
                        {t("qa.entries.reporter")}
                      </span>
                      {selectedEntry.username || unknownLabel}
                    </p>
                    <p className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="block text-foreground/60 text-xs uppercase tracking-wide dark:text-white/60">
                        {tableType === "TEST_CASES" ? t("qa.entryModal.status") : t("qa.entryModal.priority")}
                      </span>
                      <QaStatusBadge value={selectedEntry.status} />
                    </p>
                    <p className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="block text-foreground/60 text-xs uppercase tracking-wide dark:text-white/60">
                        {t("qa.entryModal.fixStatus")}
                      </span>
                      <QaStatusBadge value={selectedEntry.fixStatus || ""} />
                    </p>
                    <p className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="block text-foreground/60 text-xs uppercase tracking-wide dark:text-white/60">
                        {t("qa.entryModal.assignedTo")}
                      </span>
                      {selectedEntry.assignedTo || unassignedLabel}
                    </p>
                    <p className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="block text-foreground/60 text-xs uppercase tracking-wide dark:text-white/60">
                        {t("common.dateAdded")}
                      </span>
                      {new Date(selectedEntry.createdAt).toLocaleString(localeCode)}
                    </p>
                    <p className="min-w-0 [overflow-wrap:anywhere]">
                      <span className="block text-foreground/60 text-xs uppercase tracking-wide dark:text-white/60">
                        {t("common.lastUpdated")}
                      </span>
                      {hasBeenUpdated(selectedEntry.createdAt, selectedEntry.updatedAt)
                        ? new Date(selectedEntry.updatedAt).toLocaleString(localeCode)
                        : "-"}
                    </p>
                    <p className="min-w-0 [overflow-wrap:anywhere] md:col-span-2">
                      <span className="block text-foreground/60 text-xs uppercase tracking-wide dark:text-white/60">
                        {t("qa.entryModal.media")}
                      </span>
                      <span className="break-words">
                        {selectedEntry.screenshotClipName || t("qa.entries.noAttachment")}
                      </span>
                    </p>
                  </div>

                  <div className="w-full overflow-x-hidden">
                    <p className="font-medium">{t("qa.entryModal.description")}</p>
                    <p className="mt-2 max-h-[80vh] w-full max-w-prose overflow-y-auto whitespace-pre-wrap break-all leading-relaxed [overflow-wrap:anywhere]">
                      {selectedEntry.description || "-"}
                    </p>
                  </div>

                  <div className="w-full overflow-x-hidden">
                    <p className="font-medium">{t("qa.entryModal.steps")}</p>
                    <p className="mt-2 max-h-[80vh] w-full max-w-prose overflow-y-auto whitespace-pre-wrap break-all leading-relaxed [overflow-wrap:anywhere]">
                      {selectedEntry.stepsToReproduce || "-"}
                    </p>
                  </div>

                  {tableType === "TEST_CASES" ? (
                    <>
                      <div className="w-full overflow-x-hidden">
                        <p className="font-medium">{t("qa.entryModal.result")}</p>
                        <p className="mt-2 max-h-[80vh] w-full max-w-prose overflow-y-auto whitespace-pre-wrap break-all leading-relaxed [overflow-wrap:anywhere]">
                          {selectedEntry.result || "-"}
                        </p>
                      </div>

                      <div className="w-full overflow-x-hidden">
                        <p className="font-medium">{t("qa.entryModal.expected")}</p>
                        <p className="mt-2 max-h-[80vh] w-full max-w-prose overflow-y-auto whitespace-pre-wrap break-all leading-relaxed [overflow-wrap:anywhere]">
                          {selectedEntry.expectedResult || "-"}
                        </p>
                      </div>
                    </>
                  ) : null}

                  {isAutomationConfigured && (
                    <div className="w-full">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => triggerAutomationReproduce(selectedEntry.id)}
                      >
                        {t("qa.entries.automationRun")}
                      </Button>
                    </div>
                  )}
                </div>
              </section>

              <section className="flex h-full min-w-0 items-center justify-center bg-black/5 p-8 dark:bg-black/20">
                {selectedEntry.screenshotClipUrl ? (
                  isImageMedia(selectedEntry.screenshotClipUrl) ? (
                    <div className="relative h-full w-full">
                      <Image
                        src={selectedEntry.screenshotClipUrl}
                        alt={selectedEntry.screenshotClipName || t("qa.entries.mediaAlt", { id: selectedEntry.id })}
                        fill
                        unoptimized
                        className="object-contain"
                        sizes="(max-width: 768px) 100vw, 50vw"
                      />
                    </div>
                  ) : isVideoMedia(selectedEntry.screenshotClipUrl) ? (
                    <video src={selectedEntry.screenshotClipUrl} controls className="h-full w-full object-contain">
                      <track kind="captions" label={t("qa.entries.noCaptions")} />
                    </video>
                  ) : (
                    <a
                      href={selectedEntry.screenshotClipUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-black/20 bg-white/40 px-4 py-2 text-foreground underline backdrop-blur-md dark:border-white/30 dark:bg-white/20 dark:text-white"
                    >
                      {t("qa.entries.openAttachment")}
                    </a>
                  )
                ) : (
                  <p className="rounded-md border border-black/20 bg-white/40 px-4 py-2 text-foreground/75 text-sm backdrop-blur-md dark:border-white/30 dark:bg-white/20 dark:text-white/75">
                    {t("qa.entries.noAttachment")}
                  </p>
                )}
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {isModalOpen ? (
        <EntryModal
          tableId={tableId}
          tableType={tableType}
          mode="create"
          onClose={() => {
            setIsModalOpen(false);
            fetchEntries();
          }}
        />
      ) : null}

      {editingEntry ? (
        <EntryModal
          tableId={tableId}
          tableType={tableType}
          mode="edit"
          entryId={editingEntry.id}
          initialValues={getInitialValuesFromEntry(editingEntry)}
          onSuccess={(mode) => {
            if (mode === "edit") {
              showSuccessMessage(t("qa.entries.updatedSuccess"));
            }
          }}
          onClose={() => {
            setEditingEntry(null);
            fetchEntries();
          }}
        />
      ) : null}

      <AlertDialog
        open={Boolean(entryToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingEntryId) {
            setEntryToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("qa.entries.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("qa.entries.deleteDescription", { title: entryToDelete?.title || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingEntryId)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(deletingEntryId)}
              onClick={() => {
                void handleDeleteEntry();
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
