"use no memo";

import { useSortable } from "@dnd-kit/sortable";
import type { ColumnDef } from "@tanstack/react-table";
import { GripVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/use-i18n";

type RowWithId = {
  id: string | number;
};

function DragHandle({ id }: { id: RowWithId["id"] }) {
  const { t } = useI18n();
  const { attributes, listeners } = useSortable({
    id,
  });

  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground hover:bg-transparent"
    >
      <GripVertical className="size-3 text-muted-foreground" />
      <span className="sr-only">{t("table.dragToReorder")}</span>
    </Button>
  );
}

export function createDragColumn<T extends RowWithId>(): ColumnDef<T> {
  return {
    id: "drag",
    header: () => null,
    cell: ({ row }) => <DragHandle id={row.original.id} />,
    enableSorting: false,
    enableHiding: false,
  };
}
