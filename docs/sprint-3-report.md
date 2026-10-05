# Laporan Sprint 3

Tanggal: 2026-09-29 · Branch: `sprint-2` (belum di-commit; berisi Sprint 2 + 3) · Acuan: `APECAM-Sprint-Tasks-and-Testing.md` bagian F

## Ringkasan

|                                                                                                     | Status                                                  |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Stream to Earn (menit valid, reward harian, payout mingguan, pencocokan payout)                     | ✅ Selesai, teruji otomatis                             |
| Burn & Buyback Tracker (parser, indexer, API, halaman `/burn`)                                      | ✅ Selesai, teruji otomatis dengan chain palsu          |
| UI (Studio progres earn, reward di profil, tab admin Payouts / Reconciliation / Config, strip Home) | ✅ Selesai, diuji manual                                |
| Uji dengan chain asli $APECAM                                                                       | ⛔ Menunggu contract + 5 alamat wallet dari owner (D17) |
| Uji menit valid dengan video asli                                                                   | ⛔ Menunggu LiveKit + R2                                |

Pipeline lokal: format ✅ · lint ✅ · typecheck 11/11 ✅ · **211 test otomatis lulus** (naik dari 162) · build web + worker ✅

## Status task

| Task                                          | Status | Catatan                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-1 Paket rewards                            | ✅     | `packages/rewards`: tier kumulatif D2/D3, cap 5.000, `nextTier`, skala pro-rata D6 (integer, dibulatkan ke bawah), konversi 18 desimal.                                                                                                                                                                                                     |
| S3-2 Penghitung menit + validasi video        | ✅     | `count-minutes` tiap menit: 5 syarat §8.1; viewer harus sign-in, bukan streamer, akun ≥ 24 jam, tidak diban; satu viewer hanya dikredit ke satu stream per menit. `frame-check` menggantikan `refresh-thumbnails`: thumbnail + deteksi hitam/beku; stream tanpa video valid 10 menit diakhiri (hanya jika egress snapshot memang berjalan). |
| S3-3 Tutup reward harian + API                | ✅     | `close-rewards` 00:10 UTC (cron BullMQ), menit unik per user (D15), idempoten, tidak menyentuh reward `batched`/`paid`. `/api/me/rewards`; status Studio berisi progres hari ini + alasan menit terakhir.                                                                                                                                   |
| S3-4 Payout mingguan                          | ✅     | Batch Senin–Minggu minggu lalu (+ reward pending lama), dikelompokkan per payout wallet, skala pro-rata terhadap saldo treasury on-chain, CSV `wallet,amount_raw,amount` (satu baris per wallet), void.                                                                                                                                     |
| S3-5 Parser tracker                           | ✅     | `packages/tracker`: buyback = $APECAM masuk ke buyback wallet dari luar + aset keluar di tx yang sama; burn = ke burn address / dead / 0x0 dari siapa pun; payout = keluar dari treasury ke luar wallet internal.                                                                                                                           |
| S3-6 Indexer + sync-payouts                   | ✅     | `sync-tracker` tiap 5 menit sampai block `safe` (ADR 001), cursor, backfill dari block deploy, jendela 1 juta block dibagi dua saat kena batas log. `sync-payouts` mencocokkan transfer treasury ke batch; ambigu → rekonsiliasi manual.                                                                                                    |
| S3-7 API tracker                              | ✅     | `summary` (termasuk 5 wallet + saldo, cek silang dengan chain), `daily`, `buybacks`, `burns`; cache 60 detik.                                                                                                                                                                                                                               |
| S3-8 Halaman `/burn`                          | ✅     | Angka besar, chart harian (SVG, tanpa library tambahan), tabel buyback/burn dengan link explorer, last buyback/burn, last synced, kartu kontrak + 5 wallet. Tampil "coming soon" sampai dikonfigurasi.                                                                                                                                      |
| S3-9 Reward di profil + Studio                | ✅     | Profil: riwayat per hari, status, tx payout, catatan skala. Studio: menit valid hari ini, progres ke tier berikutnya, alasan menit tidak dihitung.                                                                                                                                                                                          |
| S3-10 Admin Payouts / Reconciliation / Config | ✅     | Hanya admin (moderator tidak melihat tab ini). Config memvalidasi bentuk nilai dan mencatat before/after di log aksi.                                                                                                                                                                                                                       |
| S3-11 Strip burn di Home                      | ✅     | Data nyata; "tracker coming soon" sampai dikonfigurasi.                                                                                                                                                                                                                                                                                     |

## Hasil test

### Otomatis

| ID                                                                   | Hasil | Lokasi                                            |
| -------------------------------------------------------------------- | ----- | ------------------------------------------------- |
| T-S3-U1…U8 reward, pro-rata, konversi                                | ✅    | `packages/rewards/src/rewards.test.ts`            |
| T-S3-U9…U13 parser buyback/burn/transfer biasa                       | ✅    | `packages/tracker/src/tracker.test.ts`            |
| T-S3-U14 deteksi frame hitam/beku/bergerak                           | ✅    | `packages/core/src/sprint3.test.ts`               |
| T-S3-I1 tiap syarat gagal → menit tidak valid dengan flag yang benar | ✅    | core                                              |
| T-S3-I2 tab viewer milik streamer tidak dihitung                     | ✅    | core                                              |
| T-S3-I3 akun < 24 jam tidak dihitung                                 | ✅    | core                                              |
| T-S3-I4 satu viewer di dua stream hanya dihitung sekali              | ✅    | core                                              |
| T-S3-I5 `close-rewards` dua kali → satu reward                       | ✅    | core                                              |
| T-S3-I6 rentang minggu Senin–Minggu UTC                              | ✅    | core + route                                      |
| T-S3-I7 reward void tidak masuk batch                                | ✅    | core + route                                      |
| T-S3-I8 indexer berhenti lalu lanjut dari cursor tanpa duplikat      | ✅    | core                                              |
| T-S3-I9 block di atas `safe` belum diproses                          | ✅    | core (menggantikan "12 konfirmasi", ADR 001)      |
| T-S3-I10 transfer cocok → reward `paid` + tx hash, batch `paid`      | ✅    | core                                              |
| T-S3-I11 transfer ambigu/jumlah beda → rekonsiliasi manual           | ✅    | core                                              |
| T-S3-I12 total burn beda dengan chain → ditandai                     | ✅    | core (flag `burnIndexMatchesChain` + log warning) |
| T-S3-I13 moderator ubah config → 403                                 | ✅    | route                                             |
| T-S3-E1 `/burn` dengan data                                          | ⛔    | Playwright di Sprint 4 (S4-5)                     |

Tambahan: D15 (stream paralel dihitung sekali), reward `paid` tidak ditimpa, jendela log dibagi dua, tracker dilewati rapi sebelum dikonfigurasi, stream tanpa egress tidak diakhiri, 3 snapshot identik = video statis.

### Manual (browser lokal, build produksi)

| ID                                                                                     | Hasil                                                                                          |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| T-S3-M1…M3 menit valid / viewer kurang / layar hitam dengan video asli                 | ⛔ Butuh LiveKit + R2 (logikanya teruji otomatis)                                              |
| T-S3-M4…M8 payout, pro-rata, tracker vs explorer, 5 wallet, rekonsiliasi di chain asli | ⛔ Butuh contract + wallet $APECAM                                                             |
| T-S3-M9 strip Home                                                                     | ✅ "tracker coming soon" selama belum dikonfigurasi                                            |
| `/burn` belum dikonfigurasi                                                            | ✅ Pesan jelas, tanpa crash (setelah perbaikan bug #1 di bawah)                                |
| Profil: reward saya                                                                    | ✅ Pending 1,6K / paid 5K, catatan "scaled 80% (treasury)"                                     |
| Admin: tab                                                                             | ✅ Admin melihat 6 tab; tombol buat batch memberi pesan jelas saat kontrak belum dikonfigurasi |
| Admin: Config                                                                          | ✅ JSON tidak valid ditolak; simpan berhasil; tercatat `update_config` di log aksi             |

## Bug yang ditemukan dan diperbaiki

1. **Halaman crash saat retry tertahan (semua halaman berbasis query).** Komponen memeriksa `isLoading` lalu memakai `data!`. Saat React Query menjeda retry (tab di background, atau error 503 yang di-retry), status `pending` tapi tidak sedang fetch, sehingga `isLoading` false, `isError` false, dan `data` kosong → crash. Ditemukan di `/burn`; diperbaiki di 12 tempat dengan `isPending`.
2. **`/burn` me-retry error "belum dikonfigurasi".** Retry tidak ada gunanya untuk kondisi itu; sekarang langsung menampilkan pesan.
3. **Test yang tidak deterministik:** urutan dua stream yang mulai di detik yang sama bergantung pada UUID acak. Kode sudah benar (stream yang live lebih dulu mendapat viewer); test-nya dibuat deterministik.

## Perubahan terhadap plan

- **Finalitas:** "12 konfirmasi" diganti block tag `safe` (ADR 001). Indexer hanya membaca sampai `safe` (~9 menit tertinggal), sehingga tidak perlu menangani reorg.
- **CSV payout satu baris per wallet** (hari-hari seorang user dijumlahkan), supaya owner mengirim satu transfer per wallet dan pencocokan otomatis tetap tepat.
- **Skala pro-rata disimpan di reward** (`apecam_amount` sudah terskala + `scale_factor`), agar profil bisa menjelaskan kenapa jumlahnya berbeda.
- **Nilai USD buyback/burn = harga $APECAM saat diindeks** (§9). Jumlah aset yang dibelanjakan (ETH/WETH) dicatat persis dari chain; konversi ke USD per aset menyusul setelah alamat WETH Robinhood Chain dipastikan.
- **Umur viewer ≥ 24 jam dihitung dari akun** (tanggal sign-in pertama), bukan per wallet.
- **Video wajib untuk reward:** tanpa R2/Egress, `video_ok` selalu false sehingga tidak ada reward. Ini disengaja: lebih aman daripada membayar menit yang tidak bisa diverifikasi.

## Yang dibutuhkan untuk menutup Sprint 3

1. **Contract $APECAM + block deploy + 5 alamat wallet** (D17) → uji tracker dan payout di chain asli (T-S3-M4…M8).
2. **Alchemy API key untuk Robinhood Chain** → `alchemy_getAssetTransfers` (deteksi ETH yang dibelanjakan buyback).
3. **LiveKit + R2** → menit valid dengan video asli dan kalibrasi ambang frame (T-S3-M1…M3, ADR 004).
4. **Alamat WETH di Robinhood Chain** → nilai USD dari aset yang dibelanjakan.
