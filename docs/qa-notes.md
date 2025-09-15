# QA Notes for Crypto Tax App

These notes provide guidelines for AI agents or QA teams on quality assurance, focusing on manual/automated verification beyond tests.

## General Guidelines

### Scope
Verify features against plan: Accuracy (gains/losses), UX (easy nav), Security (data isolation).

### Tools
- **Manual**: Browser dev tools, Postman for API testing
- **Automated**: Artillery for load testing, OWASP ZAP for security scans
- **Performance**: Lighthouse for frontend, Apache Bench for backend

### Environments
- Test on staging environment that mirrors production
- Use sample data from testnets (e.g., testnet wallets with known transaction history)
- Test with various wallet sizes (small, medium, large transaction volumes)

## Specific Quality Checks

### Manual Testing Scenarios

#### Transaction Accuracy
- **Edge transactions**: Test forked chains, ambiguous swap transactions, failed transactions
- **Cost basis verification**: Cross-verify calculated gains with manual calculations using Excel/Google Sheets
- **Multi-chain scenarios**: Test wallets with transactions across multiple blockchains
- **Complex DeFi interactions**: LP tokens, yield farming, NFT sales, airdrops

#### AI Healing Workflow
- **Simulate incomplete data**: Test transactions with missing prices, timestamps, or token information
- **Verify AI suggestions**: Manually confirm AI-suggested price data against historical sources
- **User interaction flow**: Test modal workflows, confirmation dialogs, batch healing operations
- **Consensus validation**: Verify that price consensus uses multiple sources and handles discrepancies

#### MCP Integration Testing
- **Dynamic tool invocation**: Add mock MCP tools and verify AI can discover and use them
- **Tool failure handling**: Test scenarios where MCP tools are unavailable or return errors
- **Security validation**: Ensure MCP tool access is properly authenticated and authorized

### Automated Quality Assurance

#### Load Testing with Artillery
```yaml
# artillery-config.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
    - duration: 120
      arrivalRate: 50

scenarios:
  - name: "Wallet sync load test"
    flow:
      - post:
          url: "/auth/login"
          json:
            email: "test@example.com"
            password: "password"
      - post:
          url: "/api/wallets/sync"
          json:
            walletAddress: "{{ $randomString() }}"
            chain: "solana"
```

#### Security Testing
- **OWASP ZAP scans**: Automated vulnerability scanning for XSS, SQL injection, CSRF
- **Authentication testing**: Token expiration, invalid tokens, privilege escalation
- **Input validation**: Test all API endpoints with malformed data, oversized payloads
- **Rate limiting**: Verify API rate limits are enforced and properly configured

#### Performance Benchmarks
- **Sync performance**: 1000 transactions should sync within 30 seconds
- **Report generation**: Tax reports for 10,000 transactions within 10 seconds
- **AI healing**: Individual transaction healing within 5 seconds
- **Database queries**: All API endpoints respond within 500ms under normal load

### Accuracy Validation

#### Mathematical Verification
- **FIFO/LIFO calculations**: Verify cost basis calculations against known correct results
- **Gain/loss reporting**: Cross-check total gains with sum of individual transaction gains
- **Tax year boundaries**: Verify transactions are properly grouped by tax year
- **Foreign exchange**: Test conversion rates and USD equivalent calculations

#### Data Consistency
- **Transaction parsing**: Verify parsed Solana transactions match raw blockchain data
- **Chain synchronization**: Ensure no transactions are missed or duplicated during sync
- **Price data accuracy**: Compare fetched historical prices with multiple authoritative sources

#### Consensus Validation
- **Multi-source agreement**: Price consensus should use at least 3 sources when available
- **Outlier handling**: Test how system handles price outliers or obviously incorrect data
- **Confidence scoring**: Verify AI assigns appropriate confidence levels to healed data

## User Experience Testing

### Usability Testing
- **New user onboarding**: Can a new user successfully add a wallet and generate a report?
- **Error handling**: Are error messages clear and actionable?
- **Progress indication**: Do long-running operations show appropriate progress feedback?
- **Mobile responsiveness**: Test on various mobile devices and screen sizes

### Accessibility Testing
- **Screen reader compatibility**: Test with NVDA, JAWS, VoiceOver
- **Keyboard navigation**: All functionality accessible via keyboard
- **Color contrast**: Verify WCAG AA compliance for all UI elements
- **Focus management**: Proper focus handling in modals and dynamic content

### Cross-Platform Testing
- **Browser compatibility**: Test on Chrome, Firefox, Safari, Edge (latest 2 versions)
- **Operating systems**: Windows, macOS, Linux, iOS, Android
- **Screen resolutions**: 1920x1080, 1366x768, 375x667 (mobile)

## Blockchain-Specific QA

### Solana Testing
- **Jupiter integration**: Test swap parsing with various Jupiter route types
- **Raydium integration**: Verify AMM transaction parsing and LP token handling
- **Program ID validation**: Ensure correct program IDs are used for transaction filtering
- **RPC resilience**: Test behavior when Solana RPC is slow or unresponsive

### Ethereum Testing
- **Gas fee handling**: Verify gas fees are properly included in cost basis calculations
- **ERC-20 tokens**: Test various token standards and decimal precision
- **Failed transactions**: Ensure failed transactions are handled appropriately
- **Layer 2 compatibility**: Test with Polygon, Arbitrum, Optimism if supported

### Bitcoin Testing
- **UTXO handling**: Verify proper handling of Bitcoin's UTXO model
- **Transaction fee allocation**: Test fee distribution across multiple outputs
- **Segwit compatibility**: Test legacy, segwit, and native segwit addresses

## Security QA

### Authentication & Authorization
- **JWT token security**: Verify tokens are properly signed and validated
- **Session management**: Test token expiration and refresh mechanisms
- **User data isolation**: Ensure users can only access their own data
- **Admin functionality**: If present, verify admin access controls

### Data Protection
- **Sensitive data encryption**: Verify wallet addresses and transaction data are encrypted at rest
- **API key security**: Ensure API keys are not exposed in logs or responses
- **Input sanitization**: Test for XSS, SQL injection, command injection vulnerabilities
- **HTTPS enforcement**: Verify all communications use HTTPS

### Crypto Payment Security
- **Address validation**: Verify generated payment addresses are correct and unique
- **Transaction verification**: Ensure payments are properly verified on-chain
- **Multi-sig security**: If using multi-sig wallets, verify proper signing requirements
- **Payment timeout**: Test behavior when payments are not received within timeout period

## Performance & Scalability QA

### Database Performance
- **Query optimization**: Monitor slow queries and ensure proper indexing
- **Connection pooling**: Verify database connections are properly managed
- **Backup/restore**: Test database backup and restore procedures
- **Migration testing**: Verify schema migrations work correctly

### API Performance
- **Response times**: All endpoints should respond within SLA requirements
- **Concurrent users**: Test system behavior with multiple simultaneous users
- **Memory usage**: Monitor for memory leaks during extended testing
- **Error rate monitoring**: Track and investigate any API errors or timeouts

### Blockchain RPC Performance
- **Rate limiting**: Verify proper handling of RPC rate limits
- **Failover**: Test behavior when primary RPC providers are unavailable
- **Caching**: Verify price and transaction data are appropriately cached
- **Batch operations**: Test bulk transaction fetching and processing

## Compliance & Legal QA

### Tax Compliance
- **Disclaimer accuracy**: Verify tax disclaimers are prominent and accurate
- **Jurisdiction support**: Test with different tax jurisdictions if supported
- **Report formats**: Verify exported reports match expected tax form requirements
- **Data retention**: Ensure proper data retention policies for tax records

### Privacy Compliance
- **GDPR compliance**: If applicable, verify data deletion and portability features
- **Privacy policy**: Ensure privacy policy accurately reflects data handling practices
- **Cookie consent**: Verify proper cookie consent mechanisms if cookies are used

## Quality Metrics & Thresholds

### Pass/Fail Criteria
- **Zero P0 bugs**: No critical bugs that prevent core functionality
- **95%+ feature coverage**: All planned features must be tested
- **Performance SLAs met**: All performance benchmarks must be achieved
- **Security scan clean**: No high or critical security vulnerabilities

### Quality Gates
1. **Unit tests**: 100% coverage, all tests passing
2. **Integration tests**: All API endpoints tested, database operations verified
3. **E2E tests**: Core user journeys tested and passing
4. **Security scan**: No high or critical vulnerabilities
5. **Performance test**: All benchmarks met
6. **Manual QA**: All test scenarios executed and documented

## Bug Reporting & Tracking

### Bug Classification
- **P0 (Critical)**: System down, data loss, security breach
- **P1 (High)**: Core functionality broken, incorrect calculations
- **P2 (Medium)**: Non-core functionality issues, minor UX problems
- **P3 (Low)**: Cosmetic issues, nice-to-have improvements

### Bug Report Template
```
**Title**: Clear, descriptive title
**Priority**: P0/P1/P2/P3
**Environment**: Staging/Production/Local
**Browser/Device**: Chrome 118, Windows 11
**Steps to Reproduce**:
1. Navigate to...
2. Click on...
3. Enter...

**Expected Result**: What should happen
**Actual Result**: What actually happened
**Screenshots/Logs**: Attach relevant media
**Workaround**: If available
**Additional Notes**: Any other relevant information
```

## Post-Release Monitoring

### Production Metrics
- **Error rates**: Monitor application error rates and investigate spikes
- **Performance monitoring**: Track API response times and database query performance
- **User feedback**: Monitor support channels for user-reported issues
- **Transaction accuracy**: Periodic verification of tax calculations against known correct data

### Continuous Improvement
- **Retrospectives**: Regular review of QA processes and identified issues
- **Tool evaluation**: Assess effectiveness of QA tools and consider improvements
- **Test automation expansion**: Continuously expand automated test coverage
- **Performance optimization**: Regular performance testing and optimization

Reference this for QA execution and quality assurance practices. Cross-check with `code-notes.md` and `testing-notes.md` for comprehensive quality coverage.