"use client";

import { useCallback, useEffect, useState } from "react";

import Link from "next/link";

import { ArrowLeft, Pencil, PlusCircle, Trash2 } from "lucide-react";
import { getSession } from "next-auth/react";

import { DashboardHeaderPath } from "@/app/(main)/dashboard/_components/dashboard-header-path";
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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { USER_ROLES, type UserRole } from "@/lib/auth/roles";
import type { TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";
import { showSuccessMessage } from "@/lib/notifications";

import { DataTable } from "./data-table";
import { FilterSelect } from "./filter-select";

type TableKind = "TEST_CASES" | "ISSUE_LOGS";

type ProjectTable = {
  id: string;
  name: string;
  tableType: TableKind;
  createdAt: string;
  updatedAt: string;
};

type ProjectDetails = {
  id: string;
  name: string;
  logo: string | null;
  createdBy: string | null;
  user: {
    name: string | null;
    email?: string | null;
  } | null;
  tables: ProjectTable[];
};

type SessionState = {
  user?: {
    role?: UserRole | null;
  };
} | null;

const TABLES_VIEW_MODE_STORAGE_KEY = "qa-boards-tables-view-mode";

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const { t, locale } = useI18n();
  const localeCode = locale === "ar" ? "ar-SA" : "en-US";
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isNonAdminRestrictionDialogOpen, setIsNonAdminRestrictionDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [isUpdatingTable, setIsUpdatingTable] = useState(false);
  const [deletingTableId, setDeletingTableId] = useState<string | null>(null);
  const [tableToDelete, setTableToDelete] = useState<ProjectTable | null>(null);
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [tableName, setTableName] = useState("");
  const [editTableName, setEditTableName] = useState("");
  const [tableType, setTableType] = useState<TableKind | "">("");
  const [editTableType, setEditTableType] = useState<TableKind>("TEST_CASES");
  const [createTableError, setCreateTableError] = useState<string | null>(null);
  const [createTableFieldErrors, setCreateTableFieldErrors] = useState<{ name?: string; tableType?: string }>({});
  const [updateTableError, setUpdateTableError] = useState<string | null>(null);
  const [tableViewMode, setTableViewMode] = useState<LayoutSwitcherValue>(() => {
    if (typeof window === "undefined") {
      return "grid";
    }

    const storedViewMode = window.localStorage.getItem(TABLES_VIEW_MODE_STORAGE_KEY);
    if (storedViewMode === "grid" || storedViewMode === "table") return storedViewMode;
    if (storedViewMode === "cards") return "grid";
    return "grid";
  });
  const [tableTypeFilter, setTableTypeFilter] = useState<"ALL" | TableKind>("ALL");
  const [createdByFilter, setCreatedByFilter] = useState("ALL");
  const [tableSearchQuery, setTableSearchQuery] = useState("");
  const [session, setSession] = useState<SessionState>(null);

  const isAdmin = session?.user?.role === USER_ROLES.ADMIN;
  const mapTableError = useCallback(
    (message: unknown, fallbackKey: TranslationKey) => {
      if (typeof message !== "string" || message.length === 0) return t(fallbackKey);
      if (message === "You must be signed in to create a table.") return t("qa.tables.restrictedRequest");
      if (message === "Only admins can create tables.") return t("qa.tables.restrictedRequest");
      if (message === "Table name and project ID are required") return t("qa.tables.nameProjectRequired");
      if (message === "Table Type is required.") return t("qa.tables.fieldTypeRequired");
      if (message === "A table with this name already exists in this project.") return t("qa.tables.duplicateName");
      if (message === "Table ID and name are required") return t("qa.tables.tableIdNameRequired");
      if (message === "Table not found.") return t("qa.tables.tableNotFound");
      return t(fallbackKey);
    },
    [t],
  );

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);

      if (!res.ok) {
        setProject(null);
        return;
      }

      const data = (await res.json()) as ProjectDetails;
      setProject(data);
      setSelectedTableId((prev) => {
        if (prev && data.tables.some((table) => table.id === prev)) {
          return prev;
        }
        return null;
      });
    } catch (_error) {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    getSession().then((data) => setSession(data as SessionState));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(TABLES_VIEW_MODE_STORAGE_KEY, tableViewMode);
  }, [tableViewMode]);

  const handleOpenCreateTableDialog = () => {
    if (!isAdmin) {
      setIsNonAdminRestrictionDialogOpen(true);
      return;
    }

    setIsCreateDialogOpen(true);
  };

  const handleCreateTable = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin) {
      setIsNonAdminRestrictionDialogOpen(true);
      return;
    }

    setIsCreatingTable(true);
    setCreateTableError(null);
    setCreateTableFieldErrors({});
    const fieldErrors: { name?: string; tableType?: string } = {};
    if (!tableName.trim()) fieldErrors.name = t("qa.tables.fieldNameRequired");
    if (!tableType) fieldErrors.tableType = t("qa.tables.fieldTypeRequired");
    if (fieldErrors.name || fieldErrors.tableType) {
      setCreateTableFieldErrors(fieldErrors);
      setCreateTableError(t("qa.tables.createError"));
      setIsCreatingTable(false);
      return;
    }

    try {
      const res = await fetch("/api/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tableName,
          projectId,
          tableType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCreateTableError(mapTableError(data?.error, "qa.tables.createFailed"));
        return;
      }

      await fetchProject();
      setSelectedTableId(null);
      setTableName("");
      setTableType("");
      setCreateTableError(null);
      setIsCreateDialogOpen(false);
    } catch (_error) {
      setCreateTableError(t("qa.tables.createFailed"));
    } finally {
      setIsCreatingTable(false);
    }
  };

  const handleStartEditTable = (table: ProjectTable) => {
    setEditingTableId(table.id);
    setEditTableName(table.name);
    setEditTableType(table.tableType);
    setUpdateTableError(null);
    setIsEditDialogOpen(true);
  };

  const handleUpdateTable = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingTableId) return;

    setIsUpdatingTable(true);
    setUpdateTableError(null);
    try {
      const res = await fetch("/api/tables", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTableId,
          name: editTableName,
          tableType: editTableType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setUpdateTableError(mapTableError(data?.error, "qa.tables.updateFailed"));
        return;
      }

      await fetchProject();
      setIsEditDialogOpen(false);
      setEditingTableId(null);
      setUpdateTableError(null);
      showSuccessMessage(t("qa.tables.updatedSuccess"));
    } catch (_error) {
      setUpdateTableError(t("qa.tables.updateFailed"));
    } finally {
      setIsUpdatingTable(false);
    }
  };

  const handleDeleteTable = async () => {
    if (!tableToDelete) return;

    const tableId = tableToDelete.id;
    setDeletingTableId(tableId);
    try {
      const res = await fetch(`/api/tables?id=${tableId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        return;
      }

      if (selectedTableId === tableId) {
        setSelectedTableId(null);
      }
      await fetchProject();
      setTableToDelete(null);
      showSuccessMessage(t("qa.tables.deletedSuccess"));
    } catch (_error) {
      // No-op
    } finally {
      setDeletingTableId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full w-full min-w-0 max-w-full items-center justify-center overflow-x-hidden">
        {t("common.loadingProject")}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="project-page flex h-full w-full min-w-0 max-w-full flex-col gap-6 overflow-hidden">
        <DashboardHeaderPath>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/dashboard/qa-boards" prefetch={false}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="font-semibold text-xl">{t("qa.projects.project")}</h1>
        </DashboardHeaderPath>
        <div className="flex flex-1 items-center justify-center text-muted-foreground">{t("qa.tables.notFound")}</div>
      </div>
    );
  }

  const selectedTable = project.tables.find((table) => table.id === selectedTableId) || null;
  const tableCreatorDisplay = project.user?.name || project.user?.email || project.createdBy || t("common.unknown");
  const isTableOpen = Boolean(selectedTable);
  const createdByOptions = [{ value: tableCreatorDisplay, label: tableCreatorDisplay }];
  const filteredTables = project.tables.filter((table) => {
    const normalizedQuery = tableSearchQuery.trim().toLowerCase();
    const matchesSearch = !normalizedQuery || table.name.toLowerCase().includes(normalizedQuery);
    const matchesType = tableTypeFilter === "ALL" || table.tableType === tableTypeFilter;
    const matchesCreator = createdByFilter === "ALL" || tableCreatorDisplay === createdByFilter;
    return matchesSearch && matchesType && matchesCreator;
  });
  const clearTableFilters = () => {
    setTableSearchQuery("");
    setTableTypeFilter("ALL");
    setCreatedByFilter("ALL");
  };
  const isTableFilterClearDisabled = !tableSearchQuery && tableTypeFilter === "ALL" && createdByFilter === "ALL";

  const projectHeading = (
    <div className="flex min-w-0 items-center gap-2">
      <h2 className="min-w-0 break-words font-semibold text-xl tracking-tight">{project.name}</h2>
    </div>
  );

  return (
    <div className="project-page flex h-full w-full min-w-0 max-w-full flex-col gap-6 overflow-hidden">
      <DashboardHeaderPath>
        {isTableOpen ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSelectedTableId(null)}
            aria-label={t("qa.tables.backToOverview")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/dashboard/qa-boards" prefetch={false}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
        )}
        <span className="font-normal text-muted-foreground text-sm">{project.name}</span>
        {isTableOpen ? (
          <>
            <span className="text-muted-foreground text-sm">&gt;</span>
            <span className="font-normal text-muted-foreground text-sm">{selectedTable?.name}</span>
          </>
        ) : null}
      </DashboardHeaderPath>
      {project.tables.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex w-full min-w-0 items-center justify-between gap-3 rtl:flex-row-reverse">
            {projectHeading}
            <Button onClick={handleOpenCreateTableDialog}>
              <PlusCircle className="mr-2 h-4 w-4" />
              {t("qa.tables.create")}
            </Button>
          </div>
          <div className="flex flex-1 items-center justify-center text-center">
            <p className="text-muted-foreground">{t("qa.tables.empty")}</p>
          </div>
        </div>
      ) : selectedTableId ? (
        <div className="flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-hidden">
          <DataTable
            tableId={selectedTableId}
            tableType={selectedTable?.tableType || "TEST_CASES"}
            tableName={selectedTable?.name}
          />
        </div>
      ) : (
        <>
          <div className="project-toolbar flex w-full min-w-0 max-w-full flex-wrap items-center justify-between gap-3 overflow-x-hidden">
            <div className="flex w-full min-w-0 items-center justify-between gap-3 rtl:flex-row-reverse">
              {projectHeading}
              <Button onClick={handleOpenCreateTableDialog}>
                <PlusCircle className="mr-2 h-4 w-4" />
                {t("qa.tables.create")}
              </Button>
            </div>
            <div className="flex w-full min-w-0 max-w-full flex-col items-end gap-2 overflow-x-hidden">
              <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 overflow-x-hidden rtl:flex-row-reverse">
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-2 overflow-x-hidden rtl:justify-end">
                  <Input
                    placeholder={t("qa.tables.searchPlaceholder")}
                    value={tableSearchQuery}
                    onChange={(event) => setTableSearchQuery(event.target.value)}
                    className="h-9 w-full min-w-0 max-w-[220px]"
                  />
                  <FilterSelect
                    value={tableTypeFilter}
                    onValueChange={(value) => setTableTypeFilter(value as "ALL" | TableKind)}
                    options={[
                      { value: "TEST_CASES", label: t("qa.tables.testCases") },
                      { value: "ISSUE_LOGS", label: t("qa.tables.issueLogs") },
                    ]}
                    allLabel={t("qa.tables.allTypes")}
                    widthClassName="w-[140px]"
                  />

                  <FilterSelect
                    value={createdByFilter}
                    onValueChange={setCreatedByFilter}
                    options={createdByOptions}
                    allLabel={t("qa.tables.allUsers")}
                    widthClassName="w-[150px]"
                  />

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="whitespace-nowrap text-muted-foreground text-xs">
                      {filteredTables.length} {t("common.results")}
                    </span>
                    {!isTableFilterClearDisabled && (
                      <Button variant="ghost" size="sm" className="h-9 px-2" onClick={clearTableFilters}>
                        {t("common.clear")}
                      </Button>
                    )}
                  </div>
                </div>
                <LayoutSwitcher value={tableViewMode} onChange={setTableViewMode} className="shrink-0" />
              </div>
            </div>
          </div>

          <div className="project-scroll">
            {tableViewMode === "grid" ? (
              <div className="flex flex-wrap items-start gap-4">
                {filteredTables.length === 0 ? (
                  <div className="w-full rounded-container border py-14 text-center text-muted-foreground">
                    {t("qa.tables.noResults")}
                  </div>
                ) : (
                  filteredTables.map((table) => (
                    <Card key={table.id} className="group h-fit w-fit max-w-full gap-3 py-4">
                      <CardHeader className="gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-xl">{table.name}</CardTitle>
                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-8 w-8"
                              aria-label={t("qa.tables.updateAria", { name: table.name })}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleStartEditTable(table);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              aria-label={t("qa.tables.deleteAria", { name: table.name })}
                              disabled={Boolean(deletingTableId)}
                              onClick={(event) => {
                                event.stopPropagation();
                                setTableToDelete(table);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col gap-2 text-muted-foreground text-sm">
                          <p>
                            {t("qa.tables.type")}:{" "}
                            {table.tableType === "TEST_CASES" ? t("qa.tables.testCases") : t("qa.tables.issueLogs")}
                          </p>
                          <p>
                            {t("qa.tables.createdBy")}: {tableCreatorDisplay}
                          </p>
                          <p>
                            {t("qa.tables.created")}: {new Date(table.createdAt).toLocaleDateString(localeCode)}
                          </p>
                        </div>
                      </CardContent>
                      <CardFooter className="pt-2">
                        <Button
                          className="w-full bg-blue-600 text-white hover:bg-blue-700"
                          onClick={() => setSelectedTableId(table.id)}
                        >
                          {t("qa.tables.open")}
                        </Button>
                      </CardFooter>
                    </Card>
                  ))
                )}
              </div>
            ) : (
              <div className="w-full min-w-0 max-w-full overflow-x-hidden rounded-container border">
                <div className="w-full min-w-0 max-w-full overflow-x-auto">
                  <Table className="w-full table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/5 px-3 py-2 text-start">{t("qa.tables.tableName")}</TableHead>
                        <TableHead className="w-1/5 px-3 py-2 text-start">{t("qa.tables.type")}</TableHead>
                        <TableHead className="w-1/5 px-3 py-2 text-start">{t("qa.tables.createdBy")}</TableHead>
                        <TableHead className="w-1/5 px-3 py-2 text-start">{t("qa.tables.created")}</TableHead>
                        <TableHead className="w-1/5 px-3 py-2 text-end">{t("qa.tables.lastUpdated")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTables.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 px-3 py-2 text-center text-muted-foreground">
                            {t("qa.tables.noResults")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredTables.map((table) => (
                          <TableRow
                            key={table.id}
                            className="group cursor-pointer"
                            onClick={() => setSelectedTableId(table.id)}
                          >
                            <TableCell className="w-1/5 px-3 py-2 font-medium">
                              <span className="block truncate">{table.name}</span>
                            </TableCell>
                            <TableCell className="w-1/5 px-3 py-2">
                              <span className="block truncate">
                                {table.tableType === "TEST_CASES" ? t("qa.tables.testCases") : t("qa.tables.issueLogs")}
                              </span>
                            </TableCell>
                            <TableCell className="w-1/5 px-3 py-2">
                              <span className="block truncate">{tableCreatorDisplay}</span>
                            </TableCell>
                            <TableCell className="w-1/5 px-3 py-2">
                              {new Date(table.createdAt).toLocaleDateString(localeCode)}
                            </TableCell>
                            <TableCell className="w-1/5 px-3 py-2 text-end">
                              <div className="relative flex min-h-8 w-full items-center justify-end">
                                <span className="transition-opacity group-focus-within:opacity-0 group-hover:opacity-0">
                                  {new Date(table.updatedAt).toLocaleDateString(localeCode)}
                                </span>
                                <div className="-translate-y-1/2 pointer-events-none absolute end-0 top-1/2 flex items-center gap-1 opacity-0 transition-opacity group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="h-8 w-8"
                                    aria-label={t("qa.tables.updateAria", { name: table.name })}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleStartEditTable(table);
                                    }}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    aria-label={t("qa.tables.deleteAria", { name: table.name })}
                                    disabled={Boolean(deletingTableId)}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setTableToDelete(table);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <Dialog
        open={isCreateDialogOpen}
        onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (open) {
            setCreateTableError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleCreateTable}>
            <DialogHeader>
              <DialogTitle>{t("qa.tables.createDialogTitle")}</DialogTitle>
              <DialogDescription className={createTableError ? "text-destructive" : undefined}>
                {createTableError || t("qa.tables.createDialogDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="table-creator">{t("addProject.creator")}</Label>
                <Input id="table-creator" value={tableCreatorDisplay} disabled />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="table-name">{t("qa.tables.tableName")}</Label>
                <Input
                  id="table-name"
                  placeholder={`e.g. ${t("qa.tables.testCases")} Regression`}
                  value={tableName}
                  onChange={(event) => setTableName(event.target.value)}
                  aria-invalid={Boolean(createTableFieldErrors.name)}
                  className={
                    createTableFieldErrors.name ? "border-destructive focus-visible:ring-destructive/40" : undefined
                  }
                />
                {createTableFieldErrors.name ? (
                  <p className="text-destructive text-xs">{createTableFieldErrors.name}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="table-type">{t("qa.tables.type")}</Label>
                <select
                  id="table-type"
                  className={`h-10 rounded-md border bg-background px-3 py-2 text-sm ${createTableFieldErrors.tableType ? "border-destructive focus-visible:ring-destructive/40" : "border-input"}`}
                  value={tableType}
                  onChange={(event) => setTableType(event.target.value as TableKind | "")}
                >
                  <option value="">{t("qa.tables.selectType")}</option>
                  <option value="TEST_CASES">{t("qa.tables.testCasesTable")}</option>
                  <option value="ISSUE_LOGS">{t("qa.tables.issueLogsTable")}</option>
                </select>
                {createTableFieldErrors.tableType ? (
                  <p className="text-destructive text-xs">{createTableFieldErrors.tableType}</p>
                ) : null}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isCreatingTable}>
                {isCreatingTable ? `${t("common.create")}...` : t("qa.tables.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setEditingTableId(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[425px]">
          <form onSubmit={handleUpdateTable}>
            <DialogHeader>
              <DialogTitle>{t("qa.tables.updateDialogTitle")}</DialogTitle>
              <DialogDescription className={updateTableError ? "text-destructive" : undefined}>
                {updateTableError || t("qa.tables.updateDialogDesc")}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-table-name">{t("qa.tables.tableName")}</Label>
                <Input
                  id="edit-table-name"
                  placeholder={`e.g. ${t("qa.tables.testCases")} Regression`}
                  value={editTableName}
                  onChange={(event) => setEditTableName(event.target.value)}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-table-type">{t("qa.tables.type")}</Label>
                <select
                  id="edit-table-type"
                  className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editTableType}
                  onChange={(event) => setEditTableType(event.target.value as TableKind)}
                >
                  <option value="TEST_CASES">{t("qa.tables.testCasesTable")}</option>
                  <option value="ISSUE_LOGS">{t("qa.tables.issueLogsTable")}</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isUpdatingTable}>
                {isUpdatingTable ? `${t("common.save")}...` : t("common.saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(tableToDelete)}
        onOpenChange={(open) => {
          if (!open && !deletingTableId) {
            setTableToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("qa.tables.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("qa.tables.deleteDesc", { name: tableToDelete?.name || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingTableId)}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(deletingTableId)}
              onClick={() => {
                void handleDeleteTable();
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isNonAdminRestrictionDialogOpen} onOpenChange={setIsNonAdminRestrictionDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{t("common.restricted")}</DialogTitle>
            <DialogDescription>{t("qa.tables.restrictedRequest")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setIsNonAdminRestrictionDialogOpen(false)}>
              {t("common.ok")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
