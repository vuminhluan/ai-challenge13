import { createSdk, describeError } from './shared.js';

async function main(): Promise<void> {
  const sdk = createSdk();

  console.log('1. Gửi một claim hợp lệ');
  const claim = await sdk.claims.create({
    policyId: 'POL-123',
    claimType: 'OUTPATIENT',
    diagnosisCode: 'J06.9',
    treatmentDate: '2024-03-15',
    amount: 15000,
    currency: 'THB',
  });
  console.log(`   Đã tạo ${claim.id}, trạng thái ${claim.status}`);

  console.log('2. Đọc lại claim vừa tạo');
  const fetched = await sdk.claims.get(claim.id);
  console.log(`   ${fetched.id} hiện là ${fetched.status}`);

  console.log('3. Liệt kê claim đang chờ xử lý');
  const page = await sdk.claims.list({ status: 'PENDING', page: 1, pageSize: 5 });
  console.log(`   ${page.data.length}/${page.pagination.total} claim ở trang ${page.pagination.page}`);

  console.log('4. Thử gửi claim sai để xem validation phía client chặn lại');
  try {
    await sdk.claims.create({
      policyId: '',
      claimType: 'OUTPATIENT',
      diagnosisCode: 'sai-mã',
      treatmentDate: '2099-01-01',
      amount: -1,
      currency: 'XYZ',
    });
  } catch (error) {
    console.log(`   Bị chặn trước khi gọi API: ${describeError(error)}`);
  }
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
