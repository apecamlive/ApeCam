# Laporan Phase 0 + Sprint 1

Tanggal: 2026-09-29 · Acuan: `APECAM-Sprint-Tasks-and-Testing.md` bagian C dan D

Phase 0 dikerjakan lebih dulu karena Sprint 1 bergantung padanya: auth, chain adapter, harga, dan API stream.

## Ringkasan

|                                                                    | Status                                                                                                          |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Kode backend Phase 0 + Sprint 1                                    | ✅ Selesai, teruji otomatis                                                                                     |
| Frontend (design system, Home, token room, search, Studio minimal) | ✅ Selesai, diuji manual di browser lokal                                                                       |
| Gate Phase 0 ("live dari browser, mati saat token dijual")         | 🟡 Logika terbukti lewat test integrasi (T-P0-I8/I9/I10); **uji end-to-end dengan video menunggu akun LiveKit** |
| Deploy staging Railway                                             | ⛔ Menunggu akun Railway + repo GitHub                                                                          |

Pipeline lokal: format ✅ · lint ✅ · typecheck 11/11 ✅ · **111 test otomatis lulus** · build web + worker ✅ · 4 contract test live (Solana, Robinhood Chain, Base) ✅

## Status task

### Phase 0

| Task                             | Status | Catatan                                                                                                  |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| P0-1 Scaffold web                | ✅     | Next.js 16 (bukan fork), Tailwind 4                                                                      |
| P0-2 Skema DB v0                 | ✅     | Langsung skema lengkap §5 (S1-2), 16 tabel + migrasi Drizzle                                             |
| P0-3 Auth SIWS + SIWE            | ✅     | Nonce sekali pakai, JWT ES256, JWKS, CSRF origin check, revoke saat logout                               |
| P0-4 UI Connect Wallet           | ✅     | Satu modal Solana + EVM; RainbowKit auth adapter; `signIn` Wallet Standard dengan fallback `signMessage` |
| P0-5 Chain adapter               | ✅     | SPL + Token-2022, fallback RPC, deteksi "bukan token" vs "RPC mati"                                      |
| P0-6 Pricing                     | ✅     | DexScreener batch 30, cache, guard likuiditas + aturan bonding curve (D20 usulan)                        |
| P0-7 API stream                  | ✅     | eligibility, start, end, view-token                                                                      |
| P0-8 Studio minimal              | ✅     | Kamera + mic; screen share di Sprint 2                                                                   |
| P0-9 Halaman viewer              | ✅     | Digabung ke token room (S1-9)                                                                            |
| P0-10 Worker + recheck-holdings  | ✅     | BullMQ (fallback timer lokal tanpa Redis)                                                                |
| P0-11 Webhook LiveKit            | ✅     | Diverifikasi signature                                                                                   |
| P0-12 Deploy staging + demo gate | ⛔     | Butuh Railway + LiveKit                                                                                  |

### Sprint 1

| Task                          | Status | Catatan                                                                                              |
| ----------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| S1-1 Design system            | ✅     | Token dari prototype; galeri komponen di `/dev/ui`                                                   |
| S1-2 Skema DB lengkap         | ✅     | + loader `app_config`                                                                                |
| S1-3 Metadata + fallback logo | ✅     | DexScreener → metadata launchpad/on-chain → placeholder                                              |
| S1-4 Job harga & stream basi  | ✅     | `refresh-prices`, `stale-streams`                                                                    |
| S1-5 Webhook lengkap          | ✅     | Viewer dihitung ulang dari LiveKit (idempoten) + rekonsiliasi di `stale-streams`                     |
| S1-6 Snapshot & thumbnail     | 🟡     | Kode Egress → R2 → `refresh-thumbnails` selesai dan teruji dengan fake; uji nyata butuh LiveKit + R2 |
| S1-7 API feed                 | ✅     | Live Now / Trending / Just Live, cache 10 detik                                                      |
| S1-8 Halaman Home             | ✅     |                                                                                                      |
| S1-9 Token room               | ✅     |                                                                                                      |
| S1-10 Chat                    | ✅     | Relay server lewat LiveKit data channel                                                              |
| S1-11 Search                  | ✅     | Ticker (trigram) + CA; CA baru dicari via DexScreener                                                |

## Hasil test

### Otomatis (semua lulus)

| ID                                                                                | Lokasi                                                                                         |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| T-P0-U1 nonce/SIWE fields                                                         | `apps/web/tests/auth.test.ts`                                                                  |
| T-P0-U2 SIWS message                                                              | `packages/shared/src/signin.test.ts`                                                           |
| T-P0-U3 nilai holding (decimal)                                                   | `packages/pricing/src/pricing.test.ts`                                                         |
| T-P0-U4 pemilihan pair                                                            | `packages/pricing/src/pricing.test.ts`                                                         |
| T-P0-U5 semua kode eligibility                                                    | `packages/core/src/eligibility.test.ts`                                                        |
| T-P0-U6 saldo Solana multi-akun / Token-2022                                      | `packages/chain/src/solana.test.ts`                                                            |
| T-P0-U7 fallback RPC                                                              | `packages/chain/src/{solana,evm}.test.ts`                                                      |
| T-P0-I1–I5 login EVM/Solana, nonce sekali pakai, kedaluwarsa, domain lain         | `apps/web/tests/auth.test.ts`                                                                  |
| T-P0-I6, I7 D15 per wallet                                                        | `packages/core/src/streams.test.ts`, `packages/db/src/schema.test.ts`                          |
| T-P0-I8–I10 Cut the Cam                                                           | `packages/core/src/streams.test.ts`                                                            |
| T-P0-I11 end oleh orang lain                                                      | `packages/core/src/streams.test.ts`                                                            |
| T-P0-I12 webhook palsu                                                            | `apps/web/tests/streams.test.ts`                                                               |
| T-P0-C1 contract test live                                                        | `packages/chain/tests/live/` (jalankan dengan `APECAM_DOH=1` dari Indonesia)                   |
| T-S1-U1 format · U2 logo · U3 placeholder · U4 trending · U5 chat · U6 batch 75→3 | `shared`, `core`, `pricing`                                                                    |
| T-S1-I1–I3, I6–I9                                                                 | `packages/core/src/sprint1.test.ts`                                                            |
| T-S1-I4, I5 chat tanpa login / diban                                              | Tercakup `requireSession` di route (`apps/web/tests/streams.test.ts`: 401 dan 403 USER_BANNED) |

Semua test integrasi memakai PGlite (Postgres in-process), jadi bisa jalan tanpa Docker. Di CI, test juga jalan dengan Postgres + Redis sungguhan.

### Manual (browser lokal, build produksi, database PGlite, data demo)

| ID                                                 | Hasil                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| T-S1-M1 Dua streamer satu token                    | ✅ Stream picker muncul, pindah stream mengubah `?s=` dan judul                               |
| T-S1-M2 Token tanpa stream                         | ✅ "Nobody is live… Hold $100 of $DEGEN? Go live."                                            |
| T-S1-M3 CA di mobile                               | ✅ CA dipendekkan di 375px, lengkap di desktop                                                |
| T-S1-M4 Thumbnail                                  | ⛔ Butuh LiveKit + R2                                                                         |
| T-S1-M5 Tanpa label chain                          | ✅ Kartu, header, dan search tidak menampilkan chain/launchpad                                |
| T-S1-M6 Chat mobile                                | ✅ Layout: chat di bawah player; kirim pesan butuh wallet nyata (belum diuji)                 |
| T-S1-M7 Buy & Chart                                | ✅ Tombol mengarah ke DexScreener / launchpad; klik di tab baru belum diuji manual            |
| T-S1-M8 Tampilan vs prototype                      | ✅ Desktop 1280px dan mobile 375px, tanpa scroll horizontal                                   |
| T-S1-M9 Search                                     | ✅ Ticker duplikat urut MC; CA asli belum dikenal (DEGEN) → otomatis dicari, disimpan, dibuka |
| T-P0-M1/M2 Uji gate                                | ⛔ Butuh LiveKit + wallet dengan token                                                        |
| T-P0-M3 Nonton tanpa wallet                        | 🟡 view-token anonim teruji otomatis; video butuh LiveKit                                     |
| T-P0-M5/M6 Login berbagai wallet / tolak signature | ⛔ Butuh ekstensi wallet di browser user                                                      |

Data live terverifikasi: token Bonk menampilkan MC, harga, dan 24h asli dari DexScreener, logo dari DexScreener, dan decimals dari RPC Solana.

## Bug yang ditemukan dan diperbaiki saat testing

1. **`recheck-holdings` berhenti total kalau satu stream error** (ditemukan saat smoke test worker). Satu wallet/token yang ditolak RPC membuat semua stream lain tidak dicek, jadi Cut the Cam tidak jalan untuk siapa pun. Diperbaiki: tiap stream diisolasi, dan kontrak/wallet yang ditolak chain dihitung sebagai holding gagal. Ditambah 2 regression test.
2. **Tombol Copy CA diam saja saat clipboard diblokir** (konteks non-HTTPS atau izin ditolak). Diperbaiki: fallback `execCommand`, dan pesan "Press Ctrl+C" kalau tetap gagal.
3. **Error saat inisialisasi server tidak tercatat di log** (misalnya `SESSION_JWT_PRIVATE_KEY` belum diset). Diperbaiki: fallback ke console logger. Ditambah script `gen:session-key`.
4. **Retry React Query untuk error 4xx** membuat UI tertahan di skeleton. Diperbaiki: 4xx tidak di-retry.
5. **Build Next gagal**: RainbowKit → Base Account connector → SDK server Coinbase dengan import x402 opsional. Diperbaiki: `@base-org/account` dijadikan paket eksternal di server.

## Perubahan terhadap plan (perlu diketahui tim)

- **Paket baru `packages/core`**: logika domain dipakai bersama oleh web dan worker (eligibility, stream, chat, feed, search, job).
- **Identitas LiveKit:** streamer `pub_{userId}`, viewer `u_{userId}` / `a_{random}`. Tab viewer milik streamer sendiri tidak dihitung sebagai viewer.
- **Kolom tambahan:** `tokens.volume_24h_usd` (aturan bonding curve), `streams.rpc_failures`, `streams.egress_id`, `buybacks/burns.final` (block tag `safe`, ADR 001), `payout_batches.scale_factor`.
- **Trending** memakai pertumbuhan viewer 15 menit + jumlah chat. Riwayat viewer per menit baru tersedia setelah `count-minutes` (Sprint 3); sampai saat itu baseline-nya 0.
- **Database lokal tanpa Docker:** `pnpm --filter @apecam/db dev` (PGlite + wire protocol). Hanya satu koneksi aktif, jadi tidak untuk load test.

## Yang dibutuhkan untuk menutup Phase 0 + Sprint 1

1. **Akun LiveKit** (URL + API key/secret) → uji gate T-P0-M1/M2, video viewer, chat realtime, webhook asli.
2. **Bucket Cloudflare R2** → thumbnail (T-S1-M4).
3. **Akun Railway + repo GitHub** → deploy staging (P0-12), CI dengan Postgres/Redis asli.
4. **Wallet uji** (Phantom + MetaMask dengan sedikit token) di browser untuk T-P0-M5/M6 dan kirim chat.
5. **Keputusan D20** (aturan bonding curve) — kode sudah memakai usulan default, bisa diubah lewat `app_config`.
