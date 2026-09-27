/**
 * Chart series tokens (validated categorical palette, light + dark steps).
 * Order is fixed and is the colour-blind safety mechanism: slot N always
 * means the Nth series of a chart definition, never a rank.
 * React 19 hoists and de-duplicates this <style> by href.
 */
const CSS = `
.viz{--viz-1:#2a78d6;--viz-2:#eb6834;--viz-3:#1baf7a;--viz-4:#eda100;--viz-5:#e87ba4;}
.dark .viz{--viz-1:#3987e5;--viz-2:#d95926;--viz-3:#199e70;--viz-4:#c98500;--viz-5:#d55181;}
@media print{.viz .recharts-wrapper{break-inside:avoid}}
`;

export const SERIES_COLORS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)", "var(--viz-5)"] as const;

export function seriesColor(index: number) {
  return SERIES_COLORS[Math.min(index, SERIES_COLORS.length - 1)];
}

export function VizTokens() {
  return (
    <style href="viz-tokens" precedence="default">
      {CSS}
    </style>
  );
}
