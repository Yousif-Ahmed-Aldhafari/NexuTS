export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH_MESSAGE =
  "Password must have 8–72 UTF-8 bytes, uppercase, lowercase, and a number or symbol.";

export function isStrongPassword(value: string): boolean {
  return (
    value.length >= MIN_PASSWORD_LENGTH &&
    new TextEncoder().encode(value).length <= MAX_PASSWORD_BYTES &&
    /[A-Z]/.test(value) &&
    /[a-z]/.test(value) &&
    /[^A-Za-z]/.test(value)
  );
}
