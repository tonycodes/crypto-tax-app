export default {
  sign: jest.fn(() => 'jwt_token'),
  verify: jest.fn(() => ({ userId: 'user123', email: 'test@example.com', planId: 'basic' })),
  decode: jest.fn(() => ({ userId: 'user123', email: 'test@example.com' })),
};
