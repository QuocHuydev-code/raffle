import { WalletButton } from "@/components/wallet-button";
import { Dashboard } from "@/components/dashboard";

export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6 sm:pt-10">
        <header className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 px-3 py-1.5 text-xs font-medium tracking-wide text-muted backdrop-blur">
            <span className="heart-pulse" />
            Stellar testnet
          </span>
          <WalletButton />
        </header>

        <section className="mt-10 overflow-hidden rounded-[2rem] border border-border bg-surface/85 p-8 text-center shadow-[inset_0_1px_0_rgb(255_255_255_/_0.8),0_20px_60px_rgb(192_38_211_/_0.18)] sm:mt-14 sm:p-12">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-accent">
            Pull a ticket. Trust the math.
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-[1.05] tracking-tight text-fg sm:text-5xl">
            Raffle <span className="text-accent">~</span> on chain
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted sm:text-base">
            Commit a secret hash up front. Sell tickets. Reveal the secret after the deadline. The winning ticket falls out of <code className="rounded bg-elevated px-1.5 py-0.5 font-mono text-[12px] text-muted">sha256(secret + count)</code>. No oracle, no admin, no rerolls.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <span className="rounded-full bg-accent-3 px-3 py-1 text-[11px] font-semibold text-fg shadow-sm">
              Commit-reveal
            </span>
            <span className="rounded-full bg-accent-2 px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
              SEP-41 ticket token
            </span>
            <span className="rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-white shadow-sm">
              On-chain RNG
            </span>
          </div>
        </section>

        <section className="mt-10 sm:mt-14">
          <Dashboard />
        </section>

        <footer className="mt-16 flex items-center justify-center gap-2 text-center text-xs text-subtle">
          <span className="h-1 w-1 rounded-full bg-accent" />
          One ticket = one entry
          <span className="h-1 w-1 rounded-full bg-accent-2" />
          Winner from on-chain reveal
          <span className="h-1 w-1 rounded-full bg-accent-3" />
        </footer>
      </div>
    </main>
  );
}
