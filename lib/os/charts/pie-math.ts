export type PieItem = {
  key: string;
  label: string;
  value: number | null;
};

export type PieSlice = {
  key: string;
  label: string;
  value: number;
  share: number;
  startAngle: number;
  endAngle: number;
};

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Donut arc path between two angles at radius r (ring thickness via stroke).
 * Caps sweep just short of 360 to keep SVG arc path command valid.
 */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  if (a1 <= a0) return '';
  const sweep = Math.max(0, Math.min(a1 - a0, 359.98));
  if (sweep <= 0) return '';
  const x0 = cx + r * Math.cos(rad(a0));
  const y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a0 + sweep));
  const y1 = cy + r * Math.sin(rad(a0 + sweep));
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * Calculates pie/donut slices from an array of items.
 * Filters out non-positive/null items, computes shares, and assigns clockwise angles
 * starting from 12 o'clock (-90 degrees) that always sum to full circle (360 degrees).
 */
export function pieSlices(items: PieItem[]): PieSlice[] {
  const live = items.filter(
    (i): i is PieItem & { value: number } => i.value != null && i.value > 0
  );
  const total = live.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return [];

  let angle = -90;
  return live.map((i) => {
    const share = i.value / total;
    const startAngle = angle;
    angle += share * 360;
    return {
      key: i.key,
      label: i.label,
      value: i.value,
      share,
      startAngle,
      endAngle: angle,
    };
  });
}
