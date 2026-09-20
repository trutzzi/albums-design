import { randomInt } from "node:crypto";

/** No 0/O, 1/I/L — a password read off a phone and typed on another must not be ambiguous. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const GROUP = 5;

/** e.g. `K7M2Q-X9PTA`: 10 characters (~50 bits), in two groups so it is easy to read out and type. */
export function generateAccessPassword(): string {
  const pick = () => Array.from({ length: GROUP }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

/** Case, dashes and spaces do not matter when typing it in. */
export function normalizeAccessPassword(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
