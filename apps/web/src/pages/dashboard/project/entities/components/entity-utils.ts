import type { NgsiLdEntityType } from "@repo/types/endpoints/ngsi-ld/entities.endpoints";

// UN/CEFACT common unit codes mapping
const UNIT_CODES: Record<string, string> = {
  CEL: "°C",
  FAH: "°F",
  KEL: "K",
  P1: "%",
  AMP: "A",
  VLT: "V",
  WTT: "W",
  KWT: "kW",
  KWH: "kWh",
  BAR: "bar",
  PAL: "Pa",
  HPR: "hPa",
  MTR: "m",
  CMT: "cm",
  KMT: "km",
  SEC: "s",
  MIN: "min",
  HUR: "h",
  DAY: "d",
  LBR: "lux",
  LUX: "lux",
  PPM: "ppm",
};

export interface ParsedAttribute {
  name: string;
  rawName?: string;
  kind: "Property" | "Relationship" | "GeoProperty" | "Primitive";
  value: unknown;
  unit?: string;
  observedAt?: string;
  targetObject?: string;
}

const RESERVED_KEYS = new Set([
  "id",
  "type",
  "@context",
  "scope",
  "location",
  "observationSpace",
  "operationSpace",
  "createdAt",
  "modifiedAt",
  "deletedAt",
]);

/**
 * Extracts the clean attribute name from a potential URI or URN.
 * Takes the segment after the last '/', and strips any '#' anchor if present.
 */
function extractAttributeShortName(key: string): string {
  const afterSlash = key.includes("/") ? key.split("/").pop() || key : key;
  return afterSlash.includes("#")
    ? afterSlash.split("#").pop() || afterSlash
    : afterSlash;
}

export function parseEntityAttributes(
  entity: NgsiLdEntityType,
): ParsedAttribute[] {
  const attributes: ParsedAttribute[] = [];

  for (const [key, val] of Object.entries(entity)) {
    if (RESERVED_KEYS.has(key)) continue;

    const displayName = extractAttributeShortName(key);

    if (val && typeof val === "object") {
      const record = val as Record<string, unknown>;
      const typeStr = String(record.type || "");

      if (typeStr === "Property" || "value" in record) {
        const rawUnit =
          typeof record.unitCode === "string" ? record.unitCode : undefined;
        const unit = rawUnit
          ? UNIT_CODES[rawUnit.toUpperCase()] || rawUnit
          : undefined;
        attributes.push({
          rawName: key,
          name: displayName,
          kind: "Property",
          value: record.value,
          unit,
          observedAt:
            typeof record.observedAt === "string"
              ? record.observedAt
              : undefined,
        });
      } else if (typeStr === "Relationship" || "object" in record) {
        attributes.push({
          rawName: key,
          name: displayName,
          kind: "Relationship",
          value: record.object,
          targetObject:
            typeof record.object === "string" ? record.object : undefined,
          observedAt:
            typeof record.observedAt === "string"
              ? record.observedAt
              : undefined,
        });
      } else if (typeStr === "GeoProperty") {
        attributes.push({
          rawName: key,
          name: displayName,
          kind: "GeoProperty",
          value: record.value,
          observedAt:
            typeof record.observedAt === "string"
              ? record.observedAt
              : undefined,
        });
      } else {
        attributes.push({
          rawName: key,
          name: displayName,
          kind: "Primitive",
          value: val,
        });
      }
    } else {
      attributes.push({
        rawName: key,
        name: displayName,
        kind: "Primitive",
        value: val,
      });
    }
  }

  return attributes;
}
