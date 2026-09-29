# ADR 005 — Saldo token Solana

Status: **Diterima** · 2026-09-29 · Spike S5 · Script: `spikes/src/s5-solana.ts`, output `spikes/out/s5.txt`

## Temuan

1. **Kelima token pump.fun terbaru yang dicek memakai Token-2022** (`TokenzQd…`). Token lama seperti BONK memakai SPL Token (`Tokenkeg…`). Adapter **wajib** membaca kedua program.
2. Saldo per wallet per mint = jumlah semua token account dari `getTokenAccountsByOwner` untuk **kedua** program (2 call paralel, 30–100 ms di RPC publik).
3. RPC publik Solana membatasi method berat: `getTokenLargestAccounts` langsung ditolak dengan `Too many requests`. RPC publik tidak cocok untuk production.

## Keputusan

- `SolanaAdapter.getBalance(owner, mint)`: `getTokenAccountsByOwner` untuk kedua program token, lalu dijumlahkan. Di implementasi final, filter langsung dengan `{ mint }` (lebih ringan, satu call per program).
- RPC production: **Helius** (sesuai brief). RPC publik hanya untuk development.
- `listHoldings`: Helius DAS `getAssetsByOwner` (belum diuji, butuh API key).

## Belum terjawab (butuh akun)

- Helius DAS `getAssetsByOwner`: format respons, kecepatan, dan apakah sudah menyertakan harga.
