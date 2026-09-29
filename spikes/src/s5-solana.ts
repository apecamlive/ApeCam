/**
 * Spike S5 — Solana balances (ADR 005).
 * Answers: do pump.fun tokens use SPL Token or Token-2022? can we sum a wallet's balance for a mint
 * across both programs and multiple token accounts using plain JSON-RPC?
 */
const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

let calls = 0;
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  calls++;
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const body = (await res.json()) as { result?: T; error?: { message: string } };
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result as T;
}

type ParsedTokenAccount = {
  pubkey: string;
  account: {
    data: {
      parsed: { info: { mint: string; owner: string; tokenAmount: { amount: string; decimals: number } } };
    };
  };
};

/** Balance of `mint` held by `owner`, summed over every token account in both token programs. */
export async function getSolanaBalance(owner: string, mint: string) {
  const perProgram = await Promise.all(
    [TOKEN, TOKEN_2022].map((programId) =>
      rpc<{ value: ParsedTokenAccount[] }>('getTokenAccountsByOwner', [
        owner,
        { programId },
        { encoding: 'jsonParsed' },
      ]),
    ),
  );
  const accounts = perProgram.flatMap((r) => r.value).filter((a) => a.account.data.parsed.info.mint === mint);
  const raw = accounts.reduce((sum, a) => sum + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n);
  const decimals = accounts[0]?.account.data.parsed.info.tokenAmount.decimals;
  return { raw, decimals, accounts: accounts.length };
}

async function programOf(mint: string) {
  const info = await rpc<{ value: { owner: string } | null }>('getAccountInfo', [
    mint,
    { encoding: 'base64' },
  ]);
  return info.value?.owner === TOKEN_2022
    ? 'Token-2022'
    : info.value?.owner === TOKEN
      ? 'SPL Token'
      : info.value?.owner;
}

async function holderOf(mint: string) {
  // getTokenLargestAccounts is heavily rate-limited on the public RPC; read a holder from a recent trade instead.
  const sigs = await rpc<{ signature: string }[]>('getSignaturesForAddress', [mint, { limit: 10 }]);
  for (const { signature } of sigs) {
    const tx = await rpc<{
      meta: { postTokenBalances: { mint: string; owner: string; uiTokenAmount: { amount: string } }[] };
    } | null>('getTransaction', [signature, { maxSupportedTransactionVersion: 0, encoding: 'json' }]);
    const holder = tx?.meta.postTokenBalances.find((b) => b.mint === mint && b.uiTokenAmount.amount !== '0');
    if (holder) return holder.owner;
  }
  throw new Error('no holder found in recent transactions');
}

async function main() {
  // Newest pump.fun tokens from DexScreener + one classic SPL token (BONK) as control.
  const profiles = (await (await fetch('https://api.dexscreener.com/token-profiles/latest/v1')).json()) as {
    chainId: string;
    tokenAddress: string;
  }[];
  const pumpMints = profiles
    .filter((p) => p.chainId === 'solana' && p.tokenAddress.endsWith('pump'))
    .map((p) => p.tokenAddress)
    .slice(0, 5);
  const mints = [...pumpMints, 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'];

  const programs: Record<string, number> = {};
  for (const mint of mints) {
    const program = await programOf(mint);
    programs[String(program)] = (programs[String(program)] ?? 0) + 1;
    console.log(`${mint.slice(0, 8)}… program=${program}`);
  }
  console.log('program split:', JSON.stringify(programs));

  for (const mint of [pumpMints[0], mints.at(-1)].filter(Boolean) as string[]) {
    const owner = await holderOf(mint);
    const t = performance.now();
    const bal = await getSolanaBalance(owner, mint);
    console.log(
      `balance mint=${mint.slice(0, 8)}… owner=${owner.slice(0, 8)}… raw=${bal.raw} decimals=${bal.decimals} accounts=${bal.accounts} (${Math.round(performance.now() - t)}ms)`,
    );
  }
  console.log(`total RPC calls: ${calls}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
