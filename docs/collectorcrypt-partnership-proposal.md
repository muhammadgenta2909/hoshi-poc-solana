# Hoshi — Partnership Proposal for CollectorCrypt

*Draft for PM review before sending. Fill in the demo link and contact details where marked.*

---

Hi team,

We're Hoshi, a Solana project building a localized trading-card pack experience for
the Indonesian market. We've been following what CollectorCrypt has done bringing
graded cards on-chain, and we think there's a natural fit worth a conversation.

The short version: we'd rather build on top of your vaulted inventory than reinvent it,
and in return we can open up a new regional demand channel for you in Southeast Asia.

## What we're building

Hoshi is a pack-opening product aimed at collectors in Indonesia. Users buy a pack,
open it, and receive a tokenized card, with a buyback option on the cards they pull.
What makes us different from a global platform is that we're built for our region from
the ground up: pricing settled in IDRX (an Indonesian rupiah stablecoin) and a
mobile-first flow tuned for local users and local payment habits.

## Why we're reaching out to you specifically

You already run the hard part: the vaulting, the grading trust, the liquidity, and the
buyback backstop. Those take years and real capital to build. Instead of competing on
that ground, we'd rather plug into your inventory and focus on what we're good at, which
is reaching and serving the Indonesian market.

## What we've already built

We didn't want to come to you with just an idea, so we built our side to make an
integration light on yours:

- A working backend on Solana (NestJS + Prisma) that mints cards to user wallets today.
- An inventory abstraction layer with a clean two-phase reserve-then-settle flow, so a
  card is held before it's delivered and never double-awarded. We've already mapped our
  CollectorCrypt adapter to your Gacha Machine API (generatePack, openPack, buyback, and
  the live-winner feed).
- Server-side pack odds and a pack-opening engine, kept authoritative on our backend.

We've gone through the Gacha API docs, including the authorized-partner API-key model and
the per-key memo tagging on transactions. On our end, connecting is a configuration task,
not a rebuild — the missing pieces are an authorized API key and terms, not engineering.

## See it running

Live demo: https://hoshi-poc-solana.vercel.app (try the Open Packs page at
https://hoshi-poc-solana.vercel.app/open-packs)

## How a partnership could work

Your Gacha API is documented, and from what we can see it's gated to authorized partners
through an issued API key. So this isn't really a question of whether we can integrate
technically — it's about setting up a commercial arrangement that works for both sides.
A few shapes we'd be glad to explore, happy to start small:

1. A revenue-share / referral model, where we drive Indonesian volume through our own API
   key and share in the packs we originate. The per-key transaction tagging in your docs
   looks purpose-built for exactly this kind of attribution.
2. Preferential partner pricing on packs, so we can localize and sell in IDRX while keeping
   a regional margin.
3. A deeper white-label or co-branded Gacha for the Indonesian market.

What we bring is regional distribution, an IDRX (rupiah) settlement rail, and local payment
and support — the parts a global platform doesn't localize easily. What we'd lean on you for is the vaulted inventory, the grading and trust, the
liquidity, and the buyback backstop. The point of a deal is to align incentives, so we're
motivated to bring you volume that neither of us captures today.

## A few things we'd like to understand from you

- How a team becomes an authorized partner and is issued a Gacha API key.
- The commercial model you prefer: revenue-share / referral (via the per-key tagging),
  preferential partner pricing, or another structure — along with any rate limits and SLAs.
- Regional availability. We understand you restrict some jurisdictions today, and we'd want
  to confirm early that Indonesia is open for us to operate in.
- Whether pack settlement can support IDRX / rupiah, or if that bridge sits on our side.

If any of this sounds interesting, we'd love to set up a short call and walk you through
the demo.

Thanks,

**[Your name / role]**
Hoshi
**[email]** · **[website / link]**
