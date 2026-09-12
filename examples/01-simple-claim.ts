import { createSdk, describeError } from './shared.js';

async function main(): Promise<void> {
  const sdk = createSdk();

  console.log('1. Submit a valid claim');
  const claim = await sdk.claims.create({
    policyId: 'POL-123',
    claimType: 'OUTPATIENT',
    diagnosisCode: 'J06.9',
    treatmentDate: '2024-03-15',
    amount: 15000,
    currency: 'THB',
  });
  console.log(`   Created ${claim.id} with status ${claim.status}`);

  console.log('2. Read the claim back');
  const fetched = await sdk.claims.get(claim.id);
  console.log(`   ${fetched.id} is now ${fetched.status}`);

  console.log('3. List claims awaiting review');
  const page = await sdk.claims.list({ status: 'PENDING', page: 1, pageSize: 5 });
  console.log(`   ${page.data.length} of ${page.pagination.total} claims on page ${page.pagination.page}`);

  console.log('4. Submit an invalid claim to see client-side validation reject it');
  try {
    await sdk.claims.create({
      policyId: '',
      claimType: 'OUTPATIENT',
      diagnosisCode: 'not-a-code',
      treatmentDate: '2099-01-01',
      amount: -1,
      currency: 'XYZ',
    });
  } catch (error) {
    console.log(`   Rejected before any API call: ${describeError(error)}`);
  }
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
