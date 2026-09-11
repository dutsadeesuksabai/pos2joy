// Supabase Auth keys every account by email address, but restaurant staff sign
// in at a busy counter and should not have to type one. A username is mapped to
// a fixed synthetic address instead, so no second table has to hold the mapping
// and no lookup stands between the form and the sign-in call.
//
// ponytail: the domain is derived, not stored. Move to a username column on a
// profile table only if staff ever need to change a username while keeping the
// same login.
export const usernameDomain = (process.env.AUTH_USERNAME_DOMAIN ?? "pos2joy.local").toLowerCase();

// Deliberately narrow: lowercase letters, digits, and inner dot, dash or
// underscore. Anything outside this cannot reshape the address it builds.
const username = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
const email = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;

export class InvalidIdentifier extends Error {
  constructor() { super("Enter your username, or the work email address you were given."); }
}

// Accepts either a username or a full email so existing accounts keep working.
export function toLoginEmail(identifier: string): string {
  const value = identifier.trim().toLowerCase();
  if (value.includes("@")) {
    if (value.length > 254 || !email.test(value)) throw new InvalidIdentifier();
    return value;
  }
  if (!username.test(value)) throw new InvalidIdentifier();
  return `${value}@${usernameDomain}`;
}

// Staff should see the name they typed, not the address it was turned into.
export function displayIdentity(address: string | undefined): string {
  if (!address) return "";
  const suffix = `@${usernameDomain}`;
  return address.toLowerCase().endsWith(suffix) ? address.slice(0, -suffix.length) : address;
}
