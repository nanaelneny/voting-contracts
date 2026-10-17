import { useId } from "react";

// An inked thumbprint (in the stamp-pad blue of the accent colour), the mark Ghanaian voters press into the box beside their
// chosen candidate. Drawn as broken concentric ridges inside an oval.
const RIDGES = [
  // [rx, ry, dash pattern, rotation]
  [2.2, 3, "4 2", 0],
  [4.4, 5.6, "9 2.5", 8],
  [6.6, 8.3, "14 3 6 2", -6],
  [8.8, 11, "18 3 9 2.5", 4],
  [11, 13.6, "22 4 12 3", -3],
  [13.2, 16.2, "26 3 16 4", 6],
  [15.4, 18.8, "30 5 18 3", -5],
  [17.4, 21.2, "34 4 22 5", 2],
];

export default function Thumbprint({ className = "", title }) {
  const id = `tp-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 40 48" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={id}>
          <ellipse cx="20" cy="24" rx="17.5" ry="22" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`} fill="none" stroke="currentColor" strokeLinecap="round">
        <ellipse cx="20" cy="24" rx="17.5" ry="22" fill="currentColor" stroke="none" opacity="0.16" />
        {RIDGES.map(([rx, ry, dash, rot], i) => (
          <ellipse
            key={i}
            cx="20"
            cy="26"
            rx={rx}
            ry={ry}
            strokeWidth="1.7"
            strokeDasharray={dash}
            transform={`rotate(${rot} 20 26)`}
            opacity={0.95 - i * 0.04}
          />
        ))}
        {/* ridges sweeping over the top, as on a real thumb */}
        <path d="M3 14 C 10 2, 30 2, 37 14" strokeWidth="1.5" strokeDasharray="20 3 12 4" opacity="0.8" />
        <path d="M6 9 C 13 0, 27 0, 34 9" strokeWidth="1.5" strokeDasharray="16 4 10" opacity="0.7" />
      </g>
    </svg>
  );
}
