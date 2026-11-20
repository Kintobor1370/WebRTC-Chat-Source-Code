// REPLACE 'yourwebdomain.com' with the web domain 
// that you host the web application on

import { defineConfig } from 'vite';

export default defineConfig({
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['yourwebdomain.com'],
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: ['yourwebdomain.com'],
  },
});
