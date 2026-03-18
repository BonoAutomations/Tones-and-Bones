import dotenv from 'dotenv';
import path from 'path';
import { BotConfig } from './types';

dotenv.config({ path: path.join(process.cwd(), '.env') });

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const num = parseFloat(value);
  if (isNaN(num)) throw new Error(`Invalid number for env var ${key}: "${value}"`);
  return num;
}

function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export function loadConfig(): BotConfig {
  return {
    symbol: getEnv('TRADING_PAIR', 'BTC/USDT'),
    baseCurrency: getEnv('BASE_CURRENCY', 'USDT'),
    quoteCurrency: getEnv('QUOTE_CURRENCY', 'BTC'),
    dryRun: getEnvBool('DRY_RUN', true),
    pollIntervalMs: getEnvNumber('POLL_INTERVAL_MS', 60000),

    exchange: {
      name: getEnv('EXCHANGE', 'mock'),
      apiKey: process.env.EXCHANGE_API_KEY,
      apiSecret: process.env.EXCHANGE_API_SECRET,
      testnet: getEnvBool('EXCHANGE_TESTNET', true),
    },

    strategy: {
      name: getEnv('STRATEGY', 'moving_average'),
      params: {
        // Moving Average params
        fastPeriod: getEnvNumber('MA_FAST_PERIOD', 9),
        slowPeriod: getEnvNumber('MA_SLOW_PERIOD', 21),
        signalPeriod: getEnvNumber('MA_SIGNAL_PERIOD', 5),

        // RSI params
        period: getEnvNumber('RSI_PERIOD', 14),
        overbought: getEnvNumber('RSI_OVERBOUGHT', 70),
        oversold: getEnvNumber('RSI_OVERSOLD', 30),

        // Combined strategy
        minAgreement: 2,
      },
    },

    risk: {
      maxPositionSizePercent: getEnvNumber('MAX_POSITION_SIZE', 0.1),
      maxDailyLossPercent: getEnvNumber('MAX_DAILY_LOSS', 0.05),
      stopLossPercent: getEnvNumber('STOP_LOSS_PERCENT', 0.02),
      takeProfitPercent: getEnvNumber('TAKE_PROFIT_PERCENT', 0.04),
      maxOpenPositions: getEnvNumber('MAX_OPEN_POSITIONS', 3),
    },

    circuitBreaker: {
      failureThreshold: getEnvNumber('CIRCUIT_BREAKER_THRESHOLD', 5),
      successThreshold: 2,
      timeoutMs: getEnvNumber('CIRCUIT_BREAKER_TIMEOUT_MS', 60000),
    },
  };
}
