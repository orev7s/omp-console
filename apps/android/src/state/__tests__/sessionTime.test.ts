import { groupSessionsByRecency } from '../sessionTime';
import type { Session } from '@omp-console/protocol';

/**
 * Local-time dates on purpose: the bucketing uses local midnight, so building
 * both the sessions and `now` from local components keeps the test stable in
 * any timezone.
 */
function session(id: string, updatedAt: Date): Session {
  return {
    id,
    title: id,
    cwd: `/work/${id}`,
    folder: id,
    state: 'ready',
    model: null,
    thinkingLevel: null,
    createdAt: updatedAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    lastError: null,
  };
}

const NOW = new Date(2026, 4, 15, 12, 0, 0);

function labels(sessions: Session[]): string[] {
  return groupSessionsByRecency(sessions, NOW).map(group => group.label);
}

describe('groupSessionsByRecency', () => {
  it('buckets sessions into Today, Yesterday, and Earlier', () => {
    const today = session('today', new Date(2026, 4, 15, 9, 0, 0));
    const yesterday = session('yesterday', new Date(2026, 4, 14, 22, 0, 0));
    const earlier = session('earlier', new Date(2026, 4, 10, 8, 0, 0));

    const groups = groupSessionsByRecency([today, yesterday, earlier], NOW);

    expect(groups.map(group => group.label)).toEqual(['Today', 'Yesterday', 'Earlier']);
    expect(groups[0].sessions.map(s => s.id)).toEqual(['today']);
    expect(groups[1].sessions.map(s => s.id)).toEqual(['yesterday']);
    expect(groups[2].sessions.map(s => s.id)).toEqual(['earlier']);
  });

  it('orders sessions within a bucket most recent first', () => {
    const morning = session('morning', new Date(2026, 4, 15, 8, 0, 0));
    const noon = session('noon', new Date(2026, 4, 15, 11, 30, 0));
    const evening = session('evening', new Date(2026, 4, 15, 20, 0, 0));

    const groups = groupSessionsByRecency([morning, evening, noon], NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Today');
    expect(groups[0].sessions.map(s => s.id)).toEqual(['evening', 'noon', 'morning']);
  });

  it('treats the current local day as Today regardless of the hour', () => {
    const justAfterMidnight = session('late', new Date(2026, 4, 15, 0, 5, 0));
    expect(labels([justAfterMidnight])).toEqual(['Today']);
  });

  it('treats the previous local day as Yesterday even at the late edge', () => {
    const lateYesterday = session('late-yesterday', new Date(2026, 4, 14, 23, 59, 0));
    expect(labels([lateYesterday])).toEqual(['Yesterday']);
  });

  it('treats two days back as Earlier', () => {
    const twoDaysBack = session('older', new Date(2026, 4, 13, 12, 0, 0));
    expect(labels([twoDaysBack])).toEqual(['Earlier']);
  });

  it('treats a future timestamp as Today', () => {
    const future = session('future', new Date(2026, 4, 16, 9, 0, 0));
    expect(labels([future])).toEqual(['Today']);
  });

  it('falls back to Earlier for an unparseable timestamp', () => {
    const broken = session('broken', new Date(2026, 4, 15, 9, 0, 0));
    broken.updatedAt = 'not-a-date';
    expect(labels([broken])).toEqual(['Earlier']);
  });

  it('omits buckets that have no sessions', () => {
    const onlyEarlier = session('only', new Date(2026, 3, 1, 9, 0, 0));
    expect(labels([onlyEarlier])).toEqual(['Earlier']);
  });

  it('returns an empty list for no sessions', () => {
    expect(groupSessionsByRecency([], NOW)).toEqual([]);
  });

  it('does not mutate the input list order', () => {
    const first = session('first', new Date(2026, 4, 10, 9, 0, 0));
    const second = session('second', new Date(2026, 4, 15, 9, 0, 0));
    const input = [first, second];

    groupSessionsByRecency(input, NOW);

    expect(input.map(s => s.id)).toEqual(['first', 'second']);
  });
});
