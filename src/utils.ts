export type Props = {
  login: string;
  timezone?: string;
};

export const DEFAULT_TIMEZONE = "UTC";

export function normalizeTimezone(timezone: string | null | undefined): string {
  const trimmed = timezone?.trim();
  if (!trimmed) return DEFAULT_TIMEZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date(0));
    return trimmed;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}
