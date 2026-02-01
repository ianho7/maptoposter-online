'use client';

// import { useState } from 'react';
import type { MapColors } from '@/lib/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

interface ColorPickerProps {
  colors: MapColors;
  onChange: (colors: MapColors) => void;
}

const COLOR_LABELS: Record<keyof MapColors, string> = {
  bg: 'Background',
  text: 'Text',
  gradient_color: 'Gradient',
  water: 'Water',
  parks: 'Parks',
  road_motorway: 'Motorway',
  road_primary: 'Primary Road',
  road_secondary: 'Secondary Road',
  road_tertiary: 'Tertiary Road',
  road_residential: 'Residential',
  road_default: 'Default Road',
};

const COLOR_GROUPS = {
  basic: ['bg', 'text', 'gradient_color'] as (keyof MapColors)[],
  nature: ['water', 'parks'] as (keyof MapColors)[],
  roads: ['road_motorway', 'road_primary', 'road_secondary', 'road_tertiary', 'road_residential', 'road_default'] as (keyof MapColors)[],
};

export function ColorPicker({ colors, onChange }: ColorPickerProps) {
  const handleColorChange = (key: keyof MapColors, value: string) => {
    onChange({ ...colors, [key]: value });
  };

  return (
    <Accordion type="single" collapsible className="w-full" defaultValue="basic">
      <AccordionItem value="basic" className="border-border/50">
        <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
          Basic Colors
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-1 gap-3 pt-2">
            {COLOR_GROUPS.basic.map((key) => (
              <ColorInput
                key={key}
                label={COLOR_LABELS[key]}
                value={colors[key]}
                onChange={(value) => handleColorChange(key, value)}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="nature" className="border-border/50">
        <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
          Nature Elements
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-1 gap-3 pt-2">
            {COLOR_GROUPS.nature.map((key) => (
              <ColorInput
                key={key}
                label={COLOR_LABELS[key]}
                value={colors[key]}
                onChange={(value) => handleColorChange(key, value)}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="roads" className="border-border/50">
        <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
          Road Colors
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-1 gap-3 pt-2">
            {COLOR_GROUPS.roads.map((key) => (
              <ColorInput
                key={key}
                label={COLOR_LABELS[key]}
                value={colors[key]}
                onChange={(value) => handleColorChange(key, value)}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function ColorInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer border border-border appearance-none bg-transparent"
          style={{ backgroundColor: value }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <Label className="text-xs text-muted-foreground block mb-1">{label}</Label>
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 text-xs font-mono bg-card/50"
        />
      </div>
    </div>
  );
}
