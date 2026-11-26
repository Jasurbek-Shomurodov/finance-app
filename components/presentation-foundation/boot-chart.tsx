import { useId } from 'react';

// The app's opening wait, drawn as a chart: a rising line traces itself over a faint grid, its area fills in beneath,
// a dot lands on the latest point and a row of volume bars fills up after it, then it all fades and draws again.
// Pure SVG and CSS (app/styles/motion.css), so it paints before any script and costs nothing; under reduced motion it
// stands still, fully drawn.

// A made-up series that climbs with a few dips, in a 240×96 view (y grows downwards).
const series = [70, 64, 72, 56, 60, 46, 52, 38, 44, 28, 34, 20];
const step = 240 / (series.length - 1);
const points = series.map((y, index) => [Math.round(index * step * 10) / 10, y] as const);
const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' ');
const area = `${line} L240 96 L0 96 Z`;
const [lastX, lastY] = points[points.length - 1];
const volumes = [38, 62, 46, 80, 54, 70, 42, 88, 60, 74, 50, 96];

/** The opening "Loading your workspace…" picture: a line chart drawing itself, with volume bars beneath. */
export function BootChart({ label }: { label: string }) {
  const fade = useId();
  return <div role="status" aria-busy="true" className="boot-chart">
    <span className="sr-only">{label}</span>
    {/* A chart reads left to right in every language, so the plot is not mirrored for right-to-left pages. */}
    <div aria-hidden="true" className="boot-chart-plot" dir="ltr">
      <svg viewBox="0 0 240 96">
        <defs><linearGradient id={fade} x1="0" x2="0" y1="0" y2="1"><stop offset="0" className="boot-chart-fade-top"/><stop offset="1" className="boot-chart-fade-bottom"/></linearGradient></defs>
        {[24, 48, 72].map(y => <line key={y} className="boot-chart-grid" x1="0" x2="240" y1={y} y2={y}/>)}
        <path className="boot-chart-area" d={area} fill={`url(#${fade})`}/>
        <path className="boot-chart-line" d={line} pathLength={1}/>
      </svg>
      <span className="boot-chart-dot" style={{ left: `${lastX / 2.4}%`, top: `${lastY / 0.96}%` }}/>
    </div>
    <div aria-hidden="true" className="boot-chart-volume">
      {volumes.map((height, index) => <i key={index} style={{ height: `${height}%`, animationDelay: `${0.12 + index * 0.07}s` }}/>)}
    </div>
  </div>;
}
