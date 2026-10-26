import { isIPv6 } from "node:net";

/**
 * What a per-address rate limit should count by. IPv4 addresses as they are. IPv6 by its
 * /64 network: one connection is usually handed a whole /64, so counting single addresses
 * would let one sender rotate through millions of them. An IPv4 address written as IPv6
 * (`::ffff:203.0.113.7`) counts as the IPv4 address.
 */
export function addressKey(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (!isIPv6(ip)) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...front, ...Array(8 - front.length - back.length).fill("0"), ...back] : front;
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}
