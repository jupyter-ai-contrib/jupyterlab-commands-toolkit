/**
 * Playwright configuration, based on the default from @jupyterlab/galata.
 *
 * A single test server is used by every spec. A random port is pinned into the
 * environment once (Playwright re-`require`s this config in each worker, so a
 * fresh random value per reload would desync the server port from the port the
 * workers connect to).
 */
const baseConfig = require('@jupyterlab/galata/lib/playwright-config');

if (!process.env.CT_TEST_PORT) {
  process.env.CT_TEST_PORT = String(8989 + Math.floor(Math.random() * 900));
}
const PORT = Number(process.env.CT_TEST_PORT);

module.exports = {
  ...baseConfig,
  use: { ...(baseConfig.use || {}), baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `jlpm start --ServerApp.port=${PORT}`,
    url: `http://localhost:${PORT}/lab`,
    timeout: 120 * 1000,
    reuseExistingServer: false
  }
};
