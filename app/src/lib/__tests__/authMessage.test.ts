import { authMessage } from '../authMessage';

it.each([
  ['Invalid login credentials', 'Wrong email or password.'],
  ['Email not confirmed', expect.stringMatching(/Confirm your email/)],
  ['User already registered', expect.stringMatching(/already exists/)],
  ['Password should be at least 6 characters', expect.stringMatching(/at least 6/)],
  ['Database error saving new user', expect.stringMatching(/invite-only/)],
  ['something odd', 'something odd'],
])('%s', (raw, out) => expect(authMessage(raw)).toEqual(out));
