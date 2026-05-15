"use client";
"use no memo";

import { Download } from "lucide-react";

import { DataTable } from "@/components/data-table/data-table";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableViewOptions } from "@/components/data-table/data-table-view-options";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useDataTableInstance } from "@/hooks/use-data-table-instance";
import { useI18n } from "@/lib/i18n/use-i18n";

import { createRecentLeadsColumns } from "./columns.crm";
import { recentLeadsData } from "./crm.config";

export function TableCards() {
  const { t } = useI18n();
  const recentLeadsColumns = createRecentLeadsColumns(t);
  const table = useDataTableInstance({
    data: recentLeadsData,
    columns: recentLeadsColumns,
    getRowId: (row) => row.id.toString(),
  });

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs">
      <Card>
        <CardHeader>
          <CardTitle>{t("crm.recentLeads.title")}</CardTitle>
          <CardDescription>{t("crm.recentLeads.description")}</CardDescription>
          <CardAction>
            <div className="flex items-center gap-2">
              <DataTableViewOptions table={table} />
              <Button variant="outline" size="sm">
                <Download />
                <span className="hidden lg:inline">{t("qa.entries.export")}</span>
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="flex size-full flex-col gap-4">
          <div className="overflow-hidden rounded-md border">
            <DataTable table={table} columns={recentLeadsColumns} />
          </div>
          <DataTablePagination table={table} />
        </CardContent>
      </Card>
    </div>
  );
}
