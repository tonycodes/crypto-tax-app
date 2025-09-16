# Key Technical Decisions & Rationale

This document captures critical technical decisions made during development, their rationale, and implications for future development.

## 🏗️ Architecture Decisions

### 1. Monorepo with Turborepo

**Decision**: Use Turborepo for monorepo management
**Date**: Phase 1
**Rationale**:

- Type sharing between frontend and backend
- Consistent tooling and build processes
- Dependency management across packages
- Better than Lerna for TypeScript projects

**Implications**:

- ✅ Shared types eliminate API mismatches
- ✅ Consistent code quality across packages
- ⚠️ More complex dependency management
- ⚠️ Requires package-level tooling configuration

### 2. Zod for Runtime Validation

**Decision**: Use Zod for schema validation instead of Joi or Yup
**Date**: Phase 1
**Rationale**:

- TypeScript-first design
- Runtime validation + compile-time types
- Better error messages for debugging
- Composable schema design

**Implications**:

- ✅ Eliminates type/runtime validation duplication
- ✅ Excellent error messages for API validation
- ✅ Compile-time type inference
- ⚠️ Learning curve for complex schemas

### 3. String-Based Amount Storage

**Decision**: Store blockchain amounts as strings, not numbers
**Date**: Phase 1
**Rationale**:

- JavaScript number precision issues with large integers
- Blockchain amounts often exceed MAX_SAFE_INTEGER
- Preserves exact precision from RPC calls
- BigInt compatibility for calculations

**Implications**:

- ✅ No precision loss in calculations
- ✅ Handles wei, lamports, satoshis correctly
- ⚠️ Requires conversion utilities for display
- ⚠️ More complex arithmetic operations

## 🔒 Security Decisions

### 1. No Private Key Storage

**Decision**: Never store private keys anywhere in the system
**Date**: Phase 1 (Design)
**Rationale**:

- Eliminates catastrophic security risk
- Users maintain custody of funds
- Reduces regulatory compliance burden
- Industry best practice for tax tools

**Implications**:

- ✅ Zero risk of fund loss
- ✅ User retains full control
- ⚠️ Requires wallet integration for payments
- ⚠️ More complex subscription flow

### 2. Wallet Address Encryption

**Decision**: Encrypt wallet addresses in database
**Date**: Phase 1 (Design)
**Rationale**:

- Protect user privacy
- Comply with data protection regulations
- Prevent address correlation attacks
- Defense in depth security

**Implications**:

- ✅ Enhanced user privacy
- ✅ Regulatory compliance
- ⚠️ Requires key management system
- ⚠️ Slight performance impact on queries

### 3. Input Validation at All Boundaries

**Decision**: Validate all inputs with Zod schemas
**Date**: Phase 1
**Rationale**:

- Prevent injection attacks
- Ensure data integrity
- Catch errors early in pipeline
- Self-documenting API contracts

**Implications**:

- ✅ Strong defense against malicious input
- ✅ Clear API documentation
- ✅ Better error messages
- ⚠️ Additional validation overhead

## 🧪 Testing Decisions

### 1. 100% Test Coverage Mandate

**Decision**: Require 100% test coverage for all code
**Date**: Phase 1
**Rationale**:

- Financial application requires high reliability
- Prevent regressions during development
- Force consideration of edge cases
- Enable confident refactoring

**Implications**:

- ✅ High code quality and reliability
- ✅ Safer refactoring and changes
- ✅ Documentation through tests
- ⚠️ Slower initial development
- ⚠️ Requires discipline to maintain

### 2. TDD Red-Green-Refactor

**Decision**: Strict Test-Driven Development approach
**Date**: Phase 1
**Rationale**:

- Forces clear specification before implementation
- Prevents over-engineering
- Ensures testable code design
- Required by CLAUDE.md mandate

**Implications**:

- ✅ Better code design and modularity
- ✅ Comprehensive test coverage
- ✅ Clear requirements definition
- ⚠️ Requires TDD expertise
- ⚠️ Slower for simple utilities

### 3. Jest for Testing Framework

**Decision**: Use Jest over Mocha/Jasmine/Vitest
**Date**: Phase 1
**Rationale**:

- Excellent TypeScript support
- Built-in mocking capabilities
- Coverage reporting included
- Large ecosystem and community

**Implications**:

- ✅ Rich testing capabilities
- ✅ Good IDE integration
- ✅ Mature and stable
- ⚠️ Can be slower than alternatives

## 🔧 Development Tooling

### 1. TypeScript Strict Mode

**Decision**: Enable all TypeScript strict options
**Date**: Phase 1
**Rationale**:

- Catch more bugs at compile time
- Force handling of null/undefined
- Better code documentation
- Industry best practice

**Configuration**:

```json
{
  "strict": true,
  "noImplicitAny": true,
  "noImplicitReturns": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true,
  "exactOptionalPropertyTypes": true,
  "noImplicitOverride": true,
  "noPropertyAccessFromIndexSignature": true,
  "noUncheckedIndexedAccess": true
}
```

**Implications**:

- ✅ Fewer runtime errors
- ✅ Self-documenting code
- ✅ Better IDE support
- ⚠️ More verbose code
- ⚠️ Steeper learning curve

### 2. ESLint v8 Pin

**Decision**: Pin to ESLint v8.57.0 instead of v9+
**Date**: Phase 1
**Rationale**:

- v9 changed configuration format
- Ecosystem compatibility issues
- Stable and well-tested
- Avoid breaking changes mid-project

**Implications**:

- ✅ Stable linting configuration
- ✅ Compatible with existing tools
- ⚠️ Missing newer ESLint features
- ⚠️ Will need migration eventually

### 3. Prettier for Code Formatting

**Decision**: Use Prettier with specific configuration
**Date**: Phase 1
**Configuration**:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "avoid"
}
```

**Rationale**:

- Consistent code formatting
- Eliminate formatting debates
- Improve code review focus
- Standard industry practice

## 🌐 Blockchain Integration Decisions

### 1. Multi-Chain Address Validation

**Decision**: Implement chain-specific address validation
**Date**: Phase 1
**Rationale**:

- Prevent user input errors
- Validate before expensive RPC calls
- Better user experience
- Data integrity assurance

**Implementation**:

- Ethereum: `/^0x[a-fA-F0-9]{40}$/`
- Solana: `/^[1-9A-HJ-NP-Za-km-z]{32,44}$/`
- Bitcoin: Legacy + Bech32 patterns
- Sui: `/^0x[a-fA-F0-9]{64}$/`

**Implications**:

- ✅ Better error messages
- ✅ Reduced invalid API calls
- ⚠️ Needs updates for new address formats
- ⚠️ Regex patterns require maintenance

### 2. Adapter Pattern for Blockchains

**Decision**: Use adapter pattern for blockchain integrations
**Date**: Phase 1 (Design)
**Rationale**:

- Consistent interface across chains
- Easy to add new blockchains
- Testable with mocks
- Separation of concerns

**Interface Design**:

```typescript
interface IBlockchainAdapter {
  fetchTxns(wallet: string): Promise<Txn[]>;
  validateAddress(address: string): boolean;
  parseTxn(rawTxn: any): ParsedTxnData;
}
```

**Implications**:

- ✅ Consistent development patterns
- ✅ Easy to test and mock
- ✅ Simplified adding new chains
- ⚠️ May not fit all blockchain models

## 🤖 AI Integration Decisions

### 1. MCP (Model Context Protocol) for Extensibility

**Decision**: Use MCP for dynamic AI tool registration
**Date**: Phase 1 (Design)
**Rationale**:

- Avoid hardcoded integrations
- Dynamic service discovery
- Standard protocol compliance
- Future-proof architecture

**Implications**:

- ✅ Highly extensible AI capabilities
- ✅ Standard protocol compliance
- ⚠️ Additional complexity
- ⚠️ Dependency on MCP ecosystem

### 2. Backend-Only AI Processing

**Decision**: Keep all AI processing on backend
**Date**: Phase 1 (Design)
**Rationale**:

- Protect API keys
- Centralized cost control
- Better error handling
- Consistent processing environment

**Implications**:

- ✅ Secure API key management
- ✅ Centralized monitoring
- ⚠️ Requires WebSocket for real-time updates
- ⚠️ Backend scaling considerations

## 💳 Payment System Decisions

### 1. Direct Crypto Payments Only

**Decision**: Accept only SOL/BTC payments directly to our wallets
**Date**: Phase 1 (Design)
**Rationale**:

- No intermediary fees
- Align with crypto-native audience
- Eliminate credit card fraud
- Reduce compliance burden

**Implications**:

- ✅ Zero payment processing fees
- ✅ Instant settlement
- ⚠️ Price volatility risk
- ⚠️ More complex UX flow

### 2. On-Chain Payment Verification

**Decision**: Verify payments on-chain instead of webhooks
**Date**: Phase 1 (Design)
**Rationale**:

- Eliminate third-party dependencies
- Trustless verification
- Lower latency
- Better reliability

**Implications**:

- ✅ Trustless and reliable
- ✅ No webhook infrastructure needed
- ⚠️ Requires RPC monitoring
- ⚠️ Chain reorganization handling

## 🗄️ Database Decisions

### 1. MySQL for Primary Database

**Decision**: Standardize on MySQL instead of PostgreSQL
**Date**: Phase 1 (Revised)
**Rationale**:

- ACID guarantees with wide operational familiarity
- Native JSON column support for metadata payloads
- Broad managed-service availability (PlanetScale, RDS, AlloyDB for MySQL)
- Smooth Prisma integration with connection pooling support

**Implications**:

- ✅ Keeps financial data strongly consistent
- ✅ Easier hand-off to DevOps teams already supporting MySQL
- ✅ JSON columns cover metadata needs without separate services
- ⚠️ Requires workarounds for features like array columns (handled via JSON)

### 2. Prisma ORM

**Decision**: Use Prisma instead of TypeORM/Sequelize
**Date**: Phase 1 (Design)
**Rationale**:

- Excellent TypeScript integration
- Type-safe database queries
- Great migration system
- Active development and community

**Implications**:

- ✅ Type safety from database to API
- ✅ Excellent developer experience
- ✅ Automated migration generation
- ⚠️ Learning curve for complex queries
- ⚠️ Some advanced MySQL-specific tuning (e.g., generated columns) require manual migrations

## 📝 Documentation Decisions

### 1. Markdown for All Documentation

**Decision**: Use Markdown for all project documentation
**Date**: Phase 1
**Rationale**:

- Version control friendly
- Easy to read and write
- Universal tool support
- GitHub integration

**Implications**:

- ✅ Trackable documentation changes
- ✅ Easy collaboration
- ✅ No special tools required
- ⚠️ Limited formatting options

### 2. JSDoc for Code Documentation

**Decision**: Use JSDoc comments for all public APIs
**Date**: Phase 1
**Rationale**:

- IDE integration and IntelliSense
- TypeScript compatibility
- Automated documentation generation
- Industry standard

**Implications**:

- ✅ Better developer experience
- ✅ Self-documenting code
- ✅ IDE tooltips and completion
- ⚠️ Requires discipline to maintain

---

## 🔄 Decision Review Process

These decisions should be reviewed:

- **Quarterly**: Major architectural decisions
- **Monthly**: Security and compliance decisions
- **As needed**: Tooling and development decisions

## 📋 Decision Template

For future decisions, use this template:

```markdown
### [Decision Number]. [Decision Title]

**Decision**: [What was decided]
**Date**: [When decided]
**Rationale**: [Why this decision was made]
**Alternatives Considered**: [What else was evaluated]
**Implications**: [Consequences and trade-offs]
**Review Date**: [When to reconsider]
```
