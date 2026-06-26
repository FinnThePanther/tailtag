export function formatCounts(counts: Record<string, unknown>): string {
  const entries = Object.entries(counts)
    .filter(([, value]) => typeof value === 'number' && value !== 0)
    .slice(0, 4);

  if (entries.length === 0) {
    return 'none';
  }

  return entries.map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`).join(', ');
}
