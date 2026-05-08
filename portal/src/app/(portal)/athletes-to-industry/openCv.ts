// Open an athlete CV by fetching a fresh short-lived signed URL.
// CVs are PII — never store the URL; sign on demand.
export async function openAthleteCv(athleteId: string): Promise<string | null> {
  const w = window.open('about:blank', '_blank');
  try {
    const res = await fetch(`/api/athletes/${athleteId}/cv`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      if (w) w.close();
      alert(`Couldn't open CV: ${j.error ?? res.statusText}`);
      return null;
    }
    const json = await res.json() as { url: string };
    if (w) w.location.href = json.url;
    return json.url;
  } catch (e) {
    if (w) w.close();
    alert(`Couldn't open CV: ${(e as Error).message}`);
    return null;
  }
}
