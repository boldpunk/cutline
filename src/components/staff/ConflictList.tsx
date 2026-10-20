import Link from "next/link";
import { formatDateTimeCompact } from "@/lib/format";

export type Affected = { id: string; code: string; startAt: string; barberName: string; serviceName: string };

/** Lists future bookings blocking a schedule change; staff must resolve each one. */
export function ConflictList({ message, affected, tz }: { message: string; affected: Affected[]; tz: string }) {
  return (
    <div role="alert" className="rounded-xl border-2 border-danger bg-danger-bg p-4 text-sm">
      <p className="font-semibold text-danger">{message}</p>
      <p className="mt-1">Изменение не сохранено. Перенесите или отмените эти записи и повторите:</p>
      <ul className="mt-2 space-y-1">
        {affected.map((a) => (
          <li key={a.id}>
            <Link href={`/staff/bookings/${a.id}`} className="link" target="_blank">
              {formatDateTimeCompact(a.startAt, tz)} · {a.barberName} · {a.serviceName} · {a.code.slice(0, 4)}-{a.code.slice(4)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
