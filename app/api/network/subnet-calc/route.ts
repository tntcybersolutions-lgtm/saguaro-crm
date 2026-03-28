import { NextRequest } from 'next/server';
import { ok, badRequest, serverError } from '@/lib/api-response';

/**
 * POST /api/network/subnet-calc
 * Pure calculation, no DB. Takes { cidr: "192.168.10.0/24" }
 * Returns subnet details.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cidr } = body;

    if (!cidr) return badRequest('cidr is required (e.g. "192.168.10.0/24")');

    const match = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
    if (!match) return badRequest('Invalid CIDR format');

    const octets = [+match[1], +match[2], +match[3], +match[4]];
    const prefix = +match[5];

    if (octets.some((o) => o < 0 || o > 255)) return badRequest('Invalid IP octets');
    if (prefix < 0 || prefix > 32) return badRequest('Prefix must be 0-32');

    // Convert IP to 32-bit number
    const ipToNum = (parts: number[]) =>
      ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;

    const numToIp = (num: number) =>
      `${(num >>> 24) & 255}.${(num >>> 16) & 255}.${(num >>> 8) & 255}.${num & 255}`;

    const numToBinary = (num: number) => {
      const parts: string[] = [];
      for (let i = 3; i >= 0; i--) {
        parts.push(((num >>> (i * 8)) & 255).toString(2).padStart(8, '0'));
      }
      return parts.join('.');
    };

    // Calculate subnet mask
    const maskNum = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
    const wildcardNum = (~maskNum) >>> 0;

    const ipNum = ipToNum(octets);
    const networkNum = (ipNum & maskNum) >>> 0;
    const broadcastNum = (networkNum | wildcardNum) >>> 0;

    const totalHosts = Math.pow(2, 32 - prefix);
    const usableHosts = prefix >= 31 ? totalHosts : totalHosts - 2;

    // Gateway is typically first usable IP
    const gatewayNum = prefix >= 31 ? networkNum : networkNum + 1;
    const usableStartNum = prefix >= 31 ? networkNum : networkNum + 1;
    const usableEndNum = prefix >= 31 ? broadcastNum : broadcastNum - 1;

    return ok({
      network: numToIp(networkNum),
      broadcast: numToIp(broadcastNum),
      gateway: numToIp(gatewayNum),
      subnetMask: numToIp(maskNum),
      usableStart: numToIp(usableStartNum),
      usableEnd: numToIp(usableEndNum),
      totalHosts,
      usableHosts,
      wildcardMask: numToIp(wildcardNum),
      binaryMask: numToBinary(maskNum),
      cidr,
      prefix,
    });
  } catch (err) {
    return serverError(err);
  }
}
