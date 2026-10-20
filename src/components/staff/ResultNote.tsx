"use client";
import type { ActionResult } from "@/lib/server/action-result";
import { ConflictList, type Affected } from "./ConflictList";

export function ResultNote({ result, tz }: { result: ActionResult<unknown> | null; tz: string }) {
  if (!result) return null;
  if (result.ok) {
    return (
      <p role="status" className="rounded-lg bg-success-bg px-3 py-2 text-sm text-success">
        {result.message ?? "Сохранено."}
      </p>
    );
  }
  if (result.code === "schedule_conflict" && Array.isArray(result.details?.affected)) {
    return <ConflictList message={result.message} affected={result.details.affected as Affected[]} tz={tz} />;
  }
  return (
    <div role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
      {result.message}
      {result.fields && (
        <ul className="mt-1 list-disc pl-5">
          {Object.entries(result.fields).map(([k, v]) => (
            <li key={k}>{v}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
