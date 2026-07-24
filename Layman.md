# tx402 — Explained Like You're 12

## What are we even building?

Imagine blockchain transactions are like receipts written in a secret robot
language — just numbers and codes. Nobody wants to read
`amount: 12300000, asset-id: 31566704`.

We're building a **translator robot**. You give it a receipt ID, and it
hands back a normal sentence, like:

> "On June 1st, Alex sent $25.50 to Sam with the note 'rent payment'."

That's it. That's the whole product. And because other computer programs
("agents") will be the ones asking our robot for translations — not
humans clicking a website — we charge them a tiny bit of money every time
they ask, instead of showing ads or needing a login. That system is called
**x402**, and it's why the project is called tx402.

Think of it like a vending machine: insert a few cents, get a snack. No
membership card, no monthly bill — just pay per snack (per translation).

---

## The 8 Phases — our to-do list to get this live and earning

### ✅ Phase 1 — Build the translator (DONE)

We built the robot's brain:
- A part that fetches the raw "receipt" from Algorand (`indexer.js`)
- A part that cleans up the messy numbers into normal ones (`decoder.js`)
- A part that turns clean numbers into an English sentence (`narrator.js`)
- A cheat-sheet of "who's who" so we can say "Tinyman" instead of
  "app 1002541853" (`knownApps.js`)
- A little web address people can visit to ask questions (`index.js`)

Right now it's **free** on purpose — like a lemonade stand giving out free
samples first, to make sure the lemonade is actually good before charging
for it. We tested it 16 different ways and it passed every time.

### 🔜 Phase 2 — Add the vending machine slot (Testnet)

Right now anyone can ask our robot for a translation for free. Phase 2
bolts on the actual "insert coin here" part — the x402 payment check —
but we test it with **pretend money** first (Testnet), the same way you'd
test a real vending machine with fake coins before putting it out in
public with real ones.

### 🔜 Phase 3 — Put the vending machine somewhere people can find it

Right now our robot only runs on this one computer. Phase 3 puts it on
the internet (using a free hosting service like Vercel or Railway) so it
has a real address anyone in the world can visit — not just us, on this
laptop.

### 🔜 Phase 4 — Switch from pretend money to real money

We flip a few settings so the vending machine now takes **real** money
(Mainnet) instead of the pretend testing money. We also add our stand to
a public "directory of vending machines" (called Bazaar) so other robots
can discover we exist and know what we sell.

### 🔜 Phase 5 — Sell the first real snack

Someone (or some robot) pays real money for a real translation for the
very first time. We check the leaderboard to make sure it actually
counted — like checking the cash register after your first real
customer.

### 🔜 Phase 6 — Make it easy for others to use

We write simple instructions and example code so other developers can
easily plug into our vending machine — like putting up a sign that says
"here's exactly how to buy a snack" instead of making people guess.

### 🔜 Phase 7 — Tell people it exists

A vending machine in a locked room sells nothing. Phase 7 is about
posting in the Algorand community (Discord) and getting listed in the
directories that other robot-shopping-assistants check when they're
looking for tools to buy — so customers actually find us.

### 🔜 Phase 8 — Officially enter the contest

This whole thing is part of a competition. Phase 8 is the paperwork:
sign up before **September 1, 2026**, and submit our finished project
details before **September 29, 2026**.

---

## The short version

1. **Build** a robot that explains blockchain receipts in plain English. ✅ Done
2. **Add** a "pay a few cents per question" coin slot — test with fake money first.
3. **Put it online** so anyone can reach it.
4. **Switch to real money.**
5. **Get our first real paying customer.**
6. **Make it easy** for other developers to use.
7. **Tell everyone** it exists.
8. **Officially submit it** to the competition before the deadline.

We're standing at the start of step 2, with step 1 solidly finished and
tested.
