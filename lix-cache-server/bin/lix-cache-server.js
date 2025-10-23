#!/usr/bin/env node

import { spawn } from 'child_process';
import { platform } from 'os';

const CONTAINER_NAME = 'lix-cache-dev';
const IMAGE_NAME = 'ghcr.io/taylorpreston/lix-cache:latest';
const DEFAULT_PORT = process.env.LIX_CACHE_PORT || '4000';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function checkDocker() {
  return new Promise((resolve) => {
    const docker = spawn('docker', ['--version']);
    docker.on('close', (code) => {
      resolve(code === 0);
    });
    docker.on('error', () => {
      resolve(false);
    });
  });
}

async function checkImageExists() {
  return new Promise((resolve) => {
    const docker = spawn('docker', ['image', 'inspect', IMAGE_NAME]);
    docker.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

async function pullImage() {
  return new Promise((resolve, reject) => {
    log(`📦 Pulling ${IMAGE_NAME}...`, colors.blue);
    const docker = spawn('docker', ['pull', IMAGE_NAME], { stdio: 'inherit' });
    docker.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error('Failed to pull Docker image'));
      }
    });
  });
}

async function stopExistingContainer() {
  return new Promise((resolve) => {
    const docker = spawn('docker', ['stop', CONTAINER_NAME]);
    docker.on('close', () => {
      // Try to remove the container
      const removeDocker = spawn('docker', ['rm', CONTAINER_NAME]);
      removeDocker.on('close', () => resolve());
    });
  });
}

async function startContainer() {
  await stopExistingContainer();

  log(`🚀 Starting Lix Cache server on port ${DEFAULT_PORT}...`, colors.green);
  log(`   Container name: ${CONTAINER_NAME}`, colors.blue);
  log(`   URL: http://localhost:${DEFAULT_PORT}`, colors.bright);
  log('', colors.reset);
  log('Press Ctrl+C to stop the server', colors.yellow);
  log('', colors.reset);

  const docker = spawn(
    'docker',
    [
      'run',
      '--rm',
      '--name', CONTAINER_NAME,
      '-p', `${DEFAULT_PORT}:4000`,
      '-e', 'PORT=4000',
      IMAGE_NAME,
    ],
    { stdio: 'inherit' }
  );

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    log('\n\n🛑 Stopping Lix Cache server...', colors.yellow);
    docker.kill('SIGTERM');
  });

  process.on('SIGTERM', () => {
    docker.kill('SIGTERM');
  });

  docker.on('close', (code) => {
    if (code !== 0 && code !== null) {
      log(`\n❌ Server exited with code ${code}`, colors.red);
      process.exit(code);
    }
    process.exit(0);
  });
}

async function main() {
  log('', colors.reset);
  log('╔════════════════════════════════════╗', colors.blue);
  log('║     Lix Cache Development Server   ║', colors.blue);
  log('╚════════════════════════════════════╝', colors.blue);
  log('', colors.reset);

  // Check if Docker is installed
  const hasDocker = await checkDocker();
  if (!hasDocker) {
    log('❌ Docker is not installed or not running', colors.red);
    log('', colors.reset);
    log('Please install Docker to use lix-cache-server:', colors.yellow);
    log('  https://docs.docker.com/get-docker/', colors.blue);
    log('', colors.reset);
    log('Alternatively, you can run the Elixir backend directly:', colors.yellow);
    log('  cd lix_cache_api && mix deps.get && iex -S mix', colors.blue);
    process.exit(1);
  }

  // Check if image exists locally
  const imageExists = await checkImageExists();
  if (!imageExists) {
    log('⚠️  Docker image not found locally', colors.yellow);
    try {
      await pullImage();
      log('✅ Image pulled successfully', colors.green);
      log('', colors.reset);
    } catch (error) {
      log('❌ Failed to pull image', colors.red);
      log('', colors.reset);
      log('You may need to build the image locally:', colors.yellow);
      log('  cd lix_cache_api && docker build -t ghcr.io/taylorpreston/lix-cache:latest .', colors.blue);
      process.exit(1);
    }
  }

  // Start the container
  try {
    await startContainer();
  } catch (error) {
    log(`\n❌ Error: ${error.message}`, colors.red);
    process.exit(1);
  }
}

main();
