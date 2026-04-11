// Date-only strings (YYYY-MM-DD) are parsed as UTC midnight by the JS Date constructor,
// which shifts them to the previous day in negative-UTC-offset timezones. This helper
// parses them as local midnight instead.
export const parseDateOnlyAsLocal = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const toDisplayDate = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateOnlyAsLocal(value) : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString();
};

export const toDisplayDateTime = (value: string | null | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString();
};
