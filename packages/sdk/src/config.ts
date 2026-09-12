import { ValidationError } from './errors.js';
import type { InsuranceSDKConfig, Logger } from './types.js';

/** Default URL per environment. */
export const ENVIRONMENT_BASE_URLS: Record<'sandbox' | 'production', string> = {
  sandbox: 'http://localhost:4000',
  production: 'https://api.insurance.example.com',
};

/** Configuration with every default filled in. */
export interface ResolvedConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  defaultHeaders: Record<string, string>;
  logger: Logger | undefined;
}

/** Validates and normalises the configuration supplied by the partner. */
export function resolveConfig(config: InsuranceSDKConfig): ResolvedConfig {
  const fields: Record<string, string> = {};
  if (typeof config.apiKey !== 'string' || config.apiKey === '') fields.apiKey = 'required';

  const timeout = config.timeout ?? 30_000;
  if (!Number.isFinite(timeout) || timeout <= 0) fields.timeout = 'must be a positive number of milliseconds';

  const maxRetries = config.maxRetries ?? 3;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) fields.maxRetries = 'must be an integer greater than or equal to 0';

  if (Object.keys(fields).length > 0) {
    throw new ValidationError('Invalid SDK configuration', fields, 'CLIENT_VALIDATION');
  }

  const baseUrl = config.baseUrl ?? ENVIRONMENT_BASE_URLS[config.environment ?? 'sandbox'];

  return {
    apiKey: config.apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    timeout,
    maxRetries,
    defaultHeaders: config.defaultHeaders ?? {},
    logger: config.logger,
  };
}
