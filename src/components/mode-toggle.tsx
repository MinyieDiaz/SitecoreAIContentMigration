"use client";

import { useTheme } from "next-themes";
import { mdiCheck, mdiMonitor, mdiThemeLightDark, mdiWeatherNight, mdiWeatherSunny } from "@mdi/js";
import { Icon } from "@/lib/icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: mdiWeatherSunny },
  { value: "dark", label: "Dark", icon: mdiWeatherNight },
  { value: "system", label: "System", icon: mdiMonitor },
] as const;

export function ModeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("size-7", className)} aria-label="Toggle theme">
          <Icon path={mdiThemeLightDark} size={0.85} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEME_OPTIONS.map((option) => (
          <DropdownMenuItem key={option.value} onClick={() => setTheme(option.value)}>
            <Icon path={option.icon} size={0.75} />
            <span>{option.label}</span>
            {theme === option.value && <Icon path={mdiCheck} size={0.75} className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
