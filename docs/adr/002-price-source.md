# ADR 002 — Sumber harga: DexScreener

Status: **Diterima (dengan 1 keputusan baru untuk owner)** · 2026-09-29 · Spike S2 · Script: `spikes/src/s2-dexscreener.ts`, output `spikes/out/s2*.txt`

## Temuan

1. **Robinhood Chain didukung**, dengan slug `robinhood`. DEX yang terlihat: uniswap (v3/v4), ramses, up, giga, kittenswap, robinswap, topaz, 0swap, alandale, dan **flapsh** (Flap).
2. **Flap** muncul di `bsc` dan `robinhood` dengan dexId `flapsh`.
3. **pump.fun** memakai dexId `pumpfun` (bonding curve) dan `pumpswap` (setelah graduate).
4. **Pons:** token $PONS sendiri terindeks (likuiditas jutaan USD). **Belum terbukti** apakah token yang baru diluncurkan di Pons (sebelum graduate) punya pair di DexScreener, dan apa dexId-nya. Perlu satu contoh token Pons baru dari owner.
5. **Batch endpoint** `/tokens/v1/{chain}/{a,b,…}` menerima 30 alamat (Solana dan Robinhood), waktu respons ~60–290 ms.
6. **Masalah penting: token pump.fun yang masih di bonding curve tidak punya field `liquidity`.** Dari 20 token Solana terbaru, 14 pair (`pumpfun`) hanya berisi `priceUsd`, `marketCap`, dan `volume`, tanpa likuiditas. Dengan aturan D10 (likuiditas ≥ $5.000), **semua token pump.fun yang belum graduate akan ditolak**, padahal justru itu inti audiens APECAM.

## Keputusan

- DexScreener sebagai sumber utama, cache Redis 60 detik, batch 30 alamat.
- Aturan pemilihan pair: likuiditas USD tertinggi. **Kalau tidak ada pair dengan field likuiditas** (bonding curve), pakai pair dengan `volume.h24` tertinggi.
- **Usulan revisi D10 (perlu persetujuan owner — D20):**
  - Pair yang punya data likuiditas: syarat likuiditas ≥ $5.000 (tetap).
  - Pair bonding curve tanpa data likuiditas: syarat **market cap ≥ $10.000 dan volume 24 jam ≥ $1.000**.
  - Alasan: tetap menolak token mati atau tipis yang mudah dipompa, tanpa memblokir token pump.fun baru.
- DexScreener tidak mengirim header `x-ratelimit-limit`. Ikuti batas di dokumentasinya (±300 req/menit untuk endpoint pair/token, ±60 untuk profiles) dan pasang rate limiter di sisi klien.

## Belum terjawab

- dexId dan ketersediaan harga token Pons sebelum graduate (butuh contoh token dari owner).
