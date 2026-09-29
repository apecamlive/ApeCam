# ADR 001 — Robinhood Chain: RPC, indexing log, explorer

Status: **Diterima (dengan catatan)** · 2026-09-29 · Spike S1 · Script: `spikes/src/s1-robinhood.ts`, output `spikes/out/s1*.txt`

## Fakta jaringan (hasil ukur)

| Item                       | Nilai                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Chain ID                   | **4663** (`0x1237`)                                                                             |
| RPC publik                 | `https://rpc.mainnet.chain.robinhood.com` (Arbitrum Nitro `v3.12.0-rc.3`, origin Offchain Labs) |
| Explorer                   | `https://robinhoodchain.blockscout.com`                                                         |
| Waktu blok                 | **~0,1 detik** (≈ 10 blok/detik, ≈ 864.000 blok/hari)                                           |
| Block tag `safe`           | tertinggal ≈ 5.400 blok / **~9 menit**                                                          |
| Block tag `finalized`      | tertinggal ≈ 9.150 blok / **~15 menit**                                                         |
| Latensi RPC dari Indonesia | ~300 ms per call                                                                                |

## Temuan

1. **DNS `*.robinhood.com` diblokir ISP Indonesia.** DNS lokal mengembalikan IP halaman blokir (Internet Positif / internetsehatku), sehingga TLS gagal (`CERT_HAS_EXPIRED` / `ERR_TLS_CERT_ALTNAME_INVALID`). Lewat Cloudflare DoH, IP asli yang didapat (`customer-origin.offchainlabs.com`). Server Railway di region US **tidak terpengaruh**. Dampaknya:
   - Developer di Indonesia harus memakai DNS terenkripsi (DoH/DoT) atau VPN. Untuk script, pakai helper `spikes/src/doh.ts`.
   - **User di Indonesia** mungkin tidak bisa membuka link explorer/docs Robinhood. Aplikasi APECAM sendiri aman karena RPC dipanggil dari server.
2. **`eth_getLogs`:**
   - Maksimal **10.000 log per request** (`logs matched by query exceeds limit of 10000`).
   - Maksimal **10.000.000 blok per request** (≈ 11,5 hari).
   - Tanpa filter alamat, 1.000 blok saja sudah berisi ±10.000 Transfer. Dengan filter satu kontrak token, 5 juta blok hanya ±7.000 log (~430 ms).
   - RPC publik sempat menolak request berat yang beruntun (`RPC Request failed`), sedangkan burst 30 call ringan paralel lolos. Dokumentasi Robinhood menyebut endpoint publik **dibatasi dan tidak untuk production**.
3. **Blockscout API tidak bisa dipakai dari server.** Semua endpoint (`/api/v2/*` dan `/api?module=`) dilindungi Cloudflare challenge (HTTP 403 `cf-mitigated: challenge`), dengan atau tanpa User-Agent browser. Challenge bot **tidak boleh** di-bypass.
4. **Alchemy mendukung Robinhood Chain** (RPC + Token API + Transfers API). Dengan ini, API explorer tidak diperlukan lagi, baik untuk daftar token milik wallet (`alchemy_getTokenBalances`) maupun transfer ETH internal untuk mendeteksi buyback (`alchemy_getAssetTransfers` kategori `internal`). QuickNode juga tersedia.

## Keputusan

- **RPC production:** Alchemy (utama) + RPC publik Robinhood (cadangan). QuickNode sebagai opsi kedua.
- **Finalitas di `sync-tracker`:** "12 konfirmasi" diganti block tag **`safe`** (~9 menit), karena angka "12 blok" tidak bermakna di chain dengan blok 0,1 detik. Tracker boleh menampilkan data dari `latest` dengan label "pending", lalu menandainya final setelah melewati `safe`.
- **Jendela `eth_getLogs`:** filter per kontrak $APECAM, jendela awal **1.000.000 blok**, otomatis dibagi dua kalau kena batas 10.000 log. Job 5 menit hanya memproses ±3.000 blok baru, jauh di bawah batas.
- **Daftar token milik wallet (`listHoldings`):** Alchemy Token API. Blockscout tidak dipakai.
- **Buyback yang dibayar dengan ETH:** dideteksi lewat Alchemy Transfers API (kategori `internal` + `external`), bukan lewat explorer.
- **Link explorer di UI** tetap ke Blockscout (dibuka oleh browser user, bukan server).

## Belum terjawab (butuh akun)

- Batas range `eth_getLogs` dan rate limit Alchemy untuk Robinhood Chain → uji ulang setelah API key tersedia (S0-2).
- Kepastian `alchemy_getAssetTransfers` kategori `internal` aktif di Robinhood Chain.
