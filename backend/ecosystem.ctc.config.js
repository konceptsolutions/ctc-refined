/**
 * PM2 config for CTC / Koncepts ERP backend (Node 16+ / current LTS).
 * Use: pm2 startOrReload ecosystem.ctc.config.js --update-env
 */
module.exports = {
  apps: [
    {
      name: "backend",
      script: "dist/server.js",
      cwd: "/home/ubuntu/ctc-refined/backend",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      max_memory_restart: "900M",
      node_args: "--max-old-space-size=768",
      env: {
        NODE_ENV: "production",
        PORT: 5001,
        SERVER_ORIGIN: "https://crystaltrading.net",
        CORS_ORIGIN:
          "https://crystaltrading.net,https://www.crystaltrading.net,http://crystaltrading.net,http://www.crystaltrading.net,https://erpsystem.crystaltrading.net",
      },
      error_file: "/home/ubuntu/.pm2/logs/backend-error.log",
      out_file: "/home/ubuntu/.pm2/logs/backend-out.log",
      time: true,
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",
      restart_delay: 3000,
      kill_timeout: 5000,
    },
  ],
};
