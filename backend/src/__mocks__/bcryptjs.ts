export default {
  hash: jest.fn(() => Promise.resolve('hashed_password')),
  compare: jest.fn(() => Promise.resolve(true)),
  hashSync: jest.fn(() => 'hashed_password'),
  compareSync: jest.fn(() => true),
  genSalt: jest.fn(() => Promise.resolve('salt')),
  genSaltSync: jest.fn(() => 'salt'),
};
