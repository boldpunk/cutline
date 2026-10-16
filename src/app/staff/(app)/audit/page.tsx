import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { formatDateTimeCompact } from "@/lib/format";
import { getSettings } from "@/lib/server/settings";
import { requireAdmin } from "@/lib/server/staff-auth";
import { auditEntries } from "@/lib/server/staff-data";

export const metadata: Metadata = { title: "Журнал" };

function summarize(data: Record<string, unknown>): string {
  const s = JSON.stringify(data);
  return s === "{}" ? "" : s.length > 160 ? `${s.slice(0, 160)}…` : s;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const tz = (await getSettings(getDb())).timezone;
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { rows, hasMore } = await auditEntries(page, 50);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Журнал изменений</h1>
      <p className="text-sm text-muted-text">Кто, когда и что изменил. Полные номера телефонов в журнал не пишутся.</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-muted-text">
            <tr>
              <th className="px-3 py-2 font-medium">Когда</th>
              <th className="px-3 py-2 font-medium">Кто</th>
              <th className="px-3 py-2 font-medium">Действие</th>
              <th className="px-3 py-2 font-medium">Объект</th>
              <th className="px-3 py-2 font-medium">Детали</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap">{formatDateTimeCompact(r.at, tz)}</td>
                <td className="px-3 py-2">{r.actor ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.entity}</td>
                <td className="max-w-md px-3 py-2 font-mono text-xs break-all text-muted-text">{summarize(r.data)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="flex gap-2" aria-label="Страницы">
        {page > 1 && (
          <Link className="btn btn-ghost btn-sm" href={`?page=${page - 1}`}>
            ← Новее
          </Link>
        )}
        {hasMore && (
          <Link className="btn btn-ghost btn-sm" href={`?page=${page + 1}`}>
            Старее →
          </Link>
        )}
      </nav>
    </div>
  );
}
