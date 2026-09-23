"use client";

import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getEnvironmentLabel, getSitecoreContextId } from "@/lib/sitecore/xmcContext";
import type { ResourceAccessEntry } from "@/hooks/use-marketplace-client";

interface EnvironmentSelectProps {
  label: string;
  placeholder: string;
  resourceAccess: ResourceAccessEntry[];
  value: ResourceAccessEntry | null;
  onChange: (entry: ResourceAccessEntry | null) => void;
}

// One of the app-granted environments this installation was authorized for --
// used everywhere the wizard, Generate, or Install needs the user to pick a
// source or destination without entering credentials.
export function EnvironmentSelect({ label, placeholder, resourceAccess, value, onChange }: EnvironmentSelectProps) {
  return (
    <FieldGroup className="mt-0">
      <Field>
        <FieldContent>
          <FieldLabel>{label}</FieldLabel>
        </FieldContent>
        <Select
          value={value ? getSitecoreContextId(value) : ""}
          onValueChange={(contextId) =>
            onChange(resourceAccess.find((entry) => getSitecoreContextId(entry) === contextId) ?? null)
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {resourceAccess.map((entry) => (
              <SelectItem key={getSitecoreContextId(entry)} value={getSitecoreContextId(entry)}>
                {getEnvironmentLabel(entry)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </FieldGroup>
  );
}
