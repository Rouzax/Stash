import { defineConfig } from '@playwright/test';

const BACKEND_PORT = process.env.E2E_BACKEND_PORT || 3333;
const FRONTEND_PORT = process.env.E2E_FRONTEND_PORT || 5174;

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    screenshot: 'off',
  },
  webServer: [
    {
      command: `cd server && SESSION_SECRET=test-secret-that-is-at-least-32-chars DB_PATH=./e2e-test.db PORT=${BACKEND_PORT} RATE_LIMIT=1000 LOGIN_RATE_LIMIT=100 LOG_LEVEL=warn node index.js`,
      port: Number(BACKEND_PORT),
      reuseExistingServer: false,
    },
    {
      command: `cd web && VITE_API_TARGET=http://localhost:${BACKEND_PORT} npm run dev -- --port ${FRONTEND_PORT}`,
      port: Number(FRONTEND_PORT),
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 } },
    },
  ],
});
