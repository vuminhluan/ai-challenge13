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
  console.log(`Watching ${claim.id}, starting at ${claim.status}`);

  await new Promise<void>((resolve) => {
    const stop = sdk.claims.onStatusChange(
      claim.id,
      (status, updated) => {
        console.log(`   ${new Date().toISOString()}  ${claim.id} moved to ${status}`);
        if (status === 'APPROVED' || status === 'REJECTED') {
          console.log(`   History: ${updated.statusHistory.map((entry) => entry.status).join(' -> ')}`);
          stop();
          resolve();
        }
      },
      {
        intervalMs: 1000,
        initialStatus: claim.status,
        maxDurationMs: 60_000,
        onError: (error) => console.warn(`   Polling failed, will retry: ${describeError(error)}`),
      },
    );
  });

  console.log('Final decision reached, the watcher stopped and the script exits.');
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
