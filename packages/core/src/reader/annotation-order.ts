type PositionedAnnotation = {
  cfi?: string;
  createdAt: number;
};

function parsePageCfi(cfi: string): number[] | null {
  const match = cfi.match(/^page:(\d+)$/i);
  return match ? [Number.parseInt(match[1], 10)] : null;
}

function parseEpubCfi(cfi: string): number[] {
  const inner = cfi.startsWith("epubcfi(") && cfi.endsWith(")") ? cfi.slice(8, -1) : cfi;
  return [...inner.matchAll(/\d+/g)].map((match) => Number.parseInt(match[0], 10));
}

function getCfiSortKey(cfi?: string): number[] {
  if (!cfi) return [Number.POSITIVE_INFINITY];
  const trimmed = cfi.trim();
  if (!trimmed) return [Number.POSITIVE_INFINITY];

  const parsed = parsePageCfi(trimmed) ?? parseEpubCfi(trimmed);
  return parsed.length > 0 ? parsed : [Number.POSITIVE_INFINITY];
}

export function compareCfiPosition(leftCfi?: string, rightCfi?: string): number {
  const left = getCfiSortKey(leftCfi);
  const right = getCfiSortKey(rightCfi);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    const leftPart = left[i] ?? -1;
    const rightPart = right[i] ?? -1;
    if (leftPart !== rightPart) return leftPart - rightPart;
  }

  return (leftCfi ?? "").localeCompare(rightCfi ?? "");
}

export function compareAnnotationPosition(
  left: PositionedAnnotation,
  right: PositionedAnnotation,
): number {
  return compareCfiPosition(left.cfi, right.cfi) || left.createdAt - right.createdAt;
}

export function sortAnnotationsByPosition<T extends PositionedAnnotation>(items: T[]): T[] {
  return [...items].sort(compareAnnotationPosition);
}
