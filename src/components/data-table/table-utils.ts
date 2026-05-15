"use no memo";

import type { ColumnDef } from "@tanstack/react-table";

import { createDragColumn } from "./drag-column";

type DndRow = {
  id: string | number;
};

export function withDndColumn<T extends DndRow>(columns: ColumnDef<T>[]): ColumnDef<T>[] {
  return [createDragColumn<T>(), ...columns];
}
