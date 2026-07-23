export interface BrainDumpBullet {
  id: string;
  text: string;
  rank: number;
  crdtState?: string;
  createdAt: string;
  updatedAt: string;
}

export function createBrainDumpBullet(
  text: string,
  id: string,
  rank: number,
  now = new Date(),
): BrainDumpBullet {
  const timestamp = now.toISOString();

  return {
    id,
    text: normalizeBulletText(text),
    rank,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateBrainDumpBullet(
  bullet: BrainDumpBullet,
  text: string,
  now = new Date(),
): BrainDumpBullet {
  return {
    ...bullet,
    text: normalizeBulletText(text),
    updatedAt: now.toISOString(),
  };
}

export function sortBrainDumpBullets(
  bullets: BrainDumpBullet[],
): BrainDumpBullet[] {
  return [...bullets].sort(
    (left, right) =>
      left.rank - right.rank ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

export function rankAfterBullet(
  bullets: BrainDumpBullet[],
  afterId?: string,
): number {
  const ordered = sortBrainDumpBullets(bullets);

  if (ordered.length === 0) return 1_024;
  if (!afterId) return ordered[ordered.length - 1].rank + 1_024;

  const currentIndex = ordered.findIndex((bullet) => bullet.id === afterId);
  if (currentIndex < 0) return ordered[ordered.length - 1].rank + 1_024;

  const current = ordered[currentIndex];
  const next = ordered[currentIndex + 1];
  return next
    ? current.rank + (next.rank - current.rank) / 2
    : current.rank + 1_024;
}

export function searchBrainDumpBullets(
  bullets: BrainDumpBullet[],
  query: string,
): BrainDumpBullet[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const ordered = sortBrainDumpBullets(bullets);

  if (!normalizedQuery) return ordered;

  return ordered.filter((bullet) =>
    bullet.text.toLocaleLowerCase().includes(normalizedQuery),
  );
}

function normalizeBulletText(text: string) {
  return text.replace(/\s*\r?\n+\s*/g, " ");
}
