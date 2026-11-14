/**
 * Compact relative time for session rows, in the spirit of the web app's
 * `DateTime.toRelative()`: a short word for the recent past, a short date once
 * it is older than a week. It never throws on a bad timestamp.
 */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export function formatRelativeTime(value: string, now: Date = new Date()): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  const seconds = Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 1000));
  if (seconds < 45) return 'now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  const month = MONTHS[parsed.getMonth()];
  const day = parsed.getDate();
  if (parsed.getFullYear() === now.getFullYear()) return `${month} ${day}`;
  return `${month} ${day}, ${parsed.getFullYear()}`;
}
