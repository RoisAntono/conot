# Data Schema Notes

## Current Version

- `dataVersion`: `4`

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

## Rollback Notes

- Sebelum rollback versi kode, restore file dari `data/backups`.
- Hindari menjalankan binary lama ke schema baru tanpa restore backup.
- Jika rollback dibutuhkan:
  1. Stop bot.
  2. Restore backup terakhir yang kompatibel.
  3. Jalankan versi aplikasi target.
