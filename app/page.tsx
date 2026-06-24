import { WalletConnect } from "@/components/WalletConnect";
import { SignMessage } from "@/components/SignMessage";
import { ClaimCard } from "@/components/ClaimCard";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Hoshi POC — Solana devnet
        </h1>
        <p className="text-sm text-zinc-500">
          Connect Phantom (devnet), sign a login message, then mint a Metaplex
          Core NFT to your wallet.
        </p>
      </header>

      <Section step={1} title="Connect wallet">
        <WalletConnect />
      </Section>

      <Section step={2} title="Sign login message">
        <SignMessage />
      </Section>

      <Section step={3} title="Claim Card NFT">
        <ClaimCard />
      </Section>
    </main>
  );
}

function Section({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-black/10 p-5 dark:border-white/15">
      <h2 className="text-sm font-medium text-zinc-500">
        Step {step} — {title}
      </h2>
      {children}
    </section>
  );
}
