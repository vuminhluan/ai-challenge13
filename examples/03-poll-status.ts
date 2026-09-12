import { createSdk, describeError } from './shared.js';

async function main(): Promise<void> {
  const sdk = createSdk();

  const claim = await sdk.claims.create({
    policyId: 'POL-789',
    claimType: 'DENTAL',
    diagnosisCode: 'K02.1',
    treatmentDate: '2024-03-25',
    amount: 3200,
    currency: 'THB',
  });
  console.log(`Đang theo dõi ${claim.id}, bắt đầu ở ${claim.status}`);

  await new Promise<void>((resolve) => {
    const stop = sdk.claims.onStatusChange(
      claim.id,
      (status, updated) => {
        console.log(`   ${new Date().toISOString()}  ${claim.id} chuyển sang ${status}`);
        if (status === 'APPROVED' || status === 'REJECTED') {
          console.log(`   Lịch sử: ${updated.statusHistory.map((entry) => entry.status).join(' → ')}`);
          stop();
          resolve();
        }
      },
      {
        intervalMs: 1000,
        initialStatus: claim.status,
        maxDurationMs: 60_000,
        onError: (error) => console.warn(`   Lỗi khi poll, sẽ thử lại: ${describeError(error)}`),
      },
    );
  });

  console.log('Đã có quyết định cuối, watcher đã dừng và script thoát.');
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
