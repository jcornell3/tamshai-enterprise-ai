// Prevent tests from binding to the real service port (avoids conflicts with Docker containers)
process.env.PORT = '0';
