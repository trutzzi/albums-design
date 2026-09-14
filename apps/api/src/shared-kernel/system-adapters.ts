import { randomUUID } from "node:crypto";
import type { Clock, IdGenerator } from "./ports";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class CryptoIdGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
