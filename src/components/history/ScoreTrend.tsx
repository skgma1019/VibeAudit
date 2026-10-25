"use client";

export function ScoreTrend({ values }: { values: number[] }) {
  if (values.length < 2)
    return (
      <p className="text-xs text-muted-foreground">
        Two saved audits are needed to show a score trend.
      </p>
    );
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 280;
      const y = 70 - (Math.max(0, Math.min(100, value)) / 100) * 60;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <figure className="rounded-lg border border-border bg-card p-4">
      <figcaption className="mb-2 text-xs text-muted-foreground">
        Overall score · oldest to newest
      </figcaption>
      <svg
        viewBox="0 0 280 80"
        role="img"
        aria-label={`Overall score trend: ${values.join(", ")}`}
        className="h-24 w-full overflow-visible"
      >
        <path
          d="M0 70H280"
          stroke="currentColor"
          className="text-border"
          strokeWidth="1"
        />
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          className="text-violet-300"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {values.map((value, index) => {
          const x = (index / (values.length - 1)) * 280;
          const y = 70 - (Math.max(0, Math.min(100, value)) / 100) * 60;
          return (
            <circle
              key={`${index}-${value}`}
              cx={x}
              cy={y}
              r="3"
              fill="currentColor"
              className="text-cyan-200"
            >
              <title>{value.toFixed(1)}</title>
            </circle>
          );
        })}
      </svg>
    </figure>
  );
}
