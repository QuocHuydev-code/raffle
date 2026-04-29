"use client";

import { useContractEvents } from "@/hooks/use-contract-events";
import type { ContractEvent } from "@/lib/events";

function shortAddr(a: string) {
  return `${a.slice(0, 4)}...${a.slice(-4)}`;
}
function timeAgo(iso: string) {
  const d = Date.now() - new Date(iso).getTime();
  const s = Math.floor(d / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function EventFeed() {
  const { data, isLoading, isError } = useContractEvents();
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-subtle">
        Tickets & Draws
        <span className="text-[10px] font-mono text-accent">~~ drawing ~~</span>
      </div>
      {isLoading ? (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-elevated" />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-3 text-sm text-danger">Failed to load events</div>
      ) : !data || data.length === 0 ? (
        <div className="mt-3 text-sm text-subtle">
          No tickets sold yet. Be the first to enter.
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
          {data.map((e) => (
            <Row key={e.id} e={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ e }: { e: ContractEvent }) {
  return (
    <li className="border-l-2 border-accent/40 pl-3 text-sm">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <span className="font-mono text-xs uppercase tracking-wider">
            {e.kind}
          </span>
          <span className="text-subtle"> · </span>
          <span className="font-mono text-xs">{shortAddr(e.actor)}</span>
        </div>
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${e.txHash}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-subtle hover:text-accent"
        >
          {timeAgo(e.ledgerClosedAt)}
        </a>
      </div>
      <div className="mt-1 font-mono text-xs text-muted">
        {e.kind === "ticket"
          ? `Ticket #${e.values[0]?.toString() ?? "?"}`
          : `Prize ${(Number(e.values[0]) / 1e7).toFixed(2)} XLM, idx ${e.values[1]}`}
      </div>
    </li>
  );
}
