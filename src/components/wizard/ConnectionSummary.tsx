import { mdiArrowRight } from "@mdi/js";
import { Icon } from "@/lib/icon";
import { Badge } from "@/components/ui/badge";
import { getEnvironmentLabel } from "@/lib/sitecore/xmcContext";
import type { ResourceAccessEntry } from "@/hooks/use-marketplace-client";

interface ConnectionSummaryProps {
  source: ResourceAccessEntry;
  destination: ResourceAccessEntry;
}

export function ConnectionSummary({ source, destination }: ConnectionSummaryProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Source</span>
      <Badge colorScheme="neutral">{getEnvironmentLabel(source)}</Badge>
      <Icon path={mdiArrowRight} size={0.75} className="text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Destination</span>
      <Badge colorScheme="primary">{getEnvironmentLabel(destination)}</Badge>
    </div>
  );
}
