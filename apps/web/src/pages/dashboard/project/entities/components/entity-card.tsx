import { useState, useMemo } from "react";
import { Link } from "react-router";
import type { NgsiLdEntityType } from "@repo/types/endpoints/ngsi-ld/entities.endpoints";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  LineChart,
  Link2,
  MapPin,
  Trash2,
  Tag,
} from "lucide-react";

import { parseEntityAttributes } from "./entity-utils";

type Props = {
  entity: NgsiLdEntityType;
  entityHref: string;
  onSelect: (entity: NgsiLdEntityType) => void;
  onDelete: (entity: NgsiLdEntityType) => void;
};

function formatRelativeTime(dateStr?: string): string {
  if (!dateStr) return "Just now";
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    if (diffMs < 0 || isNaN(diffMs)) return dateStr;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 10) return "Just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    return `${diffDays}d ago`;
  } catch {
    return dateStr;
  }
}

export function EntityCard({ entity, entityHref, onSelect, onDelete }: Props) {
  const [isCopied, setIsCopied] = useState(false);

  const attributes = useMemo(() => parseEntityAttributes(entity), [entity]);

  const typeDisplay = Array.isArray(entity.type)
    ? entity.type.join(", ")
    : entity.type || "Entity";

  // Friendly short identifier
  const shortId = entity.id.includes(":")
    ? entity.id.split(":").slice(-2).join(":")
    : entity.id;

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(entity.id);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // Find latest timestamp among modifiedAt, createdAt or attributes observedAt
  const latestTimestamp = useMemo(() => {
    let latest = entity.modifiedAt || entity.createdAt;
    for (const attr of attributes) {
      if (attr.observedAt) {
        if (!latest || new Date(attr.observedAt) > new Date(latest)) {
          latest = attr.observedAt;
        }
      }
    }
    return latest;
  }, [entity, attributes]);

  // Preview up to 4 attributes in the card
  const previewAttrs = attributes.slice(0, 4);
  const remainingCount = attributes.length - previewAttrs.length;

  return (
    <div
      onClick={() => onSelect(entity)}
      className="group relative flex flex-col justify-between rounded-xl border bg-card text-card-foreground shadow-2xs hover:shadow-md hover:border-primary/40 transition-all duration-200 cursor-pointer overflow-hidden"
    >
      {/* Top Header */}
      <div className="p-4 pb-3 border-b bg-muted/15 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Entity Type Badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 max-w-[200px] truncate">
            <Tag className="size-3 shrink-0" />
            <span className="truncate">{typeDisplay}</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <Link
              to={entityHref}
              onClick={(e) => e.stopPropagation()}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-xs" }),
                "text-muted-foreground hover:text-primary",
              )}
              title="Open entity telemetry & temporal charts"
            >
              <LineChart className="size-3.5" />
              <span className="sr-only">Temporal Charts</span>
            </Link>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(entity);
              }}
              className="text-muted-foreground hover:text-foreground"
              title="Inspect details"
            >
              <Eye className="size-3.5" />
              <span className="sr-only">Inspect details</span>
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(entity);
              }}
              className="text-muted-foreground hover:text-destructive"
              title="Delete entity"
            >
              <Trash2 className="size-3.5" />
              <span className="sr-only">Delete entity</span>
            </Button>
          </div>
        </div>

        {/* Entity ID with Copy */}
        <div className="flex items-center justify-between gap-1.5">
          <Link
            to={entityHref}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs font-semibold text-foreground hover:text-primary hover:underline truncate inline-flex items-center gap-1"
            title={entity.id}
          >
            <span className="truncate">{shortId}</span>
            <ExternalLink className="size-3 shrink-0 opacity-70" />
          </Link>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleCopyId}
            className="shrink-0 size-6 text-muted-foreground hover:text-foreground"
            title="Copy full entity URN"
          >
            {isCopied ? (
              <Check className="size-3 text-green-500" />
            ) : (
              <Copy className="size-3" />
            )}
            <span className="sr-only">Copy entity ID</span>
          </Button>
        </div>
      </div>

      {/* Body: Properties Visualizer */}
      <div className="p-4 flex-1 space-y-3">
        {attributes.length === 0 ? (
          <div className="py-6 flex flex-col items-center justify-center text-center text-xs text-muted-foreground">
            <Activity className="size-6 text-muted-foreground/40 mb-1.5" />
            <span>No custom attributes</span>
            <span className="text-[10px] text-muted-foreground/70">
              Attributes will show when telemetry is published
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {previewAttrs.map((attr) => {
              const isBool = typeof attr.value === "boolean";
              const isNumber =
                typeof attr.value === "number" && !isNaN(attr.value);

              return (
                <div
                  key={attr.name}
                  className="p-2 rounded-lg bg-muted/40 border border-border/50 flex flex-col justify-between space-y-1 min-h-[56px] overflow-hidden"
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className="text-[11px] font-medium text-muted-foreground truncate uppercase tracking-wider"
                      title={attr.rawName || attr.name}
                    >
                      {attr.name}
                    </span>
                    {attr.kind === "Relationship" && (
                      <Link2 className="size-2.5 text-primary/70 shrink-0" />
                    )}
                    {attr.kind === "GeoProperty" && (
                      <MapPin className="size-2.5 text-primary/70 shrink-0" />
                    )}
                  </div>

                  <div className="flex items-baseline gap-1 truncate">
                    {isBool ? (
                      <span
                        className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          attr.value
                            ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {attr.value ? "TRUE" : "FALSE"}
                      </span>
                    ) : isNumber ? (
                      <>
                        <span className="font-mono text-sm font-bold text-foreground">
                          {Number.isInteger(attr.value as number)
                            ? (attr.value as number)
                            : (attr.value as number).toFixed(2)}
                        </span>
                        {attr.unit && (
                          <span className="text-[10px] font-semibold text-muted-foreground">
                            {attr.unit}
                          </span>
                        )}
                      </>
                    ) : attr.kind === "Relationship" ? (
                      <span
                        className="font-mono text-[11px] text-primary truncate hover:underline"
                        title={String(attr.value)}
                      >
                        {String(attr.value).split(":").pop() ||
                          String(attr.value)}
                      </span>
                    ) : (
                      <span
                        className="text-xs font-medium text-foreground truncate"
                        title={String(attr.value)}
                      >
                        {String(attr.value)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* More attributes indicator */}
        {remainingCount > 0 && (
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted-foreground">
              +{remainingCount} more{" "}
              {remainingCount === 1 ? "attribute" : "attributes"}
            </span>
            <span className="text-[11px] font-semibold text-primary inline-flex items-center gap-1 group-hover:underline">
              <span>View all</span>
              <ExternalLink className="size-2.5" />
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t bg-muted/10 flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5 truncate">
          <Clock className="size-3 text-muted-foreground shrink-0" />
          <span className="truncate">
            {latestTimestamp
              ? formatRelativeTime(latestTimestamp)
              : "No timestamp"}
          </span>
        </div>

        <Link
          to={entityHref}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline shrink-0"
        >
          <LineChart className="size-3" />
          <span>Temporal Charts</span>
        </Link>
      </div>
    </div>
  );
}
