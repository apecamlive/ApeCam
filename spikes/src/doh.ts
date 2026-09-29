import dns from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';

/**
 * Indonesian ISPs hijack DNS for *.robinhood.com (Internet Positif / internetsehatku), which breaks
 * TLS. For local spikes we resolve those hosts through Cloudflare DNS-over-HTTPS instead.
 * Railway (US region) is not affected; this is a local-development workaround only.
 */
const BLOCKED = /(^|\.)robinhood\.com$/;
const cache = new Map<string, string>();

async function resolveDoh(host: string): Promise<string> {
  const cached = cache.get(host);
  if (cached) return cached;
  const res = await fetch(`https://1.1.1.1/dns-query?name=${host}&type=A`, {
    headers: { accept: 'application/dns-json' },
  });
  const body = (await res.json()) as { Answer?: { type: number; data: string }[] };
  const ip = body.Answer?.find((a) => a.type === 1)?.data;
  if (!ip) throw new Error(`DoH: no A record for ${host}`);
  cache.set(host, ip);
  return ip;
}

type LookupCallback = (err: Error | null, address: string | dns.LookupAddress[], family?: number) => void;

export function enableDohForBlockedHosts() {
  setGlobalDispatcher(
    new Agent({
      connect: {
        lookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback) {
          if (!BLOCKED.test(hostname)) return dns.lookup(hostname, options, callback as never);
          resolveDoh(hostname).then(
            (ip) => (options.all ? callback(null, [{ address: ip, family: 4 }]) : callback(null, ip, 4)),
            (err: Error) => callback(err, ''),
          );
        },
      },
    }),
  );
}
