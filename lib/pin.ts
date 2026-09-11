import bcrypt from "bcryptjs";

export const PIN_REGEX = /^\d{6}$/;

export function isValidPin(pin: string) {
  return PIN_REGEX.test(pin);
}

export async function hashPin(pin: string) {
  if (!isValidPin(pin)) throw new Error("PIN harus 6 digit angka");
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string) {
  return bcrypt.compare(pin, hash);
}
