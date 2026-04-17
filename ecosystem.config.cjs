module.exports = {
  apps: [
    {
      name: "conot",
      script: "src/index.js",
      interpreter: "node",
      node_args: "--env-file=.env",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      kill_timeout: 10000,
      min_uptime: "30s",
      restart_delay: 3000
    }
  ]
};
