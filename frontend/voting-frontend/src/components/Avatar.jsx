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
  const box = `${SIZES[size]} shrink-0 overflow-hidden rounded-full ${className}`;
  if (photoUrl) return <img src={photoUrl} alt="" className={`${box} bg-fill object-cover ring-1 ring-ink/5`} loading="lazy" />;
  return (
    <span className={`${box} grid place-items-center bg-gradient-to-b from-[#a1a1a6] to-[#86868b] font-semibold tracking-wide text-white`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
