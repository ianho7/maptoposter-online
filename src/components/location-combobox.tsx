'use client';

import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import * as m from '@/paraglide/messages';

interface LocationComboboxProps {
  options: { id: number | string; name: string }[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  emptyText: string;
  disabled?: boolean;
  isLoading?: boolean;
}

export const LocationCombobox = React.memo(function LocationCombobox({
  options,
  value,
  onValueChange,
  placeholder,
  emptyText,
  disabled = false,
  isLoading = false,
}: LocationComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');

  // 性能关键：只显示匹配的前 100 条结果，避免 DOM 节点过多导致卡顿
  const filteredOptions = React.useMemo(() => {
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
  }, [options, searchQuery]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between mt-1 bg-background border-border text-foreground font-normal"
          disabled={disabled || isLoading}
        >
          <span className="truncate">
            {isLoading ? m.loading() : (value || placeholder)}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={m.search_placeholder({ item: placeholder.toLowerCase() })}
            value={searchQuery}
            onValueChange={setSearchQuery}
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
                    setSearchQuery('');
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.name ? 'opacity-100' : 'opacity-0'
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
});
