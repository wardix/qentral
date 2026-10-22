module.exports = {
  apps: [
    {
      name: 'job-api-web',
      script: 'src/server.ts',
      interpreter: 'bun',
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'job-worker',
      script: 'src/worker.ts',
      interpreter: 'bun',
      instances: 2,
      autorestart: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
