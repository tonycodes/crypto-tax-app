// Test setup configuration for app tests
// Global test configuration
jest.setTimeout(10000);

// Mock environment variables for tests
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-jwt-secret-key';
process.env['ENCRYPTION_KEY'] = 'test-encryption-key-32-chars-long';
