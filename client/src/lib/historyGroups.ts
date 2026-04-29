/**
 * Cluster consecutive history records that look like they came from the same
 * "save" — i.e. the same actor performing the same action either inside the
 * same versionId, or within a short time window. Used to collapse a 50-row
 * batch save into a single line that can be expanded.
 *
 * Records are expected to be sorted by `changedAt DESC` (the order the server
 * already returns).
 */

export interface HistoryRecordLike {
  id?: number;
  keyId: number;
  keyPath?: string | null;
  localeCode: string;
  oldValue?: string | null;
  newValue?: string | null;
  action: "create" | "update" | "delete" | string;
  changedBy: number;
  changedAt: Date | string;
  changerName?: string | null;
  versionId?: number | null;
}

export interface HistoryGroup<T extends HistoryRecordLike = HistoryRecordLike> {
  /** First record's id (or fallback) — handy as a stable React key */
  key: string;
  records: T[];
  action: T["action"];
  changedBy: number;
  changerName?: string | null;
  changedAt: Date;
  versionId?: number | null;
  /** True when this group rolled up more than one record. */
  isBatch: boolean;
}

/** ms — records this close in time AND with matching (action, user) merge. */
const TIME_WINDOW_MS = 5_000;

export function groupHistoryRecords<T extends HistoryRecordLike>(
  records: T[]
): HistoryGroup<T>[] {
  const groups: HistoryGroup<T>[] = [];
  let current: HistoryGroup<T> | null = null;
  let currentLastTs = 0;

  for (const r of records) {
    const ts = new Date(r.changedAt).getTime();
    const sameVersion =
      r.versionId != null &&
      current != null &&
      current.versionId === r.versionId;
    const sameAction = current != null && current.action === r.action;
    const sameUser = current != null && current.changedBy === r.changedBy;
    const inTimeWindow =
      current != null && Math.abs(currentLastTs - ts) <= TIME_WINDOW_MS;

    const canMerge = current != null && sameAction && sameUser && (sameVersion || inTimeWindow);

    if (canMerge) {
      current!.records.push(r);
      currentLastTs = ts;
    } else {
      current = {
        key: String(r.id ?? `${r.keyId}-${ts}`),
        records: [r],
        action: r.action,
        changedBy: r.changedBy,
        changerName: r.changerName ?? null,
        changedAt: new Date(r.changedAt),
        versionId: r.versionId ?? null,
        isBatch: false,
      };
      currentLastTs = ts;
      groups.push(current);
    }
  }

  for (const g of groups) {
    g.isBatch = g.records.length > 1;
  }
  return groups;
}

/** Distinct keyIds within a group (since multi-locale on same key produces N records). */
export function distinctKeyCount(group: HistoryGroup): number {
  const set = new Set<number>();
  for (const r of group.records) set.add(r.keyId);
  return set.size;
}
