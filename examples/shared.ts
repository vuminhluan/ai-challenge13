import { ApiError, AuthError, InsuranceSDK, NetworkError, ValidationError } from '@insurance/sdk';

/** Builds an SDK pointed at the mock server running locally. */
export function createSdk(): InsuranceSDK {
  return new InsuranceSDK({
    apiKey: process.env.INSURANCE_API_KEY ?? 'pk_test_demo',
    environment: 'sandbox',
    baseUrl: process.env.INSURANCE_BASE_URL ?? 'http://localhost:4000',
    timeout: 30_000,
  });
}

/** Renders an error by type so the examples print something readable. */
export function describeError(error: unknown): string {
  if (error instanceof ValidationError) {
    return `ValidationError (${error.code}): ${JSON.stringify(error.fields)}`;
  }
  if (error instanceof AuthError) return `AuthError: ${error.reason}. Check the API key.`;
  if (error instanceof NetworkError) return `NetworkError after ${error.attempts} attempts: ${error.message}`;
  if (error instanceof ApiError) return `ApiError ${error.status} (${error.code}): ${error.message}`;
  return `Unknown error: ${String(error)}`;
}
