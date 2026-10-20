"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { publishAction } from "@/app/staff/(app)/setup/actions";
import type { ActionResult } from "@/lib/server/action-result";

export function PublishControls({ published, ready }: { published: boolean; ready: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (v: boolean) =>
    start(async () => {
      const r = await publishAction(v);
      setResult(r);
      if (r.ok) router.refresh();
    });
  return (
    <div className="space-y-2">
      {published ? (
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(false)}>
          Снять с публикации
        </button>
      ) : (
        <button type="button" className="btn btn-primary" disabled={pending || !ready} onClick={() => run(true)}>
          {pending ? "Публикуем…" : "Опубликовать страницу"}
        </button>
      )}
      {!published && !ready && <p className="text-sm text-muted-text">Кнопка станет активной, когда все пункты выше будут выполнены.</p>}
      {result && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${result.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input readOnly value={url} aria-label="Ссылка на страницу" className="input font-semibold" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn btn-dark shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? "Скопировано ✓" : "Скопировать"}
      </button>
    </div>
  );
}
