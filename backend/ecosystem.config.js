module.exports = {
  apps: [
    {
      name: 'backend-nextapp',
      script: 'node',
      args: 'dist/server.js',
      cwd: '/var/www/nextapp/backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        SERVER_ORIGIN: 'http://103.60.12.157'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        SERVER_ORIGIN: 'http://103.60.12.157'
      },
      error_file: '/root/.pm2/logs/backend-nextapp-error.log',
      out_file: '/root/.pm2/logs/backend-nextapp-out.log',
      log_file: '/root/.pm2/logs/backend-nextapp-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000
    },
    {
      name: 'frontend-nextapp',
      script: 'npm',
      args: 'run preview -- --port 8080 --host',
      cwd: '/var/www/nextapp',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 8080
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080
      },
      error_file: '/root/.pm2/logs/frontend-nextapp-error.log',
      out_file: '/root/.pm2/logs/frontend-nextapp-out.log',
      log_file: '/root/.pm2/logs/frontend-nextapp-combined.log',
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000
    }
  ]
};
