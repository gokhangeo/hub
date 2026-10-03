import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', timeout: 120000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [{name:'chromium',use:{...devices['Desktop Chrome'], launchOptions: process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--allow-loopback-in-peer-connection','--disable-features=WebRtcHideLocalIpsWithMdns']} : {}}},{name:'mobile-chromium',use:{...devices['iPhone 13'],browserName:'chromium',launchOptions:process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']} : {}}},{name:'webkit',use:{...devices['iPhone 13']}}],
  webServer: { command:'node tests/helpers/browser-server.mjs', url:'http://127.0.0.1:4173', reuseExistingServer:false }
});
