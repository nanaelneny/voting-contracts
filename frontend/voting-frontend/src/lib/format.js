const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

export const formatDate = (d) => dateFmt.format(new Date(d));
export const formatTime = (d) => timeFmt.format(new Date(d));
export const formatDateTime = (d) => `${formatDate(d)}, ${formatTime(d)}`;

/** "Fri 20 Nov 2026, 8:00 – 5:00 PM" or across days "… – Sat 21 Nov, 5:00 PM" */
export function formatWindow(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay ? `${formatDateTime(s)} – ${formatTime(e)}` : `${formatDateTime(s)} – ${formatDateTime(e)}`;
}

/** Value for <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(d) {
  const date = new Date(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function relative(target, now = Date.now()) {
  const ms = new Date(target).getTime() - now;
  const abs = Math.abs(ms);
  const units = [["day", 86_400_000], ["hour", 3_600_000], ["minute", 60_000]];
  for (const [unit, size] of units) {
    if (abs >= size) {
      const n = Math.round(abs / size);
      const label = `${n} ${unit}${n === 1 ? "" : "s"}`;
      return ms > 0 ? `in ${label}` : `${label} ago`;
    }
  }
  return ms > 0 ? "in under a minute" : "just now";
}

export const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "");
