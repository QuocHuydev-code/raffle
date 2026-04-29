"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useWallet } from "@/app/wallet-context";
import { BalanceCard } from "./balance-card";
import { EventFeed } from "./event-feed";
import {
  useBuyTicket,
  useDraw,
  useCreateRaffle,
  useRaffles,
  type Raffle,
} from "@/hooks/use-send-tx";
import { toError, UserRejectedError, InsufficientBalanceError } from "@/lib/errors";

function fmtXlm(stroops: bigint | undefined): string {
  if (stroops === undefined) return "—";
  const n = Number(stroops) / 1e7;
  return n.toFixed(4).replace(/\.?0+$/, "");
}

function xlmToStroops(xlm: string): bigint {
  const [whole, frac = ""] = xlm.split(".");
  const padded = (frac + "0000000").slice(0, 7);
  return BigInt(whole || "0") * 10_000_000n + BigInt(padded || "0");
}

function shortAddr(a: string) {
  if (!a) return "—";
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function timeLeft(deadline: bigint, nowSec: number): string {
  const left = Number(deadline) - nowSec;
  if (left <= 0) return "Past deadline";
  const d = Math.floor(left / 86_400);
  const h = Math.floor((left % 86_400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${s}s left`;
  return `${s}s left`;
}

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const inputCls =
  "w-full rounded-md border border-border bg-bg px-3 py-2 text-sm placeholder:text-subtle focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent";

export function Dashboard() {
  const { address, connect } = useWallet();

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {address ? <CreateRaffleForm /> : <ConnectCta onConnect={connect} />}
          <RaffleList />
        </div>
        <div className="space-y-4">
          {address && <BalanceCard />}
          <EventFeed />
        </div>
      </div>
    </div>
  );
}

function ConnectCta({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/5 p-6">
      <h2 className="text-lg font-semibold">Connect to create or join raffles</h2>
      <p className="mt-2 text-sm text-muted">
        Anyone can create a raffle by escrowing a prize. Anyone can buy tickets.
        After the deadline, the creator reveals their secret and the contract
        picks a winner deterministically.
      </p>
      <button
        onClick={onConnect}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
      >
        Connect Wallet
      </button>
    </div>
  );
}

function CreateRaffleForm() {
  const { address } = useWallet();
  const create = useCreateRaffle(address);
  const [title, setTitle] = useState("");
  const [prize, setPrize] = useState("100");
  const [ticketPrice, setTicketPrice] = useState("5");
  const [duration, setDuration] = useState("60");
  const [unit, setUnit] = useState<"minutes" | "hours" | "days">("minutes");
  const [secret, setSecret] = useState("");
  const [hashPreview, setHashPreview] = useState<string>("");

  // hash the secret with the same sha256 the contract uses
  useEffect(() => {
    if (!secret) {
      setHashPreview("");
      return;
    }
    const enc = new TextEncoder().encode(secret);
    const ab = enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength) as ArrayBuffer;
    crypto.subtle.digest("SHA-256", ab).then((buf) => {
      const hex = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      setHashPreview(hex);
    });
  }, [secret]);

  const unitSecs =
    unit === "minutes" ? 60 : unit === "hours" ? 3600 : 86_400;
  const durationSecs = Math.max(0, Number(duration) || 0) * unitSecs;
  const deadlineUnix = Math.floor(Date.now() / 1000) + durationSecs;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!hashPreview) return;
    const secretHex = Array.from(new TextEncoder().encode(secret))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    try {
      await create.mutateAsync({
        title: title.trim() || "Untitled raffle",
        prizeStroops: xlmToStroops(prize || "0"),
        ticketPriceStroops: xlmToStroops(ticketPrice || "0"),
        deadlineUnix,
        secretHashHex: hashPreview,
      });
      setSecret("");
      setTitle("");
      console.info("created raffle, save your secret to draw later:", secretHex);
    } catch {}
  }

  const err = create.error ? toError(create.error) : null;

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-border bg-surface p-5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">
          Create A Raffle
        </h2>
        <span className="text-[10px] uppercase tracking-widest text-subtle">
          Anyone can create
        </span>
      </div>

      <input
        type="text"
        placeholder="Title (e.g. Friday community pot)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={inputCls}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-subtle">
            Prize (XLM)
          </label>
          <input
            type="number"
            step="0.0000001"
            min="0"
            value={prize}
            onChange={(e) => setPrize(e.target.value)}
            required
            className={`${inputCls} mt-1 font-mono`}
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-subtle">
            Ticket Price (XLM)
          </label>
          <input
            type="number"
            step="0.0000001"
            min="0"
            value={ticketPrice}
            onChange={(e) => setTicketPrice(e.target.value)}
            required
            className={`${inputCls} mt-1 font-mono`}
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-subtle">
          Deadline
        </label>
        <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
          <input
            type="number"
            min="1"
            step="any"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            required
            className={`${inputCls} font-mono`}
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as typeof unit)}
            className={`${inputCls} w-auto`}
          >
            <option value="minutes">minutes</option>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[10px] uppercase tracking-wider text-subtle">
          Secret (you reveal this at draw time)
        </label>
        <input
          type="text"
          placeholder="any-passphrase-only-you-know"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          required
          className={`${inputCls} mt-1 font-mono`}
        />
        {hashPreview && (
          <div className="mt-2 break-all rounded-md border border-border bg-bg/40 p-2 font-mono text-[10px] text-subtle">
            sha256: {hashPreview}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={create.isPending || !secret || !hashPreview}
        className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {create.isPending ? "Creating…" : "Create & Escrow Prize"}
      </button>

      {create.isSuccess && create.data && (
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${create.data.hash}`}
          target="_blank"
          rel="noreferrer"
          className="block break-all rounded-md border border-success/40 bg-success/5 p-3 text-xs text-success"
        >
          ✓ Raffle created. Save your secret somewhere safe — you&apos;ll need to
          paste it into the draw button after the deadline. tx:{" "}
          {create.data.hash.slice(0, 16)}…
        </a>
      )}
      {err && (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          {err instanceof UserRejectedError
            ? "You rejected the request in your wallet."
            : err instanceof InsufficientBalanceError
              ? "Not enough XLM in your account."
              : `Failed: ${err.message}`}
        </div>
      )}
    </form>
  );
}

function RaffleList() {
  const { data: raffles, isLoading } = useRaffles();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="h-32 animate-pulse rounded bg-elevated" />
      </div>
    );
  }
  if (!raffles || raffles.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface/50 p-6 text-sm text-subtle">
        No raffles yet. Be the first to create one above.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-subtle">
        All Raffles ({raffles.length})
      </h3>
      {raffles.map((r) => (
        <RaffleCard key={r.id} raffle={r} />
      ))}
    </div>
  );
}

function RaffleCard({ raffle }: { raffle: Raffle }) {
  const { address } = useWallet();
  const buy = useBuyTicket(address);
  const draw = useDraw(address);
  const now = useNow();
  const isCreator = address && raffle.creator === address;
  const isPastDeadline = now >= Number(raffle.deadline);
  const isDrawn = raffle.status === 1;
  const total = useMemo(
    () => raffle.prize + raffle.ticketPrice * BigInt(raffle.ticketCount),
    [raffle]
  );

  const [secret, setSecret] = useState("");
  const buyErr = buy.error ? toError(buy.error) : null;
  const drawErr = draw.error ? toError(draw.error) : null;

  async function onBuy() {
    try {
      await buy.mutateAsync(raffle.id);
    } catch {}
  }
  async function onDraw() {
    if (!secret) return;
    const secretHex = Array.from(new TextEncoder().encode(secret))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    try {
      await draw.mutateAsync({ raffleId: raffle.id, secretHex });
      setSecret("");
    } catch {}
  }

  const stamp = isDrawn
    ? "DRAWN"
    : isPastDeadline
      ? "READY TO DRAW"
      : "SELLING";
  const stampColor = isDrawn
    ? "border-success/40 bg-success/10 text-success"
    : isPastDeadline
      ? "border-warn/40 bg-warn/10 text-warn"
      : "border-accent/40 bg-accent/10 text-accent";

  return (
    <article className="rounded-xl border border-border bg-surface p-5">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-subtle">
            Raffle #{raffle.id} · {shortAddr(raffle.creator)}
            {isCreator && (
              <span className="ml-2 text-accent">· you</span>
            )}
          </div>
          <h3 className="mt-1 text-base font-semibold">{raffle.title || "Untitled"}</h3>
        </div>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${stampColor}`}
        >
          {stamp}
        </span>
      </header>

      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <Stat label="Prize" value={`${fmtXlm(raffle.prize)} XLM`} accent />
        <Stat label="Ticket" value={`${fmtXlm(raffle.ticketPrice)} XLM`} />
        <Stat label="Tickets sold" value={`${raffle.ticketCount}`} />
        <Stat label="Pool total" value={`${fmtXlm(total)} XLM`} />
        <Stat
          label={isPastDeadline ? "Status" : "Closes"}
          value={isDrawn ? "Drawn" : timeLeft(raffle.deadline, now)}
        />
        <Stat
          label="Winner"
          value={isDrawn ? shortAddr(raffle.winner) : "—"}
          mono
        />
      </div>

      {!isDrawn && !isPastDeadline && address && (
        <button
          onClick={onBuy}
          disabled={buy.isPending}
          className="mt-4 w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buy.isPending
            ? "Buying…"
            : `Buy Ticket · ${fmtXlm(raffle.ticketPrice)} XLM`}
        </button>
      )}

      {!isDrawn && isPastDeadline && isCreator && (
        <div className="mt-4 space-y-2 rounded-md border border-warn/30 bg-warn/5 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-warn">
            Reveal secret to pick the winner
          </div>
          <input
            type="text"
            placeholder="paste the secret you used at create time"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className={`${inputCls} font-mono`}
          />
          <button
            onClick={onDraw}
            disabled={draw.isPending || !secret}
            className="w-full rounded-md bg-warn px-3 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {draw.isPending ? "Drawing…" : "Draw Winner"}
          </button>
        </div>
      )}

      {!isDrawn && isPastDeadline && !isCreator && (
        <div className="mt-4 rounded-md border border-border bg-bg/40 p-3 text-xs text-muted">
          Past deadline. Waiting for the creator to reveal their secret and draw the winner.
        </div>
      )}

      {(buy.isSuccess && buy.data) && (
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${buy.data.hash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block break-all rounded-md border border-success/40 bg-success/5 p-2 text-[11px] text-success"
        >
          ✓ Ticket bought. tx: {buy.data.hash.slice(0, 16)}…
        </a>
      )}
      {(draw.isSuccess && draw.data) && (
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${draw.data.hash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block break-all rounded-md border border-success/40 bg-success/5 p-2 text-[11px] text-success"
        >
          ✓ Winner drawn. tx: {draw.data.hash.slice(0, 16)}…
        </a>
      )}
      {(buyErr || drawErr) && (
        <div className="mt-2 rounded-md border border-danger/30 bg-danger/5 p-2 text-[11px] text-danger">
          {(buyErr ?? drawErr) instanceof UserRejectedError
            ? "You rejected the request in your wallet."
            : `Failed: ${(buyErr ?? drawErr)?.message}`}
        </div>
      )}
    </article>
  );
}

function Stat({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-subtle">
        {label}
      </div>
      <div
        className={`mt-0.5 text-sm font-semibold ${mono ? "font-mono" : ""} ${
          accent ? "text-accent" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
