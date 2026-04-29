# Raffle

[![CI](https://github.com/QuocHuydev-code/raffle/actions/workflows/ci.yml/badge.svg)](https://github.com/QuocHuydev-code/raffle/actions)

## What is this?

An on-chain raffle on Stellar Testnet with commit-reveal randomness. Anyone can buy tickets while the sale window is open. After the deadline, the creator reveals their committed secret; the contract verifies sha256(secret) matches the hash stored at construction time, then derives the winning ticket index from sha256(secret + ticket count).

- Live: (Vercel URL goes here)
- Demo video: (1-min walkthrough goes here)
- Contract: [`CBBW5GGN...2QZ2`](https://stellar.expert/explorer/testnet/contract/CBBW5GGNPHFSVDXG7FMJ34NCWO5GEFY3TZK2F2MASC4ZNUDXS4LJ2QZ2)

## What's Different

- **Commit-reveal randomness.** Creator commits to `sha256(secret)` at deploy. After the deadline, they reveal the secret and the contract verifies the hash before deriving the winner.
- **Deterministic winner derivation.** `sha256(secret || count_be) & 0xFFFFFFFF mod count` - reproducible, but the creator can't game it post-commitment.
- **No cap on tickets per buyer.** `buy_ticket(buyer)` just appends to a Vec on chain.
- **Y2K bubbly UI.** Pink-to-purple gradient backdrop, rounded glass panels, pill buttons with soft shadows.
- **One raffle per deploy.** Each deployed contract is one raffle. No factory pattern - keeps the state machine tight.

## FAQ

### How do tickets work?

Each call to `buy_ticket(buyer)` records the buyer's address in a Vec on-chain and emits a `ticket` event with the new total count. There's no per-buyer cap.

### How is randomness sourced?

The raffle uses commit-reveal:

1. Off-chain, before deployment, the creator picks a random 32-byte secret S.
2. The raffle is deployed with `sha256(S)` stored as the commitment.
3. After the deadline, the creator calls `draw(creator, S)`. The contract verifies `sha256(S) == stored_hash`.
4. The winning index is derived as `sha256(S || count_be) & 0xFFFFFFFF mod count`. Deterministic, but the creator can't game it post-commitment because changing S would invalidate the hash check.

### How do I run it locally?

```bash
git clone https://github.com/QuocHuydev-code/raffle.git
cd raffle
npm install
cp .env.example .env.local
./scripts/deploy.sh alice
npm run dev
```

The deploy script picks a sample secret (`2a` repeated 32 times), hashes it, and deploys the raffle with the hash. The secret is logged so you can paste it into the reveal panel during the demo.

### What environment variables does it need?

- `NEXT_PUBLIC_HORIZON_URL`, `NEXT_PUBLIC_SOROBAN_RPC_URL`, `NEXT_PUBLIC_NETWORK_PASSPHRASE` (Stellar Testnet defaults; see `.env.example`)
- `NEXT_PUBLIC_MAIN_CONTRACT_ID` (populated by deploy.sh)

### How are the tests structured?

```bash
cd contract && cargo test
```

9 tests covering buy / deadline gates / wrong-secret rejection / no-tickets edge case / draw / re-draw blocked / non-creator blocked.

### Does CI run?

Yes, on every push to `main` and on PRs. See `.github/workflows/ci.yml`. Two parallel jobs (frontend + contract) and concurrency is set to cancel stale runs.

### And CD?

Vercel handles frontend deploys via its GitHub integration - it reads `vercel.json` and rebuilds on every push to `main`. The Soroban contract is deployed manually through `scripts/deploy.sh` because shipping a signing key into CI secrets is not something I want to be on the hook for. The whole procedure is documented in [`docs/DEPLOY.md`](./docs/DEPLOY.md).

### What about mobile?

The dashboard stacks single-column under 640px and the buy / draw CTAs are full-width touch targets.

### What errors does it handle?

`Error::DeadlinePassed` (buy after window), `DeadlineNotPassed` (early draw), `BadSecret`, `NoTickets`, `AlreadyDrawn`, `NotCreator`.

### What's NOT in here on purpose?

- Multi-raffle factory (each deployed contract is one raffle)
- Off-chain VRF or oracle integration (commit-reveal is the L4 story)
- Native XLM custody via SAC (the contract is an accounting + winner-derivation ledger)
- Ticket NFTs (no `uses_custom_token` for this concept)

## Screenshots

![Mobile](docs/screenshots/mobile.png)
