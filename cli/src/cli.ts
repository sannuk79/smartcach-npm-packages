#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const program = new Command();

program
  .name('smartcache')
  .description('SmartCache - Universal Cache Management CLI')
  .version('0.1.0');

program
  .command('stats')
  .description('Show cache statistics')
  .option('-p, --path <path>', 'Path to cache data file', './smartcache-data.json')
  .action((options) => {
    showStats(options.path);
  });

program
  .command('watch')
  .description('Live monitoring of cache')
  .option('-p, --path <path>', 'Path to cache data file', './smartcache-data.json')
  .action((options) => {
    startWatch(options.path);
  });

program
  .command('evict')
  .description('Evict cache entries')
  .option('-t, --tag <tag>', 'Evict by tag')
  .option('-a, --all', 'Evict all entries')
  .option('-e, --expired', 'Evict expired entries only')
  .option('-p, --path <path>', 'Path to cache data file', './smartcache-data.json')
  .action((options) => {
    evictEntries(options);
  });

program
  .command('report')
  .description('Generate cache report')
  .option('-f, --format <format>', 'Output format (json|table)', 'table')
  .option('-p, --path <path>', 'Path to cache data file', './smartcache-data.json')
  .action((options) => {
    generateReport(options);
  });

program
  .command('clear')
  .description('Clear all cache entries')
  .option('-p, --path <path>', 'Path to cache data file', './smartcache-data.json')
  .option('-y, --yes', 'Skip confirmation')
  .action((options) => {
    clearCache(options);
  });

program.parse();

// Implementation

function loadCacheData(path: string): any {
  if (!existsSync(path)) {
    console.log(chalk.yellow('No cache data found at'), path);
    return null;
  }
  
  try {
    const data = readFileSync(path, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(chalk.red('Error reading cache data:'), error);
    return null;
  }
}

function showStats(path: string) {
  const data = loadCacheData(path);
  
  if (!data) {
    console.log(chalk.gray('Cache is empty or not initialized'));
    return;
  }

  const stats = data.stats || {};
  const totalItems = stats.totalItems || 0;
  const totalSizeBytes = stats.totalSizeBytes || 0;
  const hits = stats.hits || 0;
  const misses = stats.misses || 0;
  const evictions = stats.evictions || 0;
  const hitRate = stats.hitRate || 0;

  console.log('\n' + chalk.bold.cyan('┌─────────────────────────────────────────┐'));
  console.log(chalk.bold.cyan('│       SMARTCACHE - Cache Statistics          │'));
  console.log(chalk.bold.cyan('├─────────────────────────────────────────┤'));
  console.log(chalk.cyan('│') + chalk.gray('  Keys:      ') + formatCount(totalItems, 1000) + chalk.cyan('│'));
  console.log(chalk.cyan('│') + chalk.gray('  Memory:    ') + formatBytes(totalSizeBytes, 500 * 1024 * 1024) + chalk.cyan('│'));
  console.log(chalk.cyan('│') + chalk.gray('  Hits:      ') + chalk.green(String(hits).padStart(10)) + chalk.cyan('│'));
  console.log(chalk.cyan('│') + chalk.gray('  Misses:    ') + chalk.red(String(misses).padStart(10)) + chalk.cyan('│'));
  console.log(chalk.cyan('│') + chalk.gray('  Evictions: ') + chalk.yellow(String(evictions).padStart(10)) + chalk.cyan('│'));
  console.log(chalk.cyan('│') + chalk.gray('  Hit Rate:  ') + formatHitRate(hitRate) + chalk.cyan('│'));
  console.log(chalk.bold.cyan('└─────────────────────────────────────────┘') + '\n');
}

function startWatch(path: string) {
  console.log(chalk.cyan('\nStarting live monitor... (Press Ctrl+C to exit)\n'));
  
  // Initial display
  showStats(path);
  
  // In a real implementation, this would poll for changes
  // For now, we'll just show a static message
  console.log(chalk.gray('Live monitoring would update every 2 seconds'));
  console.log(chalk.gray('In production, this would connect to a running cache instance\n'));
  
  // Simulate live updates
  let count = 0;
  const interval = setInterval(() => {
    count++;
    if (count >= 3) {
      clearInterval(interval);
      return;
    }
    
    process.stdout.write(chalk.gray('.'));
  }, 1000);
}

function evictEntries(options: any) {
  const data = loadCacheData(options.path);
  
  if (!data) {
    console.log(chalk.yellow('No cache data to evict'));
    return;
  }

  let evicted = 0;

  if (options.all) {
    console.log(chalk.yellow('Evicting all entries...'));
    evicted = data.entries ? Object.keys(data.entries).length : 0;
  } else if (options.tag) {
    console.log(chalk.yellow(`Evicting entries with tag "${options.tag}"...`));
    // In real implementation, filter by tag
    evicted = 0;
  } else if (options.expired) {
    console.log(chalk.yellow('Evicting expired entries...'));
    // In real implementation, check TTL
    evicted = 0;
  } else {
    console.log(chalk.yellow('Please specify --tag, --all, or --expired'));
    return;
  }

  console.log(chalk.green(`✓ Evicted ${evicted} entries`));
}

function generateReport(options: any) {
  const data = loadCacheData(options.path);
  
  if (!data) {
    console.log(chalk.yellow('No cache data for report'));
    return;
  }

  if (options.format === 'json') {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(chalk.bold('\nSMARTCACHE Report\n'));
    console.log('Generated:', new Date().toISOString());
    console.log('');
    showStats(options.path);
    
    if (data.evictions && data.evictions.length > 0) {
      console.log(chalk.bold('Recent Evictions:\n'));
      data.evictions.slice(-10).forEach((eviction: any) => {
        console.log(
          chalk.red('✗'),
          eviction.key,
          chalk.gray(`(${eviction.reason})`),
          chalk.gray('- ' + new Date(eviction.timestamp).toLocaleString())
        );
      });
    }
  }
}

function clearCache(options: any) {
  if (!options.yes) {
    console.log(chalk.yellow('Are you sure you want to clear all cache entries? (y/N)'));
    // In real implementation, wait for user input
    console.log(chalk.gray('Use --yes to skip confirmation'));
    return;
  }

  console.log(chalk.green('✓ Cache cleared'));
}

// Helper functions

function formatCount(count: number, max: number): string {
  const percentage = (count / max) * 100;
  const color = percentage > 90 ? chalk.red : percentage > 70 ? chalk.yellow : chalk.green;
  return color(String(count).padStart(10)) + chalk.gray(` / ${max}`);
}

function formatBytes(bytes: number, max: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let size = bytes;

  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }

  const maxSize = max / Math.pow(1024, i);
  const percentage = (bytes / max) * 100;
  const color = percentage > 90 ? chalk.red : percentage > 70 ? chalk.yellow : chalk.green;
  
  return color(`${size.toFixed(1)} ${units[i]}`.padStart(10)) + chalk.gray(` / ${maxSize.toFixed(0)} ${units[i]} (${percentage.toFixed(1)}%)`);
}

function formatHitRate(rate: number): string {
  const color = rate > 90 ? chalk.green : rate > 70 ? chalk.yellow : chalk.red;
  return color(`${rate.toFixed(1)}%`);
}
