import { KeyPoint } from "./types";

export type RawKeyPoint =
  | KeyPoint
  | {
      point?: string;
      text?: string;
      sourceType?: string;
      url?: string;
    }
  | string
  | null
  | undefined;

const SOURCE_HINT_REGEX = /\s*\[([^\]]+)\]\s*$/;
const KNOWN_SOURCE_TYPES = ["notes", "passage", "figure", "table", "chart", "website"];

function stripSourceHint(raw: string | undefined): { text: string; hint?: string } {
  const trimmed = (raw ?? "").trim()
  if (!trimmed) return { text: "" }

  const match = trimmed.match(SOURCE_HINT_REGEX)
  if (match && typeof match.index === "number") {
    return {
      text: trimmed.slice(0, match.index).trim(),
      hint: match[1]?.trim() || undefined,
    }
  }

  return { text: trimmed }
}

export function normalizeKeyPoints(input?: RawKeyPoint[] | null): KeyPoint[] {
  if (!input) return []

  const result: KeyPoint[] = []

  for (const entry of input) {
    if (!entry) continue

    if (typeof entry === "string") {
      const { text, hint } = stripSourceHint(entry)
      if (text) {
        result.push({
          point: text,
          sourceType: hint
            ? hint.includes(".")
              ? "website"
              : hint.toLowerCase()
            : "unknown",
        })
      }
      continue
    }

    if (typeof entry === "object") {
      const candidate = entry as Record<string, unknown>
      const rawPoint =
        typeof candidate.point === "string"
          ? candidate.point
          : typeof candidate.text === "string"
            ? candidate.text
            : ""
      const { text, hint } = stripSourceHint(rawPoint)

      if (!text) continue

      const rawUrl = typeof candidate.url === "string" ? candidate.url.trim() : undefined
      const rawSourceType =
        typeof candidate.sourceType === "string"
          ? candidate.sourceType.trim()
          : undefined

      const normalizedType = (() => {
        if (rawUrl && rawUrl.startsWith("http")) return "website"
        if (rawSourceType && KNOWN_SOURCE_TYPES.includes(rawSourceType.toLowerCase())) {
          return rawSourceType.toLowerCase()
        }
        if (hint && KNOWN_SOURCE_TYPES.includes(hint.toLowerCase())) {
          return hint.toLowerCase()
        }
        return "unknown"
      })()

      result.push({
        point: text,
        sourceType: normalizedType,
        url: rawUrl || undefined,
      })
    }
  }

  return result
}

export function parseKeyPointsInput(value: string): KeyPoint[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<KeyPoint[]>((acc, line) => {
      const parts = line.split("|").map((p) => p.trim())
      const [pointPart, urlPart, sourceTypePart] = parts
      const { text, hint } = stripSourceHint(pointPart)
      if (!text) return acc

      const url = urlPart || undefined
      const inferredSourceType =
        sourceTypePart?.toLowerCase() ||
        (url && url.startsWith("http") ? "website" : undefined) ||
        (hint ? (hint.includes(".") ? "website" : hint.toLowerCase()) : undefined) ||
        "unknown"
      acc.push({
        point: text,
        url,
        sourceType: inferredSourceType,
      })
      return acc
    }, [])
}

export function serializeKeyPointsInput(points?: RawKeyPoint[] | null): string {
  return normalizeKeyPoints(points)
    .map((kp) =>
      [kp.point, kp.url, kp.sourceType]
        .filter((part, idx, arr) => {
          if (!part) return false
          // Avoid repeating identical source/sourceType right next to each other
          return idx === 0 || part !== arr[idx - 1]
        })
        .join(" | "),
    )
    .join("\n")
}

export function keyPointTexts(points?: RawKeyPoint[] | null): string[] {
  return normalizeKeyPoints(points).map((kp) => kp.point)
}
