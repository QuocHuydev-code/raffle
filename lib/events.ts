import { rpc, xdr, scValToNative } from "@stellar/stellar-sdk";
import { sorobanRpc } from "./soroban";

export type RaffleKind = "ticket" | "draw";

export type ContractEvent = {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  txHash: string;
  kind: RaffleKind;
  actor: string;
  values: bigint[];
};

const TOPICS: RaffleKind[] = ["ticket", "draw"];

export async function getRecentEvents(
  contractId: string,
  windowLedgers = 5000
): Promise<ContractEvent[]> {
  const latest = await sorobanRpc.getLatestLedger();
  const startLedger = Math.max(1, latest.sequence - windowLedgers);
  const all: ContractEvent[] = [];
  for (const kind of TOPICS) {
    try {
      const res = await sorobanRpc.getEvents({
        startLedger,
        filters: [
          {
            type: "contract",
            contractIds: [contractId],
            topics: [[xdr.ScVal.scvSymbol(kind).toXDR("base64"), "*"]],
          },
        ],
        limit: 50,
      });
      for (const e of res.events) all.push(decode(e));
    } catch {}
  }
  return all.sort((a, b) => b.ledger - a.ledger).slice(0, 50);
}

function decode(e: rpc.Api.EventResponse): ContractEvent {
  const kind = scValToNative(e.topic[0]) as RaffleKind;
  const actor = scValToNative(e.topic[1]) as string;
  const value = scValToNative(e.value);
  const values: bigint[] = Array.isArray(value)
    ? (value as unknown[]).map((v) => BigInt(v as bigint | number | string))
    : [BigInt(value as bigint | number | string)];
  return {
    id: e.id,
    ledger: e.ledger,
    ledgerClosedAt: e.ledgerClosedAt,
    txHash: e.txHash,
    kind,
    actor,
    values,
  };
}
