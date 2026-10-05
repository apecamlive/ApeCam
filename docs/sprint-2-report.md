# Laporan Sprint 2

Tanggal: 2026-09-29 · Branch: `sprint-2` · Acuan: `APECAM-Sprint-Tasks-and-Testing.md` bagian E

## Ringkasan

|                                                                                                                   | Status                                        |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Backend Sprint 2 (token wallet, report + auto-blur, admin, ban, profil, link wallet, wallet embedded sisi server) | ✅ Selesai, teruji otomatis                   |
| Frontend (Studio lengkap, report, admin, profil, hapus chat)                                                      | ✅ Selesai, diuji manual di browser           |
| S2-9 wallet embedded sisi **browser** (Privy SDK)                                                                 | ⏳ Ditunda sampai app Privy dibuat (spike S6) |
| Uji dengan video/LiveKit dan wallet ekstensi asli                                                                 | ⛔ Butuh akun LiveKit + wallet uji            |

Pipeline lokal: format ✅ · lint ✅ · typecheck 11/11 ✅ · **162 test otomatis lulus** (naik dari 111) · build web + worker ✅

## Status task

| Task                                     | Status | Catatan                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 Daftar token milik wallet           | ✅     | Solana: RPC standar (kedua program token). EVM: Alchemy Token API (`alchemy_getTokenBalances`), dan RPC tanpa Token API dilaporkan sebagai `unsupported` sehingga Studio menawarkan paste CA. Diurutkan dari nilai terbesar; token tersembunyi dibuang; cache 120 detik.                                                                                          |
| S2-2 Studio lengkap                      | ✅     | Pilih wallet (wallet yang sedang live dikunci, D15), daftar token + paste CA, cek kelayakan otomatis, sumber siaran kamera / layar / layar + bubble kamera, audio sistem (Chrome/Edge desktop), mobile hanya kamera, preview kamera, checkbox aturan, panel live (viewer, hasil re-check terakhir, countdown warning, status blur, pesan bila dihentikan server). |
| S2-3 Report + auto-blur                  | ✅     | 1 report per user per stream; 3 pelapor berbeda dalam 5 menit → blur + alert moderator; kategori berat langsung mengirim alert. Notifier Telegram (`ALERT_TELEGRAM_*`).                                                                                                                                                                                           |
| S2-4 Admin API                           | ✅     | Antrian report (dikelompokkan per stream), dismiss, kill, blur/unblur, ban/unban (semua wallet user), hide token (live stream token itu ikut dihentikan), hapus chat, log aksi. Role dibaca dari DB tiap request.                                                                                                                                                 |
| S2-5 Admin UI                            | ✅     | Tab Reports / Live streams / Action log; kill, ban, dan hide wajib pakai dialog konfirmasi + alasan. Pilihan durasi ban 24 jam / 7 hari / permanen.                                                                                                                                                                                                               |
| S2-6 Link wallet + payout + profil (API) | ✅     | Link lewat signature baru dari wallet kedua; payout hanya EVM, satu per user; nama (2–32 karakter, kata "apecam/admin/…" dicadangkan); avatar di-encode ulang ke WebP 256px.                                                                                                                                                                                      |
| S2-7 Halaman profil                      | ✅     | Statistik gabungan semua wallet, riwayat stream, riwayat payout, mode edit untuk pemilik.                                                                                                                                                                                                                                                                         |
| S2-8 Enforcement ban                     | ✅     | Sesi lama langsung tidak berlaku, login ulang ditolak (`USER_BANNED`), semua stream user dihentikan, semua endpoint tulis menolak.                                                                                                                                                                                                                                |
| S2-9 Wallet embedded                     | 🟡     | **Server selesai:** `POST /api/me/embedded-wallet` mengambil alamat dari Privy server API (body diabaikan), jadi payout wallet default. **Browser ditunda:** SDK Privy (~7 MB, banyak peer dependency) baru dipasang setelah app Privy ada dan endpoint-nya terverifikasi di spike S6.                                                                            |

## Hasil test

### Otomatis

| ID                                                                                     | Hasil | Lokasi                                                                               |
| -------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------ |
| T-S2-U1 ambang auto-blur (2 / 3 dalam 5 menit / 3 tersebar)                            | ✅    | `packages/core/src/sprint2.test.ts`                                                  |
| T-S2-U2 urutan token wallet                                                            | ✅    | `packages/core/src/sprint2.test.ts`, `packages/chain/src/*.test.ts`                  |
| T-S2-U3 deteksi dukungan browser                                                       | ✅    | `apps/web/lib/client/broadcast.test.ts`                                              |
| T-S2-I1 report dua kali → 409                                                          | ✅    | core + route (`apps/web/tests/sprint2.test.ts`)                                      |
| T-S2-I2 satu user tidak bisa memicu blur sendiri                                       | ✅    | core                                                                                 |
| T-S2-I3 admin oleh user biasa → 403, moderator → 200                                   | ✅    | route                                                                                |
| T-S2-I4 kill → killed, room dihapus, report ditutup, tercatat                          | ✅    | core                                                                                 |
| T-S2-I5 ban user live di 2 wallet → dua stream mati, sesi dicabut, login ulang ditolak | ✅    | core + route                                                                         |
| T-S2-I6 ban sementara kedaluwarsa                                                      | ✅    | core                                                                                 |
| T-S2-I7 hide token → tidak eligible, hilang dari feed/search/daftar token              | ✅    | core                                                                                 |
| T-S2-I8 link wallet milik orang lain → 409                                             | ✅    | core + route                                                                         |
| T-S2-I9 payout ke wallet Solana → 400                                                  | ✅    | core + route                                                                         |
| T-S2-I10 alamat embedded dari body diabaikan                                           | ✅    | core + route                                                                         |
| T-S2-I11 embedded dua kali → tetap satu                                                | ✅    | core                                                                                 |
| T-S2-I12 avatar 5 MB / bukan gambar / file palsu → ditolak; PNG asli → WebP 256×256    | ✅    | route                                                                                |
| T-S2-I13 moderator hapus chat → hilang dari riwayat + broadcast ke room                | ✅    | core                                                                                 |
| T-S2-E1–E3 (Playwright)                                                                | ⛔    | Butuh LiveKit (Studio/player). Dipindah ke Sprint 4 (S4-5) bersama setup Playwright. |

### Manual (browser lokal, build produksi, login lewat alur SIWS asli dengan wallet uji Ed25519)

| ID                                                 | Hasil                                                                                                                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-S2-M1 waktu alur streamer                        | ⛔ Butuh LiveKit + wallet dengan token                                                                                                                                            |
| T-S2-M2 / M3 screen share / bubble                 | 🟡 Pilihan dan opsi audio sistem tampil benar di Chrome; publish butuh LiveKit                                                                                                    |
| T-S2-M4 mobile                                     | ✅ Emulasi Android: hanya Kamera; Layar dan Layar + kamera dikunci "Not available on phones"; tanpa scroll horizontal                                                             |
| T-S2-M5 izin kamera ditolak                        | 🟡 Pesan tersedia; belum diuji dengan penolakan izin sungguhan                                                                                                                    |
| T-S2-M6 / M7 wallet embedded otomatis / export key | ⏳ Menunggu app Privy                                                                                                                                                             |
| T-S2-M8 ganti payout wallet                        | 🟡 UI dan API teruji; link wallet kedua butuh ekstensi wallet asli                                                                                                                |
| T-S2-M9 notifikasi moderator                       | 🟡 Teruji dengan fetch palsu; butuh bot Telegram asli                                                                                                                             |
| T-S2-M10 admin UI                                  | ✅ Report tampil dengan alasan; kill lewat dialog (Confirm terkunci tanpa alasan); report tertutup; log mencatat aksi; blur/unblur; ban dari tab Live → stream hilang dari daftar |
| T-S2-M11 profil multi-wallet                       | ✅ (otomatis); manual: halaman profil, validasi nama, simpan nama                                                                                                                 |
| T-S2-M12 wallet sedang live dikunci                | ✅ (otomatis + UI)                                                                                                                                                                |
| Report dari token room                             | ✅ Pilih kategori, isi alasan, kirim → "Thanks…", tombol jadi "Reported"                                                                                                          |
| Studio: cek kelayakan data asli                    | ✅ Paste CA Bonk → nilai $0.00, "$100.00 more needed", tombol Go Live terkunci                                                                                                    |

## Temuan dan perbaikan selama sprint

1. **Test Studio memakai judul "gm" (2 karakter)**, sedangkan minimum 3. Test-nya yang salah; validasi server sudah benar.
2. **Fake adapter Solana menerima alamat `0x`**, sehingga test search membuat token palsu di chain lain. Fake diperketat ke base58 seperti adapter asli.
3. **Token room menampilkan "Could not load this token." untuk alamat tidak valid (400).** Sekarang menampilkan "Token not found on this chain."
4. **Teks profil menjanjikan "APECAM wallet" dari Studio** padahal bagian browser Privy belum dipasang. Teks dikoreksi.
5. **Role di JWT bisa basi** (user dipromosikan jadi moderator tetap dianggap user sampai login ulang). Sekarang role dibaca dari database di setiap request.

## Perubahan terhadap plan

- **Login ditolak untuk user yang diban** (sebelumnya hanya aksi tulis yang ditolak).
- **Hide token juga menghentikan stream live token itu.** Token yang disembunyikan tidak boleh punya panggung.
- **Moderator/admin tidak bisa diban dari panel.** Mencegah penyalahgunaan antar-moderator; perubahan role dilakukan admin langsung di database untuk MVP.
- **Report dikelompokkan per stream** di antrian admin, karena moderator bertindak per stream, bukan per laporan.

## Yang dibutuhkan untuk menutup Sprint 2

1. **Akun LiveKit** → T-S2-M1/M2/M3, E2E Studio dan moderasi (Sprint 4).
2. **App Privy** → spike S6, lalu pasang SDK browser untuk membuat wallet embedded otomatis di Studio (T-S2-M6/M7).
3. **Alchemy API key** → daftar token wallet EVM di Studio (tanpa key, Studio menawarkan paste CA).
4. **Bot Telegram + chat ID moderator** → T-S2-M9.
5. **Bucket R2** → upload avatar di staging.
