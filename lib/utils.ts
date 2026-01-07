import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function compareQuestionNumbers(a: string, b: string): number {
  const normalize = (value: string) => value.trim();
  const parse = (value: string) => {
    const match = /^(\d+)([a-zA-Z]*)$/.exec(normalize(value));
    if (!match) return { num: Number.NaN, suffix: normalize(value) };
    return { num: Number(match[1]), suffix: match[2] || "" };
  };

  const pa = parse(a);
  const pb = parse(b);

  if (!Number.isNaN(pa.num) && !Number.isNaN(pb.num)) {
    if (pa.num !== pb.num) return pa.num - pb.num;
    if (pa.suffix !== pb.suffix) {
      if (pa.suffix === "") return -1;
      if (pb.suffix === "") return 1;
      return pa.suffix.localeCompare(pb.suffix, undefined, {
        sensitivity: "base",
      });
    }
    return 0;
  }

  return normalize(a).localeCompare(normalize(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}
