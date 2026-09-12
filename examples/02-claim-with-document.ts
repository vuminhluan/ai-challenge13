import { fileURLToPath } from 'node:url';
import { createSdk, describeError } from './shared.js';

const RECEIPT = fileURLToPath(new URL('./fixtures/receipt.pdf', import.meta.url));

function renderBar(percent: number): string {
  const filled = Math.round(percent / 5);
  return `[${'#'.repeat(filled)}${'.'.repeat(20 - filled)}] ${String(percent).padStart(3)}%`;
}

async function main(): Promise<void> {
  const sdk = createSdk();

  const claim = await sdk.claims.create({
    policyId: 'POL-456',
    claimType: 'INPATIENT',
    diagnosisCode: 'A09',
    treatmentDate: '2024-03-20',
    amount: 48000,
    currency: 'THB',
  });
  console.log(`Đã tạo ${claim.id}`);

  const doc = await sdk.documents.upload(claim.id, RECEIPT, {
    type: 'medical_receipt',
    onProgress: (percent, detail) => {
      process.stdout.write(`\r   ${renderBar(percent)}  ${detail.bytesSent}/${detail.totalBytes} byte`);
    },
  });
  process.stdout.write('\n');
  console.log(`Đã upload ${doc.id} (${doc.filename}, ${doc.size} byte)`);

  const docs = await sdk.documents.list(claim.id);
  console.log(`Claim ${claim.id} hiện có ${docs.length} tài liệu`);
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
