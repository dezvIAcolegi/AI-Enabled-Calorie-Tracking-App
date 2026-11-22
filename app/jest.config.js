module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@contracts/(.*)$': '<rootDir>/../contracts/ts/$1',
  },
};
