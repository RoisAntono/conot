# Data Schema Notes

## Current Version

- `dataVersion`: `5`

## Migration Strategy

- Startup akan membaca `data/data.json`.
- Jika `dataVersion` lebih lama, bot menjalankan migrasi otomatis.
- Setelah migrasi sukses, file ditulis ulang dalam schema terbaru.

## Version 2 Highlights

- Standarisasi `globalSettings.accessControl`.
- Standarisasi `titleWatches` per guild.
- Normalisasi `notifications.titleFilters` pada tracker.

## Version 3 Highlights

- Menambahkan `globalSettings.logging` untuk pemisahan user log dan dev log.
- Menambahkan `guildSettings[].logLevel` untuk kontrol verbosity log per guild.

## Version 4 Highlights

- Menambahkan `trackedChannels[].recentSeenVideoIds`.
- Polling tracker kini bisa mendeteksi beberapa video terbaru dalam satu siklus (window RSS), bukan hanya item pertama.

## Version 5 Highlights

- Menambahkan `notificationHistory[]` untuk riwayat delivery notifikasi tracker/title watch.
- Menjaga kompatibilitas data `guildLogs` dan `auditLogs` saat bot menulis `data.json`.

## Runtime Timestamp Semantics

- `trackedChannels[].configUpdatedAt`: perubahan konfigurasi tracker terakhir.
- `trackedChannels[].stateUpdatedAt`: perubahan state runtime tracker terakhir.
- `trackedChannels[].lastCheckedAt`: poll/check RSS tracker terakhir yang berhasil.
- `trackedChannels[].updatedAt`: field legacy/backward-compatible; UI baru tidak memakai field ini sebagai label generik.
- `guildSettings[].titleWatches[].configUpdatedAt`: perubahan konfigurasi title watch terakhir.
- `guildSettings[].titleWatches[].stateUpdatedAt`: perubahan state runtime title watch terakhir.
- `guildSettings[].titleWatches[].lastMatchedAt`: waktu terakhir search result title watch diproses sebagai match/history state.

## Rollback Notes

- Sebelum rollback versi kode, restore file dari `data/backups`.
- Hindari menjalankan binary lama ke schema baru tanpa restore backup.
- Jika rollback dibutuhkan:
  1. Stop bot.
  2. Restore backup terakhir yang kompatibel.
  3. Jalankan versi aplikasi target.
