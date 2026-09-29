# Laporan Sprint 0

Tanggal: 2026-09-29 · Acuan: `APECAM-Sprint-Tasks-and-Testing.md` bagian B

## Ringkasan

| Task                           | Status              | Catatan                                                                                           |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------- |
| S0-1 Kick-off & serah terima   | ⏳ Menunggu owner   | Butuh rapat + akses domain/billing                                                                |
| S0-2 Akun layanan              | ⛔ Diblokir         | Harus dibuat owner/tim: Railway, Cloudflare + R2, LiveKit, Helius, Alchemy, Privy, Sentry, GitHub |
| S0-3 Monorepo & CI             | ✅ Selesai (lokal)  | Branch protection menunggu repo GitHub                                                            |
| S0-4 Project Railway           | 🟡 Konfigurasi siap | `railway.json` untuk web & worker sudah ada; deploy menunggu akun Railway + repo GitHub           |
| S0-5 Spike S1 Robinhood Chain  | ✅ Selesai          | ADR 001 — 2 hal menunggu API key Alchemy                                                          |
| S0-6 Spike S2 DexScreener      | ✅ Selesai          | ADR 002 — **keputusan baru D20** untuk owner                                                      |
| S0-7 Spike S3 LiveKit browser  | ⛔ Diblokir         | Butuh proyek LiveKit (ADR 003)                                                                    |
| S0-8 Spike S4 Snapshot + frame | 🟡 Sebagian         | Analisis frame lulus; egress → R2 butuh LiveKit + R2 (ADR 004)                                    |
| S0-9 Spike S5 Solana           | ✅ Selesai          | ADR 005 — Helius DAS menunggu API key                                                             |
| S0-10 Spike S6 Privy           | ⛔ Diblokir         | Butuh app Privy (ADR 006)                                                                         |

## Hasil testing

| ID      | Test                                                               | Hasil                                                                                                                                                    | Bukti                               |
| ------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| T-S0-U1 | Unit test health check (3 kasus: semua lulus, satu gagal, timeout) | ✅ 3/3 lulus                                                                                                                                             | `pnpm test`                         |
| T-S0-I1 | Integrasi Postgres + Redis (select 1, `pg_trgm`, `GETDEL`)         | ⚠️ **Dilewati di lokal** (Docker belum terpasang). Test ini jalan otomatis di GitHub Actions dengan service container.                                   | `pnpm test:integration` → 3 skipped |
| T-S0-M1 | Deploy otomatis ke staging                                         | ⛔ Belum bisa (butuh akun Railway + repo GitHub)                                                                                                         | —                                   |
| T-S0-M2 | Health check                                                       | ✅ di lokal: `/api/health` (web) dan `/health` (worker) mengembalikan **503** dengan alasan jelas saat DB/Redis belum diset. Versi 200 menunggu staging. | lihat di bawah                      |
| T-S0-M3 | Postgres tidak terbuka ke publik                                   | ⛔ Belum bisa (butuh Railway)                                                                                                                            | —                                   |
| T-S0-M4 | Staging terkunci                                                   | ⛔ Belum bisa (butuh Cloudflare)                                                                                                                         | —                                   |
| T-S0-M5 | CI memblokir PR yang gagal                                         | ⛔ Belum bisa (butuh repo GitHub)                                                                                                                        | Workflow `ci.yml` sudah ada         |
| T-S0-M6 | Lint memblokir transaksi                                           | ✅ `signTransaction` dan `eth_sendTransaction` → error; `personal_sign` (login) tetap boleh                                                              | `eslint` exit code 1                |

Pipeline CI yang dijalankan di lokal: `format:check` ✅ · `lint` ✅ · `typecheck` ✅ (10 paket) · `test` ✅ · `build` ✅ (web Next.js 16 + worker).

Output health check lokal (tanpa DB/Redis):

```json
{
  "ok": false,
  "checks": {
    "database": { "ok": false, "ms": 3, "error": "DATABASE_URL not set" },
    "redis": { "ok": false, "ms": 2, "error": "REDIS_URL not set" }
  }
}
```

## Temuan penting dari spike

1. **DNS `*.robinhood.com` diblokir ISP Indonesia** (dialihkan ke Internet Positif). Developer harus memakai DoH/VPN. Server Railway (US) tidak terpengaruh. → ADR 001.
2. **Blok Robinhood Chain 0,1 detik.** "12 konfirmasi" di plan diganti block tag `safe` (~9 menit). → ADR 001.
3. **Blockscout API tidak bisa dipakai dari server** (Cloudflare challenge). Diganti **Alchemy** (Token API + Transfers API), yang resmi mendukung Robinhood Chain. → ADR 001.
4. **`eth_getLogs` maksimal 10.000 log dan 10 juta blok per request.** Jendela sync diatur menyesuaikan. → ADR 001.
5. **Token pump.fun baru memakai Token-2022.** Adapter Solana membaca kedua program token. → ADR 005.
6. **Token pump.fun di bonding curve tidak punya data likuiditas di DexScreener.** Aturan D10 (likuiditas ≥ $5.000) akan menolak semuanya. → **Keputusan baru D20** di ADR 002.

## Keputusan yang dibutuhkan dari owner

- **D20:** untuk token bonding curve tanpa data likuiditas, pakai syarat **market cap ≥ $10.000 dan volume 24 jam ≥ $1.000**? (ADR 002)
- Satu contoh alamat token yang baru diluncurkan di **Pons**, untuk memastikan harganya tersedia sebelum graduate.

## Langkah berikutnya untuk menutup Sprint 0

1. Owner/tim membuat akun (S0-2) dan repo GitHub, lalu push folder `apecam/`.
2. Pasang Docker Desktop di laptop developer → jalankan `docker compose up -d` dan `pnpm test:integration` (T-S0-I1).
3. Buat project Railway sesuai README → jalankan T-S0-M1 s/d M5.
4. Jalankan spike S3, S4 (bagian egress), dan S6 setelah akun LiveKit, R2, dan Privy tersedia; uji ulang bagian Alchemy (S1) dan Helius DAS (S5).
