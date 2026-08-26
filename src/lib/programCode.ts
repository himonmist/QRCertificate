/** Best-effort program code derived from a title's word initials, e.g. "SmartDoc AI Workshop" -> "SAW". */
export function deriveProgramCode(title: string): string {
  const words = title.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  const initials = words
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return (initials || 'PRG').slice(0, 6);
}
