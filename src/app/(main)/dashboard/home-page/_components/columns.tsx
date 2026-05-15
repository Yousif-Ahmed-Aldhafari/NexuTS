import type { ColumnDef } from "@tanstack/react-table";
import { CircleCheck, EllipsisVertical, Loader } from "lucide-react";
import { toast } from "sonner";
import type { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TranslationKey } from "@/lib/i18n";

import { DataTableColumnHeader } from "../../../../../components/data-table/data-table-column-header";
import type { sectionSchema } from "./schema";
import { TableCellViewer } from "./table-cell-viewer";

type TranslateFn = (key: TranslationKey, params?: Record<string, string | number | null | undefined>) => string;

export const createDashboardColumns = (t: TranslateFn): ColumnDef<z.infer<typeof sectionSchema>>[] => [
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label={t("dashboard.sections.selectAll")}
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label={t("dashboard.sections.selectRow")}
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "header",
    header: ({ column }) => <DataTableColumnHeader column={column} title={t("dashboard.sections.headerColumn")} />,
    cell: ({ row }) => {
      return <TableCellViewer item={row.original} />;
    },
    enableSorting: false,
  },
  {
    accessorKey: "type",
    header: ({ column }) => <DataTableColumnHeader column={column} title={t("dashboard.sections.sectionType")} />,
    cell: ({ row }) => (
      <div className="w-32">
        <Badge variant="outline" className="px-1.5 text-muted-foreground">
          {row.original.type}
        </Badge>
      </div>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title={t("dashboard.sections.status")} />,
    cell: ({ row }) => (
      <Badge variant="outline" className="px-1.5 text-muted-foreground">
        {row.original.status === "Done" ? (
          <CircleCheck className="fill-green-500 stroke-border dark:fill-green-400" />
        ) : (
          <Loader />
        )}
        {row.original.status}
      </Badge>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "target",
    header: ({ column }) => (
      <DataTableColumnHeader className="w-full text-end" column={column} title={t("dashboard.sections.target")} />
    ),
    cell: ({ row }) => (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          toast.promise(new Promise((resolve) => setTimeout(resolve, 1000)), {
            loading: t("dashboard.sections.saving", { section: row.original.header }),
            success: t("dashboard.sections.saved"),
            error: t("dashboard.sections.error"),
          });
        }}
      >
        <Label htmlFor={`${row.original.id}-target`} className="sr-only">
          {t("dashboard.sections.target")}
        </Label>
        <Input
          className="h-8 w-16 border-transparent bg-transparent text-end shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background dark:bg-transparent dark:focus-visible:bg-input/30 dark:hover:bg-input/30"
          defaultValue={row.original.target}
          id={`${row.original.id}-target`}
        />
      </form>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "limit",
    header: ({ column }) => (
      <DataTableColumnHeader className="w-full text-end" column={column} title={t("dashboard.sections.limit")} />
    ),
    cell: ({ row }) => (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          toast.promise(new Promise((resolve) => setTimeout(resolve, 1000)), {
            loading: t("dashboard.sections.saving", { section: row.original.header }),
            success: t("dashboard.sections.saved"),
            error: t("dashboard.sections.error"),
          });
        }}
      >
        <Label htmlFor={`${row.original.id}-limit`} className="sr-only">
          {t("dashboard.sections.limit")}
        </Label>
        <Input
          className="h-8 w-16 border-transparent bg-transparent text-end shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background dark:bg-transparent dark:focus-visible:bg-input/30 dark:hover:bg-input/30"
          defaultValue={row.original.limit}
          id={`${row.original.id}-limit`}
        />
      </form>
    ),
    enableSorting: false,
  },
  {
    accessorKey: "reviewer",
    header: ({ column }) => <DataTableColumnHeader column={column} title={t("dashboard.sections.reviewer")} />,
    cell: ({ row }) => {
      const isAssigned = row.original.reviewer !== t("dashboard.sections.assignReviewer");

      if (isAssigned) {
        return row.original.reviewer;
      }

      return (
        <>
          <Label htmlFor={`${row.original.id}-reviewer`} className="sr-only">
            {t("dashboard.sections.reviewer")}
          </Label>
          <Select>
            <SelectTrigger
              className="w-38 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
              size="sm"
              id={`${row.original.id}-reviewer`}
            >
              <SelectValue placeholder={t("dashboard.sections.assignReviewer")} />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="Eddie Lake">Eddie Lake</SelectItem>
              <SelectItem value="Jamik Tashpulatov">Jamik Tashpulatov</SelectItem>
            </SelectContent>
          </Select>
        </>
      );
    },
    enableSorting: false,
  },
  {
    id: "actions",
    cell: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="flex size-8 text-muted-foreground data-[state=open]:bg-muted" size="icon">
            <EllipsisVertical />
            <span className="sr-only">{t("dashboard.sections.openMenu")}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem>{t("dashboard.sections.edit")}</DropdownMenuItem>
          <DropdownMenuItem>{t("dashboard.sections.makeCopy")}</DropdownMenuItem>
          <DropdownMenuItem>{t("dashboard.sections.favorite")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">{t("dashboard.sections.delete")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    enableSorting: false,
  },
];
