import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig = {
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
};

export default createJestConfig(customJestConfig);
