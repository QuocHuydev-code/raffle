"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { networkPassphrase } from "@/lib/stellar";
import { invokeContract, addrArg, i128Arg, readContract } from "@/lib/soroban";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { StellarWalletsKit } from "@/lib/wallets";

const RAFFLE_ID = process.env.NEXT_PUBLIC_MAIN_CONTRACT_ID;

function ensureId() {
  if (!RAFFLE_ID) throw new Error("NEXT_PUBLIC_MAIN_CONTRACT_ID is not set");
  return RAFFLE_ID;
}

function signer(addr: string) {
  return async (xdrText: string) => {
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdrText, {
      address: addr,
      networkPassphrase,
    });
    return signedTxXdr;
  };
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["balance"] });
  qc.invalidateQueries({ queryKey: ["raffle"] });
  qc.invalidateQueries({ queryKey: ["events"] });
}

function bytesArg(hex: string): xdr.ScVal {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const buf = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    buf[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return nativeToScVal(buf, { type: "bytes" });
}

function bytes32Arg(hex: string): xdr.ScVal {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length !== 64) throw new Error("secret_hash must be 32 bytes (64 hex chars)");
  const buf = Buffer.alloc(32);
  for (let i = 0; i < 64; i += 2) {
    buf[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return xdr.ScVal.scvBytes(buf);
}

function strArg(s: string): xdr.ScVal {
  return nativeToScVal(s, { type: "string" });
}

function u64Arg(n: number | bigint): xdr.ScVal {
  return nativeToScVal(BigInt(n), { type: "u64" });
}

function u32Arg(n: number): xdr.ScVal {
  return nativeToScVal(n, { type: "u32" });
}

export type CreateInput = {
  title: string;
  prizeStroops: bigint;
  ticketPriceStroops: bigint;
  deadlineUnix: number;
  secretHashHex: string;
};

export function useCreateRaffle(address: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateInput) => {
      if (!address) throw new Error("connect a wallet first");
      const id = ensureId();
      return invokeContract({
        contractId: id,
        method: "create",
        args: [
          addrArg(address),
          strArg(input.title),
          i128Arg(input.prizeStroops),
          i128Arg(input.ticketPriceStroops),
          u64Arg(input.deadlineUnix),
          bytes32Arg(input.secretHashHex),
        ],
        source: address,
        signXdr: signer(address),
      });
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useBuyTicket(address: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (raffleId: number) => {
      if (!address) throw new Error("connect a wallet first");
      const id = ensureId();
      return invokeContract({
        contractId: id,
        method: "buy_ticket",
        args: [addrArg(address), u32Arg(raffleId)],
        source: address,
        signXdr: signer(address),
      });
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDraw(address: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { raffleId: number; secretHex: string }) => {
      if (!address) throw new Error("connect a wallet first");
      const id = ensureId();
      return invokeContract({
        contractId: id,
        method: "draw",
        args: [addrArg(address), u32Arg(input.raffleId), bytesArg(input.secretHex)],
        source: address,
        signXdr: signer(address),
      });
    },
    onSuccess: () => invalidate(qc),
  });
}

export type Raffle = {
  id: number;
  creator: string;
  title: string;
  prize: bigint;
  ticketPrice: bigint;
  deadline: bigint;
  status: 0 | 1;
  ticketCount: number;
  winner: string;
};

function normalizeRaffle(id: number, raw: unknown): Raffle | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const status: 0 | 1 = (() => {
    const s = r.status;
    if (typeof s === "number") return s === 1 ? 1 : 0;
    if (typeof s === "string") return s === "Drawn" ? 1 : 0;
    if (Array.isArray(s) && typeof s[0] === "string")
      return s[0] === "Drawn" ? 1 : 0;
    if (s && typeof s === "object") {
      const tag = (s as { tag?: string }).tag;
      if (tag === "Drawn") return 1;
    }
    return 0;
  })();
  return {
    id,
    creator: String(r.creator ?? ""),
    title: String(r.title ?? ""),
    prize: BigInt((r.prize as bigint | number) ?? 0),
    ticketPrice: BigInt((r.ticket_price as bigint | number) ?? 0),
    deadline: BigInt((r.deadline as bigint | number) ?? 0),
    status,
    ticketCount: Number(r.ticket_count ?? 0),
    winner: String(r.winner ?? ""),
  };
}

export function useRaffles() {
  return useQuery<Raffle[]>({
    queryKey: ["raffle", "list", RAFFLE_ID],
    queryFn: async () => {
      if (!RAFFLE_ID) return [];
      const next = await readContract<number>({
        contractId: RAFFLE_ID,
        method: "next_id",
        args: [],
      }).catch(() => 0);
      if (!next) return [];
      const ids = Array.from({ length: Number(next) }, (_, i) => i);
      const raffles = await Promise.all(
        ids.map(async (id) => {
          const raw = await readContract<unknown>({
            contractId: RAFFLE_ID,
            method: "raffle",
            args: [u32Arg(id)],
          }).catch(() => null);
          return normalizeRaffle(id, raw);
        })
      );
      return raffles
        .filter((r): r is Raffle => r !== null)
        .sort((a, b) => b.id - a.id);
    },
    enabled: !!RAFFLE_ID,
    refetchInterval: 8_000,
  });
}
