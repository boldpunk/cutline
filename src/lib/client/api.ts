export type ApiError = { code: string; message: string; details?: Record<string, unknown> | null };
export type ApiResult<T> = { ok: true; data: T; status: number } | { ok: false; error: ApiError; status: number; network: boolean };

async function request<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, cache: "no-store", credentials: "same-origin" });
  } catch {
    return {
      ok: false,
      status: 0,
      network: true,
      error: { code: "network", message: "Нет связи с сервером. Проверьте интернет и попробуйте ещё раз." },
    };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON */
  }
  if (res.ok) return { ok: true, data: body as T, status: res.status };
  const error = (body as { error?: ApiError } | null)?.error ?? { code: "internal", message: "Ошибка сервера. Попробуйте ещё раз." };
  return { ok: false, error, status: res.status, network: res.status >= 500 };
}

export const apiGet = <T,>(url: string) => request<T>(url);
export const apiPost = <T,>(url: string, body: unknown) =>
  request<T>(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export type DayStatus = "available" | "full" | "closed" | "out_of_range";
export type DaysResponse = { today: string; lastDate: string; days: { date: string; status: DayStatus }[] };
export type SlotOption = { startAt: string; barberIds: string[] };
export type SlotsResponse = {
  date: string;
  timezone: string;
  offers: { barberId: string; barberName: string; priceUzs: number; durationMin: number }[];
  slots: SlotOption[];
};
