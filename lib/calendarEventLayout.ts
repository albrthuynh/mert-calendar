import type { CalendarEvent } from "@/types/calendar";

/** Group overlapping events so they can stack full-width with readable layering. */
export function layoutEvents(events: CalendarEvent[]): Array<{
  event: CalendarEvent;
  stackIndex: number;
  stackSize: number;
  laneIndex: number;
  laneCount: number;
  hasSameColorOverlap: boolean;
}> {
  if (events.length === 0) return [];

  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  type LayoutItem = {
    event: CalendarEvent;
    stackIndex: number;
    stackSize: number;
    laneIndex: number;
    laneCount: number;
    hasSameColorOverlap: boolean;
  };

  const result: LayoutItem[] = [];
  // Groups of overlapping events
  const groups: CalendarEvent[][] = [];

  for (const event of sorted) {
    const eStart = new Date(event.startTime).getTime();
    let placed = false;

    for (const group of groups) {
      const groupEnd = Math.max(
        ...group.map((g) => new Date(g.endTime).getTime())
      );
      if (eStart < groupEnd) {
        group.push(event);
        placed = true;
        break;
      }
    }

    if (!placed) groups.push([event]);
  }

  for (const group of groups) {
    const colorCounts = new Map<string, number>();
    for (const event of group) {
      const color = event.color.toLowerCase();
      colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);
    }

    const sideBySideSets = group.map((_, index) => new Set<number>([index]));

    for (let i = 0; i < group.length; i += 1) {
      const aStart = new Date(group[i].startTime).getTime();
      const aEnd = new Date(group[i].endTime).getTime();

      for (let j = i + 1; j < group.length; j += 1) {
        const bStart = new Date(group[j].startTime).getTime();
        const bEnd = new Date(group[j].endTime).getTime();
        const overlapMs = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
        const sameStart = aStart === bStart;
        const shortOverlap =
          overlapMs > 0 && overlapMs < 30 * 60 * 1000;

        if (!sameStart && !shortOverlap) continue;

        sideBySideSets[i].add(j);
        sideBySideSets[j].add(i);
      }
    }

    const laneInfo = group.map(() => ({ laneIndex: 0, laneCount: 1 }));
    const visited = new Set<number>();

    for (let index = 0; index < group.length; index += 1) {
      if (visited.has(index)) continue;

      const component: number[] = [];
      const pending = [index];
      visited.add(index);

      while (pending.length > 0) {
        const current = pending.pop()!;
        component.push(current);

        for (const next of sideBySideSets[current]) {
          if (visited.has(next)) continue;
          visited.add(next);
          pending.push(next);
        }
      }

      if (component.length <= 1) continue;

      component.sort((a, b) => a - b);
      component.forEach((eventIndex, laneIndex) => {
        laneInfo[eventIndex] = {
          laneIndex,
          laneCount: component.length,
        };
      });
    }

    group.forEach((event, index) => {
      result.push({
        event,
        stackIndex: index,
        stackSize: group.length,
        laneIndex: laneInfo[index].laneIndex,
        laneCount: laneInfo[index].laneCount,
        hasSameColorOverlap: (colorCounts.get(event.color.toLowerCase()) ?? 0) > 1,
      });
    });
  }

  return result;
}

