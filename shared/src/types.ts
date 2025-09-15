import { z } from 'zod';

// Enum Types
export const ChainTypeEnum = z.enum(['ethereum', 'solana', 'bitcoin', 'sui']);
export type ChainType = z.infer<typeof ChainTypeEnum>;

export const TransactionTypeEnum = z.enum([
  'buy',
  'sell',
  'swap',
  'transfer',
  'airdrop',
  'reward',
  'fee'
]);
export type TransactionType = z.infer<typeof TransactionTypeEnum>;

export const PlanTypeEnum = z.enum(['BASIC', 'PRO', 'ENTERPRISE']);
export type PlanType = z.infer<typeof PlanTypeEnum>;

export const CalculationMethodEnum = z.enum(['FIFO', 'LIFO']);
export type CalculationMethod = z.infer<typeof CalculationMethodEnum>;

// Core Domain Schemas
export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  passwordHash: z.string().min(1),
  plan: PlanTypeEnum,
  twoFactorEnabled: z.boolean().optional().default(false),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type User = z.infer<typeof UserSchema>;

export const WalletSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  address: z.string().min(1),
  chain: ChainTypeEnum,
  label: z.string().optional(),
  isActive: z.boolean().default(true),
  lastSyncedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Wallet = z.infer<typeof WalletSchema>;

export const TransactionSchema = z.object({
  id: z.string().min(1),
  walletId: z.string().min(1),
  hash: z.string().min(1),
  chain: ChainTypeEnum,
  type: TransactionTypeEnum,
  tokenSymbol: z.string().min(1),
  tokenAddress: z.string().optional(),
  amount: z.string().min(1), // String to handle large numbers and precision
  priceUSD: z.number().min(0).optional(),
  feeAmount: z.string().optional(),
  feeTokenSymbol: z.string().optional(),
  timestamp: z.date(),
  blockNumber: z.number().int().min(0).optional(),
  isHealed: z.boolean().default(false),
  healingConfidence: z.number().min(0).max(1).optional().nullable(),
  metadata: z.record(z.any()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const PlanSchema = z.object({
  id: z.string().min(1),
  name: PlanTypeEnum,
  monthlyPriceUSD: z.number().min(0),
  features: z.array(z.string()),
  chainLimit: z.number().int().min(1).nullable().default(null),
  transactionLimit: z.number().int().min(1).nullable().default(null),
  hasAIHealing: z.boolean().default(false),
  hasAdvancedReports: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type Plan = z.infer<typeof PlanSchema>;

// API Request/Response Schemas
export const AuthRegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type AuthRegisterRequest = z.infer<typeof AuthRegisterRequestSchema>;

export const AuthLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type AuthLoginRequest = z.infer<typeof AuthLoginRequestSchema>;

export const AuthResponseSchema = z.object({
  user: UserSchema.omit({ passwordHash: true }),
  token: z.string().min(1),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const WalletSyncRequestSchema = z.object({
  walletAddress: z.string().min(1),
  chain: ChainTypeEnum,
});
export type WalletSyncRequest = z.infer<typeof WalletSyncRequestSchema>;

// Blockchain Adapter Types
export const BlockchainAdapterConfigSchema = z.object({
  rpcUrl: z.string().url(),
  apiKey: z.string().optional(),
  rateLimitMs: z.number().int().min(0).default(1000),
  maxRetries: z.number().int().min(0).default(3),
});
export type BlockchainAdapterConfig = z.infer<typeof BlockchainAdapterConfigSchema>;

export const ParsedTransactionDataSchema = z.object({
  type: TransactionTypeEnum,
  inputToken: z.string().optional(),
  outputToken: z.string().optional(),
  inputAmount: z.string().optional(),
  outputAmount: z.string().optional(),
  fees: z.array(z.object({
    amount: z.string(),
    token: z.string(),
  })).default([]),
  metadata: z.record(z.any()).default({}),
});
export type ParsedTransactionData = z.infer<typeof ParsedTransactionDataSchema>;

// Cost Basis and Tax Calculation Types
export const CostBasisEntrySchema = z.object({
  transactionId: z.string(),
  amount: z.string(),
  costBasisUSD: z.number(),
  acquisitionDate: z.date(),
  method: CalculationMethodEnum,
});
export type CostBasisEntry = z.infer<typeof CostBasisEntrySchema>;

export const GainsReportSchema = z.object({
  userId: z.string(),
  taxYear: z.number().int().min(2009).max(2100),
  method: CalculationMethodEnum,
  totalGainUSD: z.number(),
  totalLossUSD: z.number(),
  netGainLossUSD: z.number(),
  transactions: z.array(z.object({
    transactionId: z.string(),
    tokenSymbol: z.string(),
    amount: z.string(),
    costBasis: z.number(),
    proceeds: z.number(),
    gainLoss: z.number(),
    acquisitionDate: z.date(),
    disposalDate: z.date(),
  })),
  generatedAt: z.date(),
});
export type GainsReport = z.infer<typeof GainsReportSchema>;

// AI/MCP Integration Types
export const MCPToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(z.any()),
    required: z.array(z.string()).default([]),
  }),
});
export type MCPTool = z.infer<typeof MCPToolSchema>;

export const AIHealingSuggestionSchema = z.object({
  transactionId: z.string(),
  field: z.string(),
  currentValue: z.any(),
  suggestedValue: z.any(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  sources: z.array(z.string()).default([]),
});
export type AIHealingSuggestion = z.infer<typeof AIHealingSuggestionSchema>;

// Error Types
export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.any()).optional(),
  timestamp: z.date(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// Subscription/Payment Types
export const PaymentRequestSchema = z.object({
  planType: PlanTypeEnum,
  cryptocurrency: z.enum(['SOL', 'BTC']),
  userEmail: z.string().email(),
});
export type PaymentRequest = z.infer<typeof PaymentRequestSchema>;

export const PaymentInvoiceSchema = z.object({
  id: z.string(),
  planType: PlanTypeEnum,
  cryptocurrency: z.enum(['SOL', 'BTC']),
  amount: z.string(),
  address: z.string(),
  qrCode: z.string(), // Base64 encoded QR code
  expiresAt: z.date(),
  status: z.enum(['pending', 'confirmed', 'expired', 'failed']),
  createdAt: z.date(),
});
export type PaymentInvoice = z.infer<typeof PaymentInvoiceSchema>;