// A candidate's photo, or their initials when there's no photo.
const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-12 text-sm",
  lg: "size-16 text-base",
  xl: "size-24 text-xl",
};

export default function Avatar({ name, photoUrl, size = "md", className = "" }) {
  const box = `${SIZES[size]} shrink-0 overflow-hidden rounded-sm border border-ink/15 ${className}`;
  if (photoUrl) return <img src={photoUrl} alt="" className={`${box} bg-paper object-cover`} loading="lazy" />;
  return (
    <span className={`${box} grid place-items-center bg-violet-wash font-display font-bold text-violet-dark`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
