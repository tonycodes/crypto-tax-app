# Updated Implementation Plan for Crypto Tax App

## Overview

This plan outlines the development of a minimal viable crypto tax app focused solely on core functionalities: precise gain/loss calculations with full cost basis analysis (leveraging AI where needed), interactive AI-driven transaction data healing, support for key blockchains (ETH, Solana, BTC, Sui initially) with modular SDK integrations, a clean React/Tailwind UI, user auth, crypto-only subscriptions (3 tiers via Solana/BTC direct wallet payments), 100% TDD with full test coverage, and comprehensive documentation. The app will be built iteratively in TDD, with progress offloaded to backend workers (e.g., queues) for UX.

Enhancements to Solana integration include leveraging Jupiter's SDK (specifically `@jup-ag/instruction-parser` for precise parsing of swap transactions) and Raydium's SDK (`@raydium-io/raydium-sdk`) for similar decoding of Raydium-specific AMM instructions. These additions improve transaction data accuracy for cost basis analysis and healing, focusing on common DEX activities on Solana without expanding scope beyond necessities.

Regarding MCP (Model Context Protocol, an open standard introduced by Anthropic in November 2024 for secure, standardized connections between AI applications and external data sources/tools): There are opportunities to leverage MCP for greater dynamism, especially in AI-driven features. Instead of solely relying on hardcoded SDK calls or web searches, MCP can enable the AI module to dynamically query connected APIs/services (e.g., blockchain explorers, price oracles) via protocol-compliant endpoints. This minimizes custom code for new integrations—configure MCP "tools" (e.g., as server endpoints) that the AI can call on-demand, allowing maximum extensibility (e.g., add new chains by exposing them as MCP tools without redeploying). For example, MCP can abstract RPC calls or SDK interactions into reusable "contexts" that the AI accesses securely, reducing adapter boilerplate. This fits the "minimum code, maximum ability" goal: Hardcode core logic, but use MCP for AI-orchestrated extensions. Initial implementation will include MCP setup for AI healing (e.g., dynamic consensus from multiple sources); future phases can expand to blockchain adapters. MCP adoption is feasible as of September 2025, with open-source libraries available (e.g., via GitHub/modelcontextprotocol).

The app remains minimal, with all other aspects unchanged.

## Assumptions

- **Backend**: Node.js 20+ for JS consistency.
- **Deployment**: Vercel/Netlify (front), Heroku/Railway (back), or self-hosted.
- **Security**: Encrypt sensitive data (wallets, txns); use HTTPS; rate-limit API. For MCP: Implement secure auth (e.g., OAuth-like tokens) to prevent unauthorized AI access.
- **Compliance**: No tax advice; users responsible for accuracy.
- **Timeline**: 8-12 weeks for MVP (2 devs), phased as below. Adds ~2-3 days to Phase 4 for MCP integration/testing; no major delays.

## Tech Stack

### Frontend

React 18+ (Vite for build), Tailwind CSS 3+ (for clean, responsive UI: simple dashboard, modals for interactive fixes, progress bars via WebSockets).

### Backend

Node.js/Express.js (REST API + WebSockets for progress), BullMQ/Redis for async jobs (e.g., blockchain syncs, AI heals).

### Database

MySQL 8+ (structured txns/users; JSON columns for metadata), Prisma ORM for migrations/queries.

### Auth

JWT (bcrypt for passwords), Clerk/Auth0 for simplicity (but self-implemented for crypto subs).

### Blockchain SDKs

Due diligence: Selected based on popularity, maintenance, JS/TS support, community in 2025; official/recommended for reliability; decoupled via adapters:

- **Ethereum**: Ethers.js (v6+; preferred over Web3.js for lighter footprint, better TypeScript, direct contract/tx interactions; active, audited).
- **Solana**: `@solana/web3.js` (official; handles accounts, txns, RPC; mature, high perf for fast chain); `@jup-ag/instruction-parser` (for Jupiter swaps: decodes inputs/outputs/routes from logs; lightweight, official, active as of 2025); `@raydium-io/raydium-sdk` (for Raydium AMM: utilities to decode swap/liquidity instructions via Anchor IDL; official, supports v4+ programs; chosen for maturity in Solana DEX ecosystem).
- **Bitcoin**: bitcoinjs-lib (v6+; standard for tx creation/signing; pair with Blockstream API for queries; reliable, no full node needed).
- **Sui**: `@mysten/sui.js` (official TS SDK; for objects, txns, Move interactions; growing ecosystem, modular).

**Modularity**: Abstract via interfaces (e.g., `IBlockchainAdapter`); plugins for new chains (e.g., Polygon via config). For Solana, adapters check txn program IDs (e.g., Jupiter: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`; Raydium: `675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Nd5`); invoke parsers only when matched. RPC via MCPs (e.g., QuickNode for ETH/Solana/BTC in one dashboard) for dynamic endpoints—config file (e.g., `rpcProviders: { solana: 'https://api.quicknode.com/solana/mainnet' }`) allows swapping without code changes.

### AI Integration

OpenAI API (GPT-4o) or Grok API for cost basis (e.g., infer from tx patterns) and healing (web search via SerpAPI/Bing, consensus via multiple sources). Backend-only for security. Integrate MCP (via official JS library, e.g., `@anthropic/mcp` or equivalent from GitHub) to expose internal/external services as "tools" (e.g., RPC queries, price APIs) that AI can call dynamically during prompts.

### Payments

Solana Web3.js + BTC lib for on-chain confirmations (watch our wallets via APIs like Helius for Solana, Blockcypher for BTC).

### Testing

Jest/Vitest (unit/integration), Cypress (E2E), Supertest (API); aim 100% coverage via TDD.

### Docs

JSDoc/Swagger for API; Markdown in repo (README, wikis); auto-gen via TypeDoc.

### Other

Docker for env, GitHub Actions CI/CD, ESLint/Prettier. MCP server setup (e.g., lightweight Express endpoint for AI callbacks).

## High-Level Architecture

### Monorepo Structure

Turborepo: `/backend`, `/frontend`, `/shared` (types/utils), `/docs`.

### Data Flow

1. **User uploads/syncs wallet** (via API keys/RPC endpoints; no private keys stored).
2. **Backend fetches txns** via SDKs, stores in DB (normalized: chain_id, tx_hash, amount_in/out, timestamp, etc.).
3. **For Solana txns**: After fetching via `@solana/web3.js`, route to parsers if Jupiter/Raydium detected—extract structured data (e.g., tokens in/out, fees) for DB storage. This feeds directly into cost basis (e.g., treat swaps as dispositions) and AI healing (e.g., fewer "unknowns").
4. **AI module**: Analyzes for cost basis (FIFO/HIFO via SymPy if math-heavy; AI for ambiguous txns like airdrops). Use MCP to make AI calls dynamic—e.g., prompt AI with MCP-enabled tools for on-the-fly queries (e.g., "Call [MCP tool: getHistoricalPrice] for consensus").
5. **Healing**: Interactive via WebSocket; AI queries web (e.g., "Etherscan tx [hash] details"), aggregates consensus (e.g., avg price from CoinGecko/CMC). MCP opportunity: Expose blockchain adapters or external APIs as MCP tools, allowing AI to select/invoke them dynamically without hardcoded prompts.
6. **Calc**: Query DB for period, compute gains/losses (tax-year compliant, e.g., USD equiv via historical prices from Coingecko API).
7. **UI**: Dashboard shows progress (e.g., spinner for syncs); modals for confirmations.
8. **Auth**: Middleware guards routes; user_id scopes data.
9. **Subs**: 3 tiers (Basic: 1 chain, Pro: All + AI heal, Enterprise: Custom); on signup, generate QR/invoice for crypto pay; poll chain for confirmation, auto-upgrade.

### MCP Usage

Implement MCP gateway in backend (e.g., `/mcp/tools` endpoint); AI API calls include MCP config for tool access. This enables dynamism: Add new services (e.g., new chain RPC) by registering them as MCP tools in config, not code. Parsers/SDks remain for core, but AI can bypass via MCP for edges.

### Decoupling

Blockchain adapters in `/adapters/`; easy plug (e.g., new ChainX: implement interface, add to config). Adapters remain pluggable; add parser hooks via interfaces (e.g., `parseTxn(txn: Transaction): ParsedData`). MCP enhances: Tools as JSON schemas in config; AI selects based on context, minimizing code for expansions.

### Scalability

Async jobs for heavy lifts (e.g., full wallet sync); cache prices in Redis.

## Features Breakdown

### Gain/Loss Calculation

- **Input**: User selects period (e.g., 2024), chains/wallets.
- **Process**: Fetch all txns, match buys/sells for cost basis (100% coverage: AI classifies unknowns, e.g., "Is this NFT sale? Search metadata"). Enhanced for Solana: Jupiter/Raydium parsers ensure 100% coverage for swaps (e.g., accurate basis from input token cost + fees). AI used only for non-parsable edges. MCP: AI can dynamically call price/tool endpoints for real-time consensus.
- **Output**: Report (table: asset, cost basis, proceeds, gain/loss, total); export CSV/PDF.
- **AI**: Use for edge cases (e.g., DeFi yields: prompt "Classify txn [data] as income/sale").

### Transaction Data Healing

- **Interactive**: UI modal shows flagged txns (missing price/timestamp); user confirms AI suggestions.
- **AI**: Backend job searches web (e.g., via tool-integrated API: query "BTC price [date]"), consensus (e.g., median from 3+ sources like CoinMarketCap, DexScreener). Parsers reduce flagged txns (e.g., auto-classify Jupiter swap as "sale" with amounts); AI searches (e.g., "Raydium txn [sig] details") build on parsed data for consensus. MCP: Register search/consensus as tools; AI invokes dynamically for best-effort accuracy without recoding for new sources.

### Blockchain Support

- **Initial**: ETH (Ethers.js: `provider.connect()`), Solana (`@solana/web3.js`: Connection), BTC (bitcoinjs-lib + API for history), Sui (`@mysten/sui.js`: client).
- **Solana**: Use `@solana/web3.js` for core; integrate `@jup-ag/instruction-parser` for Jupiter (handles ~70% swaps; extracts routes/amounts from v6 instructions). Leverage `@raydium-io/raydium-sdk` for Raydium (direct AMM; decode swaps/liquidity via IDL methods like `decodeInstruction`). Benefits: Better accuracy for taxable events (e.g., LP adds as acquisitions); covers top DEXes post-Jupiter.

**Opportunity for Raydium**: Yes—Raydium is a primary DEX (high volume for direct pools); parser helps with impermanent loss calcs (track LP tokens) and fees, reducing AI reliance. Similar to Jupiter: Check program ID, parse logs for structured outputs.

**Due Diligence**: Both SDKs active (GitHub stars: Jupiter ~1k+, Raydium ~2k+; regular updates); TS-native; low deps. Tested for historical txns (not just execution).

- **Decoupled**: Config file maps chain to adapter; sync via cron/jobs.
- **MCP Integration**: Expose adapters as MCP tools (e.g., "fetchTxn" tool schema); AI can call for new/uncoded chains dynamically. For existing SDKs, keep coded calls for perf; use MCP for extensions (e.g., query uncoded DEXes). Config-driven: Add tools via JSON without code changes.

### UI/UX

- **Clean**: Minimalist dashboard (sidebar: Wallets, Reports, Subs); Tailwind classes for responsive (mobile-first).
- **Navigation**: React Router; progress via Progress component + WebSockets (e.g., "Syncing 50/100 txns").
- **Offload**: Long ops (sync/heal) to backend queues; UI polls/updates via SSE.

### User Auth & Data Isolation

- **Register/Login**: Email/password + 2FA (optional); JWT tokens.
- **Scope**: All queries filter by user_id; separate schemas per user if needed.

### Subscriptions

- **Tiers**: Basic ($0/mo: limited), Pro ($50 equiv/mo), Enterprise ($200 equiv/mo).
- **Crypto Pay**: On subscribe, generate address/amount (Solana: SPL token? No, native SOL/BTC); QR code in UI.
- **Confirmation**: Backend watcher (e.g., Solana RPC subscribe, BTC API webhooks); 1-confirm for BTC, finality for Solana; auto-activate plan.
- **No intermediaries**: Direct to our multi-sig wallet; track via tx memos.

## Development Process (TDD-Focused)

Build in phases; each feature: Red (fail test) → Green (pass) → Refactor. 100% coverage: Run `jest --coverage` per commit; CI blocks <100%.

**Documentation**: Inline JSDoc; phase-end MD files (e.g., `/docs/api.md`). Update as built.

**AI Agent Notes** (Reference docs in `/notes/`): See separate files `code-notes.md`, `testing-notes.md`, `qa-notes.md`.

### Phase 1: Setup & Planning (Week 1)

- Init monorepo (Turborepo); setup Git, ESLint, Husky pre-commit.
- DB schema design (Prisma: users, wallets, txns, plans).
- TDD: Write tests for auth stubs.
- Docs: README with stack/arch diagram (Mermaid).
- Research: Confirm SDK installs (`npm i ethers @solana/web3.js bitcoinjs-lib @mysten/sui.js @jup-ag/instruction-parser @raydium-io/raydium-sdk`). Research MCP lib (e.g., install from GitHub); plan tool schemas.

### Phase 2: Backend Core & Auth (Weeks 1-2)

- TDD: User register/login endpoints (`POST /auth/register`, `/login`); JWT middleware.
- DB: Migrations for users/plans; seed tiers.
- Subscriptions: Endpoints for `generate_payment` (returns address/amount), `check_payment` (poll chain).
- Tests: 100% (unit: auth logic; int: DB ops).
- Docs: Swagger spec for auth/pay.

### Phase 3: Blockchain Integrations (Weeks 2-4)

- TDD: Adapter interfaces (e.g., `fetchTxns(wallet: string, chain: string): Promise<Txn[]>`). Extend Solana adapter tests for parser mocks (e.g., `expect(parseJupiterTxn(mockTxn)).toEqual({ inputAmount: 1e9, ... })`).
- Implement per chain: Mock RPC first, then real (use testnets: Sepolia, Devnet).
- Sync job: Queue wallet syncs; store txns with user_id.
- Modularity: Config/env for RPC URLs.
- For Solana: In `SolanaAdapter.ts`, after `getTransaction(sig)`:

```typescript
if (isJupiterTxn(txn)) {
  const parsed = parseSwapInstruction(txn); // From @jup-ag/instruction-parser
  // Map to DB model: { type: 'swap', details: parsed }
} else if (isRaydiumTxn(txn)) {
  const parsed = RaydiumSdk.AmmV4.decodeInstruction(txn.instructions[0]); // Example; adapt from SDK
  // Similar mapping
}
```

- MCP Prep: Define initial tool schemas (e.g., for RPC queries) in config.
- Tests: Mock providers; coverage for errors (e.g., invalid wallet). Coverage for program ID checks, parsing errors; use sample txns from Solscan.
- Docs: Adapter guide (`/docs/blockchains.md`). Update with "Solana DEX Parsers: Jupiter for aggregated swaps (enhances cost basis by extracting routes); Raydium for AMM (decodes liquidity events for accurate gains/losses). MCP for dynamic extensions—no recoding for new tools."

### Phase 4: AI Features & Calculations (Weeks 4-6)

- TDD: Cost basis module (e.g., `calculateGains(txns: Txn[], method: 'FIFO'): Report`).
- AI Integration: Endpoint `/heal_txn` (input: `partial_txn`; AI prompt: "Fix [data]; search prices"). Integrate MCP: Setup server (e.g., expose `/mcp` endpoint); configure AI calls to use MCP for tool invocations (e.g., dynamic price consensus via registered APIs).
- Web Search: Integrate SerpAPI (query: "BTC price [date]"); consensus: Avg top 3 results. MCP: As tools for scalability.
- Interactive: WebSocket `/ws/heal` (send suggestions, user approve).
- Gains/Loss: Aggregate query; historical prices via Coingecko API.
- Tests: Mock AI responses; math validation (e.g., `assert gain == proceeds - basis`). Mock MCP calls.
- Docs: AI prompt templates (`/docs/ai.md`). Add MCP guide (`/docs/mcp.md`).

### Phase 5: Frontend (Weeks 5-7)

- TDD: Components (e.g., `LoginForm.test.tsx`); hooks for API/WebSockets.
- Pages: `/dashboard` (wallets/reports), `/sync` (progress), `/heal` (modals), `/subscribe` (QR/pay status).
- Tailwind: Utility classes (e.g., `bg-gradient-to-r from-blue-500`); responsive grid for reports.
- Offload: useSWR for caching; WebSockets for live progress.
- Auth: Protect routes with context.
- Tests: 100% React Testing Lib; E2E Cypress for flows (login → sync → report).
- Docs: Component stories (Storybook).

### Phase 6: Integration & Subscriptions (Week 7)

- TDD: Full flows (e.g., pay → confirm → unlock features).
- Payments: Implement watchers (e.g., Solana: `Connection.onAccountChange(our_wallet)`).
- Data Isolation: Ensure queries use user_id.
- Tests: E2E with mocks (e.g., simulate tx receipt). Include MCP in E2E.

### Phase 7: Testing, QA & Polish (Weeks 8-9)

- Full coverage audit; fix gaps.
- QA: Manual heals on sample data; load test (Artillery on syncs). Test MCP dynamism (e.g., add mock tool).
- Security: Audit (e.g., no SQL inj via Prisma); crypto: Validate amounts on-chain. MCP: Secure tool auth.
- AI Notes: Review code/tests against guidelines.
- Docs: Full API/UI guides; deployment README.

### Phase 8: Deployment & Monitoring (Week 10+)

- Dockerize; CI/CD: Tests → Build → Deploy.
- Monitoring: Sentry for errors; MySQL backups.
- Launch: Beta with sample wallets.

## Risks & Mitigations

- **SDK Changes**: Pin versions; monitor repos.
- **AI Accuracy**: User override + disclaimers; test on historical data.
- **Chain Fees/Rate Limits**: Use paid RPCs (Alchemy/Helius).
- **Crypto Volatility**: Fix USD equiv at payment time.
- **MCP Adoption**: Fallback to hardcoded if immature; test with sample tools.
- **Legal**: Add ToS for tax use.

This plan ensures a lean, focused app. Track via GitHub Projects; weekly reviews.
