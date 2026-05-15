"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type FilterOption = {
  value: string;
  label: string;
};

export function FilterSelect({
  value,
  onValueChange,
  placeholder,
  options,
  allLabel = "All",
  widthClassName = "w-[170px]",
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  options: FilterOption[];
  allLabel?: string;
  widthClassName?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={`h-9 ${widthClassName}`}>
        <SelectValue placeholder={placeholder || allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
