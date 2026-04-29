export function HeroSection() {
  return (
    <section className="mt-6">
      <p className="text-base leading-relaxed text-muted sm:text-lg">
        An on-chain raffle on Stellar Testnet.{" "}
        <span className="text-fg">Buy tickets while the window is open</span>.
        After the deadline, the creator reveals their committed secret and the
        winner is picked deterministically from sha256(secret + ticket count).
      </p>
    </section>
  );
}
