# Laporan Sprint 5: kesiapan closed beta & launch

Tanggal: 2026-09-30 · Belum di-commit · Acuan: `APECAM-Sprint-Tasks-and-Testing.md` bagian H (minggu 11, closed
beta) dan I (minggu 12–13, launch), Implementation Plan §18 (R4) dan §19 (checklist launch)

Dokumen task tidak punya "Sprint 5". Setelah Sprint 4 datang **closed beta** lalu **launch**, yang sebagian
besar adalah pekerjaan owner (undang streamer, shift moderator, payout pertama). Sprint ini mengerjakan
bagian yang butuh kode agar beta bisa dimulai. Sesuai aturan beta ("tanpa fitur baru"), semua ini selesai
**sebelum** beta.

## Ringkasan

|                                                                    | Status                               |
| ------------------------------------------------------------------ | ------------------------------------ |
| S5-1 Akses Go Live: open / invite (closed beta) / closed (darurat) | ✅ Selesai, teruji otomatis + E2E    |
| S5-2 Alert report terbuka > 15 menit                               | ✅ Selesai, teruji otomatis          |
| S5-3 Laporan harian ops ke Telegram (00:20 UTC)                    | ✅ Selesai, teruji otomatis          |
| S5-4 Smoke test otomatis (§J) + workflow GitHub "Smoke"            | ✅ 10/10 lulus di build lokal        |
| S5-5 Link feedback beta + banner beta                              | ✅ Diuji di browser                  |
| S5-6 Panduan moderator, simulasi insiden, runbook hari launch      | ✅ Ditulis                           |
| Pengecekan Sprint 4 yang tertunda                                  | ✅ Semua lulus                       |
| Beta sungguhan (T-B-M1…M6), launch (T-L-M1…M4)                     | ⛔ Butuh production + streamer nyata |

Pipeline lokal: format ✅ · lint ✅ · typecheck 11/11 ✅ · **251 test otomatis lulus** · build web ✅ ·
**E2E 17/17 lulus** · smoke 10/10 ✅ · `pnpm audit --audit-level high` ✅

## Yang dibuat

**S5-1 Akses Go Live** (risiko R4 + "tombol darurat tutup Go Live" di checklist launch)

- Tiga mode di Admin → **Go Live access** (moderator juga bisa, karena yang sedang shift harus bisa menutup
  tanpa menunggu admin):
  - `open`: semua wallet yang memenuhi syarat.
  - `invite`: closed beta. Hanya wallet yang diundang dan staff.
  - `closed`: darurat. Tidak ada yang bisa mulai stream; menonton dan chat tetap jalan. Opsional: sekaligus
    mengakhiri semua stream yang sedang live.
- Berlaku **langsung**: mode dibaca tanpa cache 60 detik.
- Undangan per **alamat wallet** (tabel baru `go_live_invites`, migrasi `0002`, aditif), jadi streamer bisa
  diundang sebelum pernah login. Tempel banyak alamat sekaligus; alamat tidak valid dilaporkan. Daftar
  menunjukkan siapa yang sudah login. Undangan ikut backup harian.
- Studio menampilkan "Closed beta" / "Go Live is paused" sebelum langkah-langkah, bukan membiarkan user
  gagal di akhir. API start juga menolak (`GO_LIVE_CLOSED` / `GO_LIVE_INVITE_ONLY`).
- Banner di atas semua halaman saat mode bukan `open`. Setiap perubahan tercatat di Action log dan
  dikirim ke kanal alert.

**S5-2 Alert SLA report:** report yang terbuka > 15 menit (target launch T-L-M2) → satu alert per stream.

**S5-3 Laporan harian (L-8):** job `daily-report` 00:20 UTC mengirim ringkasan hari kemarin:

- stream, streamer, token, viewer puncak, menit S2E valid;
- report dibuka/ditangani, **median menit sampai ditindak**, report yang masih terbuka, ban;
- job yang bermasalah, status tracker.

**S5-4 Smoke test:** `node tests/smoke/smoke.mjs <url>` (baca saja, ~1 detik). Mengecek:

- health, tiga tab feed, search, `/burn` + kesegaran tracker, halaman konten;
- header keamanan, admin butuh login, CSRF, robots/sitemap/404, mode Go Live.

Bisa dijalankan dari GitHub (Actions → Smoke). Baris manual §J (login wallet, live kamera/layar, iPhone)
tetap manual.

**S5-5:** setting `beta.feedback_url` (hanya `https://`, ditolak kalau `javascript:`) → link "Beta feedback"
di footer dan tombol "Ask for an invite" di Studio saat closed beta.

**S5-6 Dokumen:** `docs/runbooks/moderator-guide.md`, `incident-drill.md` (B-4, target < 5 menit),
`launch-day.md` (L-1…L-8).

## Hasil test

| ID      | Yang diuji                                                                              | Hasil     |
| ------- | --------------------------------------------------------------------------------------- | --------- |
| T-S5-I1 | Mode invite: hanya wallet diundang + staff; undangan tidak peka huruf besar/kecil (EVM) | ✅ core   |
| T-S5-I2 | Tutup darurat berlaku langsung, bisa mengakhiri semua stream, staff pun tidak bisa live | ✅ core   |
| T-S5-I3 | Report > 15 menit → satu alert; report yang sudah ditangani tidak                       | ✅ core   |
| T-S5-I4 | Laporan harian: angka hari kemarin + median waktu tindak                                | ✅ core   |
| T-S5-I5 | Moderator bisa menekan tombol darurat, user biasa 403; start API menolak                | ✅ web    |
| T-S5-I6 | `/api/me` memberi tahu Studio; undang → bisa live; cabut → terkunci lagi                | ✅ web    |
| T-S5-E1 | E2E: admin menutup Go Live → streamer lain melihat "paused" → admin membuka lagi → log  | ✅ E2E    |
| —       | Setting: mode tidak dikenal & URL feedback `javascript:` ditolak                        | ✅ core   |
| —       | Smoke test terhadap build produksi lokal                                                | ✅ 10/10  |
| —       | Browser: banner closed beta + link feedback tampil, lalu dikembalikan ke `open`         | ✅ manual |

## Temuan

1. **Database dev lokal rusak** (`packages/db/.pgdata`, PGlite abort saat start), kemungkinan karena server
   sesi sebelumnya dimatikan paksa. Hanya data uji lokal. Folder **dipindahkan** ke `.pgdata-broken-20260930`
   (tidak dihapus), database baru dibuat dan diisi data demo. Pola `.gitignore` diperluas ke `.pgdata*`
   supaya salinan itu tidak ikut ter-commit.
2. Smoke test pertama menangkap masalah itu dengan benar (feed/search 500 saat DB mati): alatnya bekerja.
3. Tidak ada bug aplikasi baru. "Tab live 0 stream" di run pertama adalah cache feed 10 detik dari tab
   browser yang terbuka sebelum data diisi.

## Yang dibutuhkan untuk menjalankan beta & launch

1. **Production di Railway + LiveKit + R2 + bot Telegram** (sama seperti Sprint 4). Tanpa ini beta tidak
   bisa dimulai.
2. **Daftar 20–50 wallet streamer** untuk diundang (B-1), link grup feedback (B-2), 2–3 moderator (B-3).
3. **Contract $APECAM + 5 wallet** untuk payout pertama (B-6).
4. Teks legal final (Terms, Privacy).
5. Keputusan: saat launch langsung `open`, atau `invite` dulu lalu dibuka bertahap.
