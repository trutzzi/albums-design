import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A minimal HS256 JWT — deliberately hand-rolled rather than a dependency:
 * this app only ever needs to sign and verify its own tokens with one
 * symmetric secret, which is the entire feature set a JWT library gives you
 * on top of `crypto.createHmac`. The parts that make hand-rolled JWTs risky
 * elsewhere — algorithm confusion, accepting `alg: none`, non-constant-time
 * signature comparison — are exactly what this implementation refuses to do:
 * the algorithm is hardcoded, never read from the token, and the signature
 * check goes through `timingSafeEqual`.
 */

export interface JwtPayload {
  sub: string;
  [key: string]: unknown;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signJwt(payload: JwtPayload, secret: string, expiresInSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64url(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSeconds }));
  const signature = sign(`${header}.${body}`, secret);
  return `${header}.${body}.${signature}`;
}

export function verifyJwt(token: string, secret: string): JwtPayload | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) return undefined;
  const [header, body, signature] = parts as [string, string, string];

  const expected = sign(`${header}.${body}`, secret);
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return undefined;

  let payload: JwtPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }

  const exp = payload["exp"];
  if (typeof exp === "number" && Math.floor(Date.now() / 1000) >= exp) return undefined;

  return payload;
}
