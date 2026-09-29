# ADR 006 — Wallet EVM embedded (Privy)

Status: **Tertunda — butuh akun Privy (S0-2)** · Spike S6

Yang harus diuji setelah app Privy dibuat:

- Custom auth dengan JWT ES256 dari JWKS APECAM.
- `createWallet` EVM.
- Export private key.
- Mengambil alamat wallet user dari Privy server API.
- Harga untuk perkiraan jumlah streamer.

Catatan dari S1: alamat EVM sama di semua chain, jadi wallet embedded langsung bisa menerima $APECAM di Robinhood Chain (chain ID 4663).
