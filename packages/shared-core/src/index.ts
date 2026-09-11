export * from "./schema";
export * from "./db";
export * from "./sync";

// Re-export PIN helper from web for consistency (native can import from here or lib/pin)
export const PIN_REGEX = /^\d{6}$/;
export const isValidPin = (pin: string) => PIN_REGEX.test(pin);
