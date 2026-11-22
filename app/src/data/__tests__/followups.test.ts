// Backend #36 follow-ups: barcode_limit wording and consent withdrawal in mock mode.
import { BARCODE_LIMIT_TEXT, offerLabel } from '../foods';
import { getProfile, updateProfile, withdrawScanConsent } from '../profile';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

it('offers the label photo when the daily barcode limit is hit', () => {
  expect(offerLabel('barcode_limit')).toBe(true);
  expect(offerLabel('off_unavailable')).toBe(false);
  expect(BARCODE_LIMIT_TEXT).toMatch(/try tomorrow or photograph the label/);
});

it('withdrawing consent turns it off (device store in mock mode)', async () => {
  await updateProfile({ scan_consent: true });
  expect((await getProfile()).scan_consent).toBe(true);
  expect(await withdrawScanConsent()).toBe(0);
  expect((await getProfile()).scan_consent).toBe(false);
});
