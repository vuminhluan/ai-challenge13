import { ApiError, AuthError, InsuranceSDK, NetworkError, ValidationError } from '@insurance/sdk';

/** Tạo SDK trỏ tới mock server đang chạy ở local. */
export function createSdk(): InsuranceSDK {
  return new InsuranceSDK({
    apiKey: process.env.INSURANCE_API_KEY ?? 'pk_test_demo',
    environment: 'sandbox',
    baseUrl: process.env.INSURANCE_BASE_URL ?? 'http://localhost:4000',
    timeout: 30_000,
  });
}

/** Diễn giải lỗi theo từng loại để example in ra cho dễ hiểu. */
export function describeError(error: unknown): string {
  if (error instanceof ValidationError) {
    return `ValidationError (${error.code}): ${JSON.stringify(error.fields)}`;
  }
  if (error instanceof AuthError) return `AuthError: ${error.reason}. Kiểm tra lại API key.`;
  if (error instanceof NetworkError) return `NetworkError sau ${error.attempts} lần thử: ${error.message}`;
  if (error instanceof ApiError) return `ApiError ${error.status} (${error.code}): ${error.message}`;
  return `Lỗi không xác định: ${String(error)}`;
}
