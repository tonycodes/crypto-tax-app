# Crypto Tax App

A minimal viable crypto tax application focused on precise gain/loss calculations with AI-driven transaction data healing and multi-blockchain support.

## 🎯 Project Overview

This application provides:

- **Precise gain/loss calculations** with full cost basis analysis
- **AI-powered transaction healing** for incomplete or ambiguous data
- **Multi-blockchain support** (Ethereum, Solana, Bitcoin, Sui)
- **Clean React/Tailwind UI** with real-time progress tracking
- **Crypto-only subscriptions** via direct SOL/BTC payments
- **100% TDD implementation** with comprehensive test coverage

## 🏗️ Architecture

### Tech Stack

- **Frontend**: React 18+ with Vite, Tailwind CSS 3+
- **Backend**: Node.js/Express.js with WebSockets
- **Database**: MySQL 8+ with Prisma ORM
- **Queue System**: BullMQ/Redis for async processing
- **Authentication**: JWT-based with bcrypt
- **AI Integration**: OpenAI GPT-4o with MCP (Model Context Protocol)
- **Testing**: Jest/Vitest, Cypress, React Testing Library

### Blockchain SDKs

- **Ethereum**: Ethers.js v6+
- **Solana**: @solana/web3.js, @jup-ag/instruction-parser, @raydium-io/raydium-sdk
- **Bitcoin**: bitcoinjs-lib v6+ with external APIs
- **Sui**: @mysten/sui.js

## 📋 Key Features

### 1. Cost Basis Calculation

- FIFO/LIFO methodologies
- Support for complex DeFi transactions
- Accurate handling of swaps, LP tokens, airdrops
- Tax-year compliant reporting

### 2. AI-Powered Transaction Healing

- Interactive workflow for incomplete transactions
- Multi-source price consensus (CoinGecko, CoinMarketCap, etc.)
- Confidence scoring for AI suggestions
- User approval required for all changes

### 3. Advanced Solana Integration

- Jupiter aggregator swap parsing
- Raydium AMM transaction decoding
- Program ID-based transaction routing
- Comprehensive DEX coverage

### 4. MCP Integration

- Dynamic tool registration for AI services
- Extensible blockchain adapter system
- Real-time consensus from multiple data sources
- Configuration-driven service expansion

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- MySQL 8+
- Redis 6+

> ✅ **Quick start with Docker**
>
> ```bash
> # Start a local MySQL instance with the expected credentials
> docker run --name crypto-tax-mysql \
>   -e MYSQL_ROOT_PASSWORD=password \
>   -p 3307:3306 \
>   -d mysql:8
>
> # (optional) create dev/test databases
> docker exec crypto-tax-mysql \
>   mysql -uroot -ppassword \
>   -e "CREATE DATABASE IF NOT EXISTS crypto_tax_dev; CREATE DATABASE IF NOT EXISTS crypto_tax_test;"
>
> # Create dedicated application user
> docker exec crypto-tax-mysql \
>   mysql -uroot -ppassword \
>   -e "CREATE USER IF NOT EXISTS 'app'@'%' IDENTIFIED BY 'password'; GRANT ALL PRIVILEGES ON *.* TO 'app'@'%' WITH GRANT OPTION; FLUSH PRIVILEGES;"
> ```

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd crypto-tax-app

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration

# Setup database
npx prisma migrate dev
npx prisma db seed

# Start development servers
npm run dev
```

### Testing

```bash
# Run all tests with coverage
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Check coverage
npm run test:coverage
```

## 📁 Project Structure

```
crypto-tax-app/
├── backend/              # Express.js API server
├── frontend/             # React application
├── shared/               # Shared types and utilities
├── docs/                 # Project documentation
├── CLAUDE.md             # AI agent guidelines
└── README.md
```

## 🔒 Security & Compliance

### Security Measures

- **No private keys stored** - Ever, anywhere
- **Data encryption** at rest and in transit
- **Input validation** on all endpoints
- **Rate limiting** and HTTPS enforcement
- **Parameterized queries** to prevent SQL injection

### Compliance Features

- **Tax disclaimers** throughout the application
- **User data isolation** with strict access controls
- **Audit trails** for all data modifications
- **GDPR compliance** features where applicable

## 💰 Subscription Model

### Pricing Tiers

- **Basic** (Free): 1 blockchain, basic reports
- **Pro** ($50/month equivalent): All blockchains, AI healing
- **Enterprise** ($200/month equivalent): Custom features, priority support

### Payment Method

- Direct cryptocurrency payments (SOL/BTC)
- On-chain verification with automatic activation
- No intermediaries or third-party payment processors

## 🧪 Development Process

This project follows strict **Test-Driven Development (TDD)**:

1. **Red**: Write failing tests first
2. **Green**: Write minimal code to pass tests
3. **Refactor**: Improve code while keeping tests green

### Quality Gates

- **100% test coverage** required
- **No security vulnerabilities** in dependencies
- **Performance benchmarks** must be met
- **Manual QA** checklist completion

## 📖 Documentation

- [`docs/implementation-plan.md`](docs/implementation-plan.md) - Complete project specification
- [`docs/code-notes.md`](docs/code-notes.md) - Coding guidelines and patterns
- [`docs/testing-notes.md`](docs/testing-notes.md) - TDD and testing requirements
- [`docs/qa-notes.md`](docs/qa-notes.md) - Quality assurance guidelines
- [`CLAUDE.md`](CLAUDE.md) - AI agent development guidelines

## 🤝 Contributing

1. Read all documentation in `/docs/` folder
2. Follow TDD practices strictly
3. Ensure 100% test coverage
4. Run full test suite before submitting PRs
5. Follow security guidelines in `CLAUDE.md`

## ⚖️ Legal

This application does not provide tax advice. Users are responsible for the accuracy of their tax calculations and should consult with qualified tax professionals.

## 📊 Development Timeline

- **Phase 1**: Setup & Planning (Week 1)
- **Phase 2**: Backend Core & Auth (Weeks 1-2)
- **Phase 3**: Blockchain Integrations (Weeks 2-4)
- **Phase 4**: AI Features & Calculations (Weeks 4-6)
- **Phase 5**: Frontend Development (Weeks 5-7)
- **Phase 6**: Integration & Subscriptions (Week 7)
- **Phase 7**: Testing, QA & Polish (Weeks 8-9)
- **Phase 8**: Deployment & Monitoring (Week 10+)

---

**Built with ❤️ for the crypto community**
