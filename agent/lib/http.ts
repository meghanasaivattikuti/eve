export type FetchTextResult =
  | { ok: true; status: number; body: string }
  | { ok: false; status: number | null; body: null };

export async function fetchText(url: string): Promise<FetchTextResult> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return { ok: false, status: res.status, body: null };
    return { ok: true, status: res.status, body: await res.text() };
  } catch {
    return { ok: false, status: null, body: null };
  }
}
