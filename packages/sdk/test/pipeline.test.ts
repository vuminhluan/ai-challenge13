import { describe, expect, it } from 'vitest';
import { ApiError, AuthError, NetworkError, ValidationError } from '../src/errors.js';
import { RequestPipeline } from '../src/core/pipeline.js';
import { FakeClock, FakeTransport, jsonReply } from './helpers.js';

const TOKEN = jsonReply(200, { accessToken: 'jwt-1', tokenType: 'Bearer', expiresIn: 3600 });
const TOKEN_2 = jsonReply(200, { accessToken: 'jwt-2', tokenType: 'Bearer', expiresIn: 3600 });

const setup = (): { pipeline: RequestPipeline; transport: FakeTransport; clock: FakeClock } => {
  const transport = new FakeTransport();
  const clock = new FakeClock();
  const pipeline = new RequestPipeline({
    baseUrl: 'http://api.test',
    apiKey: 'pk_test_abc',
    timeoutMs: 30_000,
    maxRetries: 3,
    transport,
    clock,
    random: () => 0.5,
    defaultHeaders: { 'x-partner': 'acme' },
  });
  return { pipeline, transport, clock };
};

describe('RequestPipeline', () => {
  it('lấy token rồi gắn Authorization, default header và Idempotency-Key cho POST', async () => {
    const { pipeline, transport } = setup();
    transport.queue(TOKEN, jsonReply(201, { id: 'CLM-000001' }));

    const result = await pipeline.execute<{ id: string }>({ method: 'POST', path: '/api/v1/claims', body: { kind: 'json', value: { a: 1 } } });

    expect(result.id).toBe('CLM-000001');
    expect(transport.requests[0]?.url).toBe('http://api.test/api/v1/auth/token');
    const call = transport.requests[1];
    expect(call?.headers.authorization).toBe('Bearer jwt-1');
    expect(call?.headers['x-partner']).toBe('acme');
    expect(call?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('dựng đúng query string từ tham số list', async () => {
    const { pipeline, transport } = setup();
    transport.queue(TOKEN, jsonReply(200, { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } }));

    await pipeline.execute({ method: 'GET', path: '/api/v1/claims', query: { status: 'PENDING', page: 1, pageSize: undefined } });

    expect(transport.requests[1]?.url).toBe('http://api.test/api/v1/claims?status=PENDING&page=1');
  });

  it('gặp 503 thì thử lại và giữ nguyên Idempotency-Key', async () => {
    const { pipeline, transport, clock } = setup();
    transport.queue(TOKEN, jsonReply(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'bận' } }), jsonReply(201, { id: 'CLM-000002' }));

    const result = await pipeline.execute<{ id: string }>({ method: 'POST', path: '/api/v1/claims', body: { kind: 'json', value: {} } });

    expect(result.id).toBe('CLM-000002');
    expect(clock.sleeps).toEqual([125]);
    expect(transport.requests[1]?.headers['idempotency-key']).toBe(transport.requests[2]?.headers['idempotency-key']);
  });

  it('hết số lần thử thì ném ApiError kèm số lần đã thử', async () => {
    const { pipeline, transport, clock } = setup();
    const unavailable = (): ReturnType<typeof jsonReply> => jsonReply(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'bận' } });
    transport.queue(TOKEN, unavailable(), unavailable(), unavailable(), unavailable());

    await expect(pipeline.execute({ method: 'GET', path: '/api/v1/claims/CLM-1' })).rejects.toBeInstanceOf(ApiError);
    expect(clock.sleeps).toEqual([125, 250, 500]);
  });

  it('không thử lại với lỗi 400 và trả về ValidationError', async () => {
    const { pipeline, transport } = setup();
    transport.queue(TOKEN, jsonReply(400, { error: { code: 'VALIDATION_ERROR', message: 'sai', fields: { amount: 'must be positive' } } }));

    await expect(pipeline.execute({ method: 'POST', path: '/api/v1/claims', body: { kind: 'json', value: {} } })).rejects.toBeInstanceOf(ValidationError);
    expect(transport.requests).toHaveLength(2);
  });

  it('gặp 401 thì refresh token và gửi lại đúng một lần', async () => {
    const { pipeline, transport } = setup();
    transport.queue(TOKEN, jsonReply(401, { error: { code: 'TOKEN_EXPIRED', message: 'hết hạn' } }), TOKEN_2, jsonReply(200, { id: 'CLM-000003' }));

    const result = await pipeline.execute<{ id: string }>({ method: 'GET', path: '/api/v1/claims/CLM-000003' });

    expect(result.id).toBe('CLM-000003');
    expect(transport.requests[3]?.headers.authorization).toBe('Bearer jwt-2');
  });

  it('401 lần thứ hai thì ném AuthError', async () => {
    const { pipeline, transport } = setup();
    const expired = (): ReturnType<typeof jsonReply> => jsonReply(401, { error: { code: 'TOKEN_EXPIRED', message: 'hết hạn' } });
    transport.queue(TOKEN, expired(), TOKEN_2, expired());

    await expect(pipeline.execute({ method: 'GET', path: '/api/v1/claims/CLM-1' })).rejects.toBeInstanceOf(AuthError);
  });

  it('API key sai thì ném AuthError ngay, không thử lại', async () => {
    const { pipeline, transport } = setup();
    transport.queue(jsonReply(401, { error: { code: 'INVALID_API_KEY', message: 'sai key' } }));

    await expect(pipeline.execute({ method: 'GET', path: '/api/v1/claims' })).rejects.toMatchObject({ reason: 'invalid_api_key' });
    expect(transport.requests).toHaveLength(1);
  });

  it('lỗi mạng thì thử lại rồi ném NetworkError kèm attempts', async () => {
    const { pipeline, transport } = setup();
    transport.queue(
      TOKEN,
      new NetworkError('kết nối bị đóng', 1, 'ECONNRESET'),
      new NetworkError('kết nối bị đóng', 1, 'ECONNRESET'),
      new NetworkError('kết nối bị đóng', 1, 'ECONNRESET'),
      new NetworkError('kết nối bị đóng', 1, 'ECONNRESET'),
    );

    const error = await pipeline.execute({ method: 'GET', path: '/api/v1/claims' }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).attempts).toBe(4);
  });

  it('request đánh dấu retryable:false thì không thử lại dù gặp 503', async () => {
    const { pipeline, transport } = setup();
    transport.queue(TOKEN, jsonReply(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'bận' } }));

    await expect(
      pipeline.execute({ method: 'POST', path: '/api/v1/claims/CLM-1/documents', retryable: false, body: { kind: 'json', value: {} } }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(transport.requests).toHaveLength(2);
  });

  it('tôn trọng Retry-After của server', async () => {
    const { pipeline, transport, clock } = setup();
    transport.queue(TOKEN, jsonReply(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'bận' } }, { 'retry-after': '2' }), jsonReply(200, { ok: true }));

    await pipeline.execute({ method: 'GET', path: '/api/v1/claims' });

    expect(clock.sleeps).toEqual([2125]);
  });

  it('signal bị abort trong lúc chờ backoff thì dừng ngay', async () => {
    const { pipeline, transport } = setup();
    const controller = new AbortController();
    transport.queue(TOKEN, jsonReply(503, { error: { code: 'SERVICE_UNAVAILABLE', message: 'bận' } }));
    controller.abort();

    await expect(pipeline.execute({ method: 'GET', path: '/api/v1/claims', signal: controller.signal })).rejects.toBeDefined();
  });
});
