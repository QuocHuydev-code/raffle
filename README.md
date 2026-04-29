# Raffle

[![CI](https://github.com/QuocHuydev-code/raffle/actions/workflows/ci.yml/badge.svg)](https://github.com/QuocHuydev-code/raffle/actions)

## What is this?

An on-chain **multi-raffle hub** on Stellar Testnet with commit-reveal randomness. Anyone can create a raffle by escrowing a prize pool and committing to a secret. Anyone else can buy tickets while the sale window is open. After the deadline, the creator reveals their committed secret; the contract verifies sha256(secret) matches the stored hash, then derives the winning ticket index from sha256(secret + ticket count) and pushes the entire pool (prize + ticket pot) to the winner.

- Live: (Vercel URL goes here)
- Demo video: (1-min walkthrough goes here)
- Contract: [`CDG2GZDV...522U`](https://stellar.expert/explorer/testnet/contract/CDG2GZDV2X3WEGEBNLWQG4KGN2QDDWGVGDTEEVLBLZ5ILAQC2FSD522U)

## What's Different

- **Multi-raffle hub.** One deployed contract hosts many independent raffles. Anyone can call `create()` to open a new one — no admin role.
- **Real XLM custody.** Prizes and ticket sales flow through the native XLM Stellar Asset Contract. The hub contract escrows the prize on `create`, pulls the ticket price on `buy_ticket`, and pushes the whole pool to the winner on `draw`.
- **Commit-reveal randomness.** Creator commits to `sha256(secret)` at create time. After the deadline, they reveal the secret and the contract verifies the hash before deriving the winner.
- **Deterministic winner derivation.** `sha256(secret || count_be) & 0xFFFFFFFF mod count` — reproducible, but the creator can't game it post-commitment.
- **No cap on tickets per buyer.** `buy_ticket(buyer, raffle_id)` just appends to a Vec on chain.
- **Y2K bubbly UI.** Pink-to-purple gradient backdrop, rounded glass panels, pill buttons with soft shadows. Browser-side SHA-256 means the secret never leaves the user's machine — only the hash goes on chain.

## FAQ

### How do raffles work?

Each call to `create(creator, title, prize, ticket_price, deadline, secret_hash)` opens a new raffle, escrows the prize from the creator, and stores its parameters under a fresh u32 id. The deployed hub contract holds many raffles in parallel — each has its own ticket array, status, and creator. `buy_ticket(buyer, raffle_id)` records the buyer in the per-raffle Vec and pulls the ticket price into the hub. There's no per-buyer cap.

### How is randomness sourced?

The raffle uses commit-reveal:

1. In the dapp, the creator types a passphrase. The browser hashes it with SHA-256 in JavaScript — the raw passphrase never leaves the page.
2. `create()` stores `sha256(passphrase)` as the commitment, alongside the prize / ticket price / deadline.
3. After the deadline, the creator pastes the same passphrase into the Draw panel and calls `draw(creator, raffle_id, secret)`. The contract recomputes `sha256(secret)` and rejects with `BadSecret` if it doesn't match the stored hash.
4. The winning index is derived as `sha256(secret || count_be) & 0xFFFFFFFF mod count`. Deterministic, but the creator can't game it post-commitment because changing the secret would invalidate the hash check.
5. Once a winner is picked, the hub transfers `prize + ticket_price * ticket_count` of XLM directly to the winner's address.

### How do I run it locally?

```bash
git clone https://github.com/QuocHuydev-code/raffle.git
cd raffle
npm install
cp .env.example .env.local
./scripts/deploy.sh alice
npm run dev
```

The deploy script just initializes the hub with the native XLM SAC — it does **not** create a starter raffle anymore. Open the dapp at http://localhost:3000, connect Freighter, and create raffles from the **Create A Raffle** form. Save the passphrase you type in (it's also logged to the browser console as a backup) so you can reveal it at draw time.

### What environment variables does it need?

- `NEXT_PUBLIC_HORIZON_URL`, `NEXT_PUBLIC_SOROBAN_RPC_URL`, `NEXT_PUBLIC_NETWORK_PASSPHRASE` (Stellar Testnet defaults; see `.env.example`)
- `NEXT_PUBLIC_MAIN_CONTRACT_ID` (populated by deploy.sh)
- `NEXT_PUBLIC_XLM_CONTRACT_ID` (the native XLM Stellar Asset Contract; populated by deploy.sh)

### How are the tests structured?

```bash
cd contract && cargo test
```

11 tests covering: sequential id assignment, buy-records-buyer, multi-buyer pool growth, deadline gates on buy + draw, wrong-secret rejection, no-tickets edge case, full draw flow with winner pick, re-draw blocked, non-creator blocked, and a smoke test that two raffles in the same hub stay independent.

### Does CI run?

Yes, on every push to `main` and on PRs. See `.github/workflows/ci.yml`. Two parallel jobs (frontend + contract) and concurrency is set to cancel stale runs.

### And CD?

Vercel handles frontend deploys via its GitHub integration - it reads `vercel.json` and rebuilds on every push to `main`. The Soroban contract is deployed manually through `scripts/deploy.sh` because shipping a signing key into CI secrets is not something I want to be on the hook for. The whole procedure is documented in [`docs/DEPLOY.md`](./docs/DEPLOY.md).

### What about mobile?

The dashboard stacks single-column under 640px and the buy / draw CTAs are full-width touch targets.

### What errors does it handle?

`AmountMustBePositive` (negative prize/price), `DeadlinePassed` (buy or create after window), `DeadlineNotPassed` (early draw), `BadSecret` (wrong reveal), `NoTickets` (draw with empty raffle), `AlreadyDrawn` (re-draw), `NotCreator` (someone else trying to draw your raffle), `NotFound` (raffle id doesn't exist), `NotInitialized` (xlm sac missing).

### What's NOT in here on purpose?

- Off-chain VRF or oracle integration (commit-reveal is the L4 story)
- Ticket NFTs (no `uses_custom_token` for this concept)
- Per-buyer ticket caps or buyer allowlists
- Refunds when nobody buys a ticket — the prize stays escrowed if `draw()` is never called or if `NoTickets` is hit (a future iteration could add a `cancel()` path that refunds to the creator)

## Screenshots

![Mobile](docs/screenshots/mobile.png)
