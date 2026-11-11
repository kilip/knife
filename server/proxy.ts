/**
 * Proxy and IP validation utilities.
 * Handles IPv4 and IPv6 validation and CIDR matching for trusted reverse proxies.
 */

export function isValidIp(ip: string): boolean {
  return isValidIpv4(ip) || isValidIpv6(ip);
}

export function isValidIpv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return false;
    const num = Number(part);
    if (num < 0 || num > 255 || (part.length > 1 && part.startsWith("0"))) {
      return false;
    }
  }
  return true;
}

export function isValidIpv6(ip: string): boolean {
  if (ip.toLowerCase().startsWith("::ffff:")) {
    const mappedIpv4 = ip.slice("::ffff:".length);
    return isValidIpv4(mappedIpv4);
  }

  // Standard IPv6 regex check
  const ipv6Regex =
    /^(([0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,7}:|([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4}|([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2}|([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3}|([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4}|([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5}|[0-9a-f]{1,4}:((:[0-9a-f]{1,4}){1,6})|:((:[0-9a-f]{1,4}){1,7}|:))$/i;
  return ipv6Regex.test(ip);
}

/**
 * Convert IPv4 address to 32-bit unsigned integer
 */
function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0);
}

/**
 * Check if an IPv4 address is in a CIDR range (e.g. 10.0.0.0/8 or 127.0.0.1)
 */
function matchIpv4Cidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) {
    return ip === cidr;
  }
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  if (isNaN(bits) || bits < 0 || bits > 32 || !isValidIpv4(range)) {
    return false;
  }
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : ~((1 << (32 - bits)) - 1) >>> 0;
  const ipNum = ipv4ToNumber(ip);
  const rangeNum = ipv4ToNumber(range);
  return (ipNum & mask) === (rangeNum & mask);
}

/**
 * Check if an IPv6 or IPv4 address matches a trusted proxy spec (single IP or CIDR)
 */
export function isIpTrusted(ip: string, trustedProxies: string[]): boolean {
  // Normalize IPv4-mapped IPv6
  let normalizedIp = ip;
  if (normalizedIp.startsWith("::ffff:")) {
    normalizedIp = normalizedIp.replace(/^::ffff:/, "");
  }

  for (const proxy of trustedProxies) {
    let normalizedProxy = proxy;
    if (normalizedProxy.startsWith("::ffff:")) {
      normalizedProxy = normalizedProxy.replace(/^::ffff:/, "");
    }

    if (normalizedIp === normalizedProxy) {
      return true;
    }

    if (
      isValidIpv4(normalizedIp) &&
      (normalizedProxy.includes("/") || isValidIpv4(normalizedProxy))
    ) {
      if (matchIpv4Cidr(normalizedIp, normalizedProxy)) {
        return true;
      }
    }

    // Direct loopback checks
    if (
      (normalizedIp === "::1" || normalizedIp === "127.0.0.1") &&
      (normalizedProxy === "::1" ||
        normalizedProxy === "127.0.0.1" ||
        normalizedProxy === "localhost")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Resolve client IP, respecting X-Forwarded-For ONLY if direct peer is trusted
 */
export function getClientIp(directIp: string, headers: Headers, trustedProxies: string[]): string {
  if (!isIpTrusted(directIp, trustedProxies)) {
    return directIp;
  }

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const ips = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ips.length > 0 && isValidIp(ips[0])) {
      return ips[0];
    }
  }

  const xRealIp = headers.get("x-real-ip");
  if (xRealIp && isValidIp(xRealIp.trim())) {
    return xRealIp.trim();
  }

  return directIp;
}
