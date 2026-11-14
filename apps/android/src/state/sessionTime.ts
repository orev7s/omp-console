import type { Session } from '@omp-console/protocol';

export interface SessionGroup {
  label: 'Today' | 'Yesterday' | 'Earlier';
  sessions: Session[];
}

function dayStart(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

function bucketFor(updatedAt: string, now: Date): SessionGroup['label'] {
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) return 'Earlier';
  const today = dayStart(now);
  const day = dayStart(parsed);
  if (day >= today) return 'Today';
  if (day >= today - 86_400_000) return 'Yesterday';
  return 'Earlier';
}

/**
 * Groups sessions into Today, Yesterday, and Earlier, most recent first. This is
 * the TUI's recency grouping; the project rail is Phase 7.
 */
export function groupSessionsByRecency(sessions: Session[], now = new Date()): SessionGroup[] {
  const sorted = sessions
    .slice()
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const groups: SessionGroup[] = [
    { label: 'Today', sessions: [] },
    { label: 'Yesterday', sessions: [] },
    { label: 'Earlier', sessions: [] },
  ];
  const byLabel = new Map(groups.map(group => [group.label, group]));

  for (const session of sorted) {
    byLabel.get(bucketFor(session.updatedAt, now))?.sessions.push(session);
  }
  return groups.filter(group => group.sessions.length > 0);
}
