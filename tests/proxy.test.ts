import { describe, it, expect } from "bun:test";
import { isValidIpv4, isValidIpv6, isIpTrusted, getClientIp } from "../server/proxy";

describe("Proxy & IP Verification", () => {
  it("validates IPv4 addresses accurately", () => {
    expect(isValidIpv4("127.0.0.1")).toBe(true);
    expect(isValidIpv4("10.0.0.1")).toBe(true);
    expect(isValidIpv4("255.255.255.255")).toBe(true);

    expect(isValidIpv4("256.0.0.1")).toBe(false);
    expect(isValidIpv4("1.2.3")).toBe(false);
    expect(isValidIpv4("1.2.3.4.5")).toBe(false);
    expect(isValidIpv4("abc.def.ghi.jkl")).toBe(false);
  });

  it("validates IPv6 addresses accurately", () => {
    expect(isValidIpv6("::1")).toBe(true);
    expect(isValidIpv6("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(true);
    expect(isValidIpv6("fe80::1")).toBe(true);
    expect(isValidIpv6("::ffff:192.0.2.128")).toBe(true);

    expect(isValidIpv6("127.0.0.1")).toBe(false);
    expect(isValidIpv6("::1::1")).toBe(false);
  });

  it("checks trusted proxies with CIDRs", () => {
    const trusted = ["127.0.0.1", "::1", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];

    expect(isIpTrusted("127.0.0.1", trusted)).toBe(true);
    expect(isIpTrusted("::1", trusted)).toBe(true);
    expect(isIpTrusted("10.50.1.2", trusted)).toBe(true);
    expect(isIpTrusted("172.16.5.1", trusted)).toBe(true);
    expect(isIpTrusted("192.168.1.100", trusted)).toBe(true);

    // Public / untrusted IPs
    expect(isIpTrusted("8.8.8.8", trusted)).toBe(false);
    expect(isIpTrusted("1.1.1.1", trusted)).toBe(false);
    expect(isIpTrusted("172.32.0.1", trusted)).toBe(false);
  });

  it("respects X-Forwarded-For ONLY when peer IP is trusted", () => {
    const trusted = ["127.0.0.1"];
    const headers = new Headers();
    headers.set("x-forwarded-for", "203.0.113.195, 127.0.0.1");

    // Case 1: Direct peer is trusted (127.0.0.1) -> trust XFF
    const clientIpFromTrusted = getClientIp("127.0.0.1", headers, trusted);
    expect(clientIpFromTrusted).toBe("203.0.113.195");

    // Case 2: Direct peer is untrusted (198.51.100.5) -> ignore XFF!
    const clientIpFromUntrusted = getClientIp("198.51.100.5", headers, trusted);
    expect(clientIpFromUntrusted).toBe("198.51.100.5");
  });
});
