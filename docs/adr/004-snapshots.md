# ADR 004 — Snapshot frame & deteksi video mati

Status: **Sebagian** · 2026-09-29 · Spike S4 · Script: `spikes/src/s4-frames.ts`, output `spikes/out/s4.txt`

## Yang sudah divalidasi (lokal)

Analisis memakai `sharp`: gambar 320×180 diperkecil menjadi 32×18 grayscale, lalu dihitung rata-rata kecerahan, deviasi, dan selisihnya dengan snapshot sebelumnya. Waktu proses 6–17 ms per gambar.

| Kasus                               | Hasil                   | Benar? |
| ----------------------------------- | ----------------------- | ------ |
| Hitam total                         | mean 0, stdev 0 → hitam | ✅     |
| Kamera ditutup (noise sensor kecil) | mean 3 → hitam          | ✅     |
| Abu-abu polos (slide statis)        | mean 120 → bukan hitam  | ✅     |
| Frame sama dua kali (layar beku)    | diff 0 → statis         | ✅     |
| Dua frame live berbeda              | diff 4,5 → bergerak     | ✅     |

**Aturan awal:** hitam = `mean < 10 && stdev < 5`; statis = `diff < 0,5` selama 3 snapshot berturut-turut. **Ambang ini harus dikalibrasi ulang dengan snapshot asli dari LiveKit Egress**, karena gambar sintetis tidak mewakili kompresi dan noise kamera sungguhan.

**Catatan produk:** screen share yang benar-benar diam (slide yang tidak berubah sama sekali) akan dianggap statis, sehingga menitnya tidak valid. Ini sesuai tujuan anti-farming, tapi perlu dijelaskan di halaman Rules dan Studio.

## Belum dikerjakan (butuh akun)

- LiveKit Egress image output → upload ke Cloudflare R2 (butuh proyek LiveKit + bucket R2).
