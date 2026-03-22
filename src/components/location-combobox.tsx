import { useState, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import * as m from "@/paraglide/messages";

interface LocationComboboxProps {
  options: { id: number | string; name: string }[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  emptyText: string;
  disabled?: boolean;
  isLoading?: boolean;
}

export function LocationCombobox({
  options,
  value,
  onValueChange,
  placeholder,
  emptyText,
  disabled = false,
  isLoading = false,
}: LocationComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // 性能关键：只显示匹配的前 100 条结果，避免 DOM 节点过多导致卡顿
  const filteredOptions = useMemo(() => {
    if (!searchQuery) return options.slice(0, 100);

    const lowerQuery = searchQuery.toLowerCase();
    const matches = [];
    for (const option of options) {
      if (option.name.toLowerCase().includes(lowerQuery)) {
        matches.push(option);
        if (matches.length >= 100) break; // 限制展示数量
      }
    }
    return matches;
  }, [searchQuery, options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between mt-1 font-normal bg-card border-border text-card-foreground hover:border-transparent transition-colors"
          disabled={disabled || isLoading}
        >
          <span className="truncate">{isLoading ? m.loading() : value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform duration-150 ease-out" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 bg-card border-border">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={m.search_placeholder({ item: placeholder.toLowerCase() })}
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="bg-card text-card-foreground"
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.name}
                  onSelect={() => {
                    onValueChange(option.name);
                    setOpen(false);
                    setSearchQuery("");
                  }}
                  className="text-card-foreground"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 text-primary transition-opacity duration-150 ease-out",
                      value === option.name ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
