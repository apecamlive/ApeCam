# Laporan Sprint 4

Tanggal: 2026-09-29 · Belum di-commit (lanjutan Sprint 2 + 3 di working tree) · Acuan: `APECAM-Sprint-Tasks-and-Testing.md` bagian G

## Ringkasan

|                                                                          | Status                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------- |
| Rate limit, header keamanan, kunci origin Cloudflare, checklist keamanan | ✅ Selesai, teruji otomatis                         |
| Halaman About / Terms / Privacy, konfirmasi 18+, halaman 404 / error     | ✅ Selesai (Terms + Privacy = draf, menunggu legal) |
| SEO: metadata, OG image, sitemap, robots                                 | ✅ Selesai                                          |
| Monitoring: alert job gagal, tracker lag, tab Health, runbook            | ✅ Selesai, teruji otomatis                         |
| Backup harian + restore                                                  | ✅ Selesai, round-trip teruji otomatis              |
| E2E Playwright + aksesibilitas (axe)                                     | ✅ 16 test lulus                                    |
| Load test                                                                | 🟡 Skrip siap; uji target butuh staging             |
| Deploy production Railway, uji di perangkat nyata, video asli            | ⛔ Menunggu akun Railway / LiveKit / R2 dari owner  |

Pipeline lokal (sebelum perubahan kecil terakhir): typecheck ✅ · test web 49 + test Sprint 4 (core 11, db 3, web 7 + 5 unit) ✅ · build web ✅ · E2E 16/16 ✅ · `pnpm audit --audit-level high` ✅. **Belum dijalankan ulang** setelah perbaikan lint terakhir, batas default rate limit (per user, 600/menit) dan override `ws`: jalankan `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm --filter @apecam/web e2e`.

## Status task

| Task                      | Status | Catatan                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S4-1 About & Rules        | ✅     | About: lore (3 nilai), 3 langkah, Stream to Earn (angka tier dibaca dari config admin, bukan hardcode), tokenomics 50/30/20, keamanan. Rules sudah ada sejak Sprint 2. Footer baru: Rules · Terms · Privacy · Burn.                                                                                                                 |
| S4-2 Responsive           | 🟡     | E2E mobile (Pixel 7): tidak ada scroll horizontal, bottom nav tampil. Uji perangkat nyata (iPhone Safari, Android Chrome, wallet) tetap manual di staging.                                                                                                                                                                          |
| S4-3 State & pesan        | ✅     | `not-found`, `error` (dengan kode referensi), `global-error`. Loading/empty/error per halaman sudah ada sejak Sprint 3.                                                                                                                                                                                                             |
| S4-4 SEO & OG             | ✅     | `generateMetadata` token room + profil (hanya baca DB, tanpa panggilan API luar), OG image dinamis (teks saja, tidak mengambil logo dari URL luar → tidak ada SSRF), `sitemap.xml` (token room 30 hari terakhir), `robots.txt` (admin, api, dev, go-live tidak diindeks).                                                           |
| S4-5 E2E                  | ✅     | Playwright terhadap build produksi + database PGlite sekali pakai yang di-seed. Masuk CI.                                                                                                                                                                                                                                           |
| S4-6 Rate limit & header  | ✅     | Semua endpoint API: limit per IP/per user sesuai §6, lainnya 600/menit per user (per IP bila belum login, karena banyak pengguna seluler berbagi satu IP), 429 + `Retry-After`. CSP, HSTS (hanya HTTPS), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy. `proxy.ts` menolak request tanpa header rahasia Cloudflare. |
| S4-7 Security checklist   | ✅     | `docs/security-checklist.md`: 16 baris threat model, 14 OK di kode, 2 pengaturan owner. Temuan baru diperbaiki (lihat bawah). gitleaks + `pnpm audit` di CI.                                                                                                                                                                        |
| S4-8 Load test            | 🟡     | `tests/load`: k6 feed 200 RPS, view-token 50 RPS, panduan `lk load-test`, uji sanity Node. Target L1–L3 harus dijalankan di staging.                                                                                                                                                                                                |
| S4-9 Monitoring & runbook | ✅     | Alert Telegram: job gagal 3× berturut-turut (sekali) + pulih, tracker tertinggal > 30 menit (maks 1×/jam), moderator ban ≥ 5 wallet/jam. Tab Admin → Health. `instrumentation.ts` mencatat setiap error server sebagai JSON. 9 runbook.                                                                                             |
| S4-10 Production & backup | 🟡     | Job `backup-db` 02:30 UTC ke bucket R2 **privat**, CLI `backup`/`restore`, uji restore otomatis. Checklist deploy Railway ditulis. Deploy nyata menunggu akun.                                                                                                                                                                      |
| S4-11 Legal               | 🟡     | Terms + Privacy versi draf (sesuai apa yang benar-benar disimpan kode), ditandai "pending legal review". Checkbox 18+ di Studio + wajib di API.                                                                                                                                                                                     |

## Hasil test

### Otomatis

| ID                                     | Hasil | Lokasi                                                                                                                  |
| -------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------- |
| T-S4-I1 rate limit → 429 + Retry-After | ✅    | `apps/web/tests/sprint4.test.ts` (nonce 10/menit/IP, search 60/menit, report 5/jam per user)                            |
| T-S4-I2 tanpa header origin Cloudflare | ✅    | `apps/web/lib/security.test.ts`                                                                                         |
| T-S4-I3 POST dengan Origin lain → 403  | ✅    | web (5 endpoint, termasuk admin)                                                                                        |
| T-S4-I4 XSS di chat/judul/nama         | ✅    | web (disimpan & dikembalikan apa adanya; nama menolak markup) + E2E (judul XSS tampil sebagai teks, script tidak jalan) |
| T-S4-I5 header keamanan                | ✅    | unit + E2E (header pada respons HTML nyata)                                                                             |
| T-S4-E1 alur viewer                    | ✅    | `e2e/viewer.spec.ts`                                                                                                    |
| T-S4-E2 alur streamer                  | 🟡    | Sampai tombol Go Live (rules + 18+). Live dengan video butuh LiveKit.                                                   |
| T-S4-E3 alur moderasi                  | ✅    | `e2e/moderation.spec.ts`: 3 report → auto-blur → kill → ban → log                                                       |
| T-S4-E4 aksesibilitas (axe)            | ✅    | 6 halaman, 0 pelanggaran serius/kritis (setelah perbaikan kontras)                                                      |
| T-S4-L1…L3 load                        | ⛔    | Staging                                                                                                                 |
| T-S4-P1 Lighthouse                     | ⛔    | Staging (butuh domain + CDN)                                                                                            |
| T-S4-M2 restore (bagian otomatis)      | ✅    | `packages/db/src/backup.test.ts`: semua baris identik setelah restore                                                   |
| T-S4-M3 alert (bagian otomatis)        | ✅    | `packages/core/src/sprint4.test.ts`                                                                                     |

### Load sanity lokal

Belum dijalankan (`node tests/load/sanity.mjs http://localhost:3000`). Hasil lokal dengan PGlite tidak mewakili production; target L1–L3 diukur di staging.

## Bug dan temuan yang diperbaiki

1. **Hari reward bisa hilang.** `close-rewards` hanya menutup "kemarin"; kalau worker mati saat 00:10 UTC, reward hari itu tidak pernah dibuat. Sekarang tiap malam juga menutup ulang 2 hari sebelumnya (idempoten, tidak menyentuh reward batched/paid/void). Ada test-nya.
2. **Kontras warna LIVE** (ditemukan axe di semua halaman): teks putih di atas merah `#ef4444` hanya 3,8:1 (WCAG minta 4,5:1). Latar merah untuk badge/tombol kini `#dc2626` (4,8:1); teks merah tetap.
3. **Chat pengirim tidak muncul tanpa LiveKit.** Pesan hanya tampil saat LiveKit mengirim balik. Kini langsung ditambahkan dari respons server (duplikat tetap disaring).
4. **IP rate limit bisa dipalsukan** jika memakai hop pertama `X-Forwarded-For`. Kini: `CF-Connecting-IP`, lalu hop **terakhir**.
5. **HSTS/upgrade-insecure-requests merusak build produksi di http://localhost.** Kini hanya aktif bila `APP_ORIGIN` HTTPS.
6. **Tidak ada alert ban massal** (baris terakhir threat model). Ditambahkan.
7. **`ws` < 8.21 (high, DoS)** lewat wagmi/viem: dipin ke 8.21 dengan override pnpm. Sisa 3 moderate (uuid, decode-uri-component, stream-json) ada di library wallet sisi browser dan butuh loncatan versi mayor; tidak menerima input tak tepercaya di server. Dicatat, CI gagal bila muncul high/critical baru.

## Yang dibutuhkan dari owner untuk menutup Sprint 4

1. **Akun Railway** (+ domain Cloudflare) → deploy staging & production sesuai `docs/runbooks/deploy-railway.md`, lalu load test L1–L3 dan Lighthouse.
2. **LiveKit + R2** (bucket publik + bucket backup privat) → E2E streamer penuh, uji alert & restore manual (T-S4-M2/M3).
3. **Teks legal final** untuk Terms dan Privacy (draf sudah terpasang dan ditandai).
4. **Bot Telegram** untuk alert.
5. Di GitHub: aktifkan secret scanning + Dependabot alerts (gratis untuk repo publik).
