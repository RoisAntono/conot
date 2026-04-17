# Conot

Bot Discord modular untuk notifikasi YouTube berbasis `Node.js` dan `discord.js v14`, tanpa `YouTube Data API v3`.

Conot ditujukan untuk komunitas yang butuh notifikasi YouTube yang ringan, gratis, fleksibel, dan mudah dirawat.

## Legal

- [Terms of Service](TERMS_OF_SERVICE.md)
- [Privacy Policy](PRIVACY_POLICY.md)
- [License](LICENSE)

## Key Features

- Tracker channel YouTube berbasis RSS resmi
- Slash command dan prefix command
- Prefix kustom per server, default `?n`
- Filter konten: `all`, `video`, `shorts`, `live*`, `premiere*`
- Filter judul multi-keyword
- Title watch global berbasis keyword judul
- Custom message + ping role
- Layout embed `compact` dan `rich`
- Source tracker terkunci ke channel ID awal (anti drift), dengan opsi refresh eksplisit saat update
- Setup preview saat add tracker/title watch
- Log channel user (ringkas) + dev log global (detail)
- Polling RSS multi-item untuk mengurangi risiko miss saat burst upload
- Dedupe state + guard anti-spam
- Retry/backoff untuk RSS dan scraping YouTube
- Backup otomatis `data.json` + retensi backup
- Canary scheduler untuk mendeteksi dini kegagalan scraping YouTube
- Migrasi schema `data.json` otomatis via `dataVersion`
- Limit skala per guild (tracker/title watch) untuk mencegah abuse
- Guard whitelist guild dan whitelist user yang bisa diaktifkan sesuai kebutuhan
- Health/status command untuk cek runtime, poller, konfigurasi guild, memory usage, dan ukuran `data.json`
- Detail health internal (storage/backup/canary/guard) hanya tampil untuk owner instance
- Automated tests dasar via `node:test`

## Tech Stack

- `Node.js >= 20.10.0`
- `discord.js v14`
- `axios`
- `rss-parser`
- `fs` untuk file database JSON

## Project Structure

```text
Conot/
|-- data/
|   `-- data.json
|-- src/
|   |-- commands/
|   |-- config/
|   |-- events/
|   |-- services/
|   |-- utils/
|   `-- index.js
|-- .env.example
|-- package.json
|-- PRIVACY_POLICY.md
|-- README.md
`-- TERMS_OF_SERVICE.md
```

## Quick Start

### 1. Install

```bash
npm install
```

### 1.5. Run basic tests

```bash
npm run lint
npm test
npm run test:coverage
npm run lint:secrets
```

### 2. Configure `.env`

```env
DISCORD_TOKEN=your_discord_bot_token
GUILD_ID=
BOT_OWNER_IDS=123456789012345678
GUARD_GUILD_WHITELIST_ENABLED=false
GUARD_USER_WHITELIST_ENABLED=false
GUARD_LEAVE_UNAUTHORIZED_GUILDS=false
GUARD_GUILD_IDS=
GUARD_USER_IDS=
DATA_BACKUP_INTERVAL_MS=21600000
DATA_BACKUP_RETENTION=30
HTTP_RETRY_ATTEMPTS=3
RSS_RETRY_ATTEMPTS=3
RETRY_BASE_DELAY_MS=750
NOTIFICATION_HISTORY_WINDOW_MS=86400000
RSS_FAILURE_LOG_THRESHOLD=3
RSS_FAILURE_LOG_REPEAT_EVERY=6
RSS_RECENT_VIDEOS_LIMIT=5
MAX_TRACKERS_PER_GUILD=100
MAX_TITLE_WATCHES_PER_GUILD=50
CANARY_ENABLED=false
CANARY_HANDLES=
CANARY_INTERVAL_MS=1800000
CANARY_FAILURE_THRESHOLD=3
EXTERNAL_LOG_WEBHOOK_URL=
SENSITIVE_COMMAND_BUCKET_RATE_LIMIT_MS=10000
```

Catatan:

- `DISCORD_TOKEN` wajib
- `GUILD_ID` opsional
- isi `GUILD_ID` jika ingin registrasi slash command lebih cepat ke satu server
- `BOT_OWNER_IDS` dipakai untuk owner instance yang boleh mengatur whitelist dan dev log global
- `GUARD_*` opsional untuk bootstrap whitelist dari environment
- jika `GUARD_USER_WHITELIST_ENABLED=true`, minimal isi satu owner di `BOT_OWNER_IDS`/`OWNER_USER_IDS` agar tidak lockout
- `DATA_BACKUP_*` opsional untuk jadwal backup data lokal
- `HTTP_RETRY_ATTEMPTS` dan `RSS_RETRY_ATTEMPTS` opsional untuk ketahanan jaringan
- `NOTIFICATION_HISTORY_WINDOW_MS` untuk guard tambahan dedupe signature notifikasi
- `RSS_FAILURE_LOG_*` untuk menahan spam log RSS saat error sementara
- `RSS_RECENT_VIDEOS_LIMIT` untuk jumlah item RSS terbaru yang dipindai per siklus (anti-miss)
- `MAX_TRACKERS_PER_GUILD` dan `MAX_TITLE_WATCHES_PER_GUILD` untuk batas skala per guild
- `CANARY_*` untuk pemantauan health scraping YouTube
- `EXTERNAL_LOG_WEBHOOK_URL` opsional untuk kirim log warn/error ke sistem observability eksternal
- validasi `.env` berjalan saat startup; token placeholder (`your_discord_bot_token`) atau format nilai salah akan fail-fast dengan pesan error detail

### 3. Enable Discord intent

Aktifkan `Message Content Intent` jika ingin memakai prefix command.

### 4. Run

```bash
npm run dev
```

atau:

```bash
npm start
```

### 5. Run dengan PM2 (disarankan untuk produksi)

```bash
npm run start:pm2
npm run pm2:logs
npm run backup:drill
npm run backup:restore:latest
npm run backup:restore:dry-run
```

## Recommended Setup

```text
?n setlogchannel #bot-logs
?n addchannel @WindahBasudara #youtube-updates
?n addtitlewatch dr gia #title-watch --days 3
?n listchannels
?n listtitlewatches
```

## Commands

### General

| Command | Prefix | Slash |
|---|---|---|
| Help | `?n help` | `/help` |
| About | `?n about` | `/about` |
| Health | `?n health` | `/health` |

### Tracker

| Command | Prefix | Slash |
|---|---|---|
| Add channel | `?n addchannel` | `/addchannel` |
| Update channel | `?n updatechannel` | `/updatechannel` |
| Remove channel | `?n removechannel` | `/removechannel` |
| List channels | `?n listchannels` | `/listchannels` |
| Set layout | `?n setlayout` | `/setlayout` |

### Title Watch

| Command | Prefix | Slash |
|---|---|---|
| Add title watch | `?n addtitlewatch` | `/addtitlewatch` |
| Remove title watch | `?n removetitlewatch` | `/removetitlewatch` |
| List title watches | `?n listtitlewatches` | `/listtitlewatches` |

### Settings

| Command | Prefix | Slash |
|---|---|---|
| Set prefix | `?n setprefix` | `/setprefix` |
| Set log channel | `?n setlogchannel` | `/setlogchannel` |
| Set preview on add | `?n setpreviewonadd` | `/setpreviewonadd` |

### Owner Guard

| Command | Prefix | Slash |
|---|---|---|
| Set guard mode | `?n setguard` | `/setguard` |
| Set dev log channel | `?n setdevlogchannel` | `/setdevlogchannel` |
| Whitelist guild | `?n whitelistguild` | `/whitelistguild` |
| Whitelist user | `?n whitelistuser` | `/whitelistuser` |

## Examples

```text
?n addchannel @DeddyCorbuzier #podcast-updates @Subscriber video --layout compact --title "Praz Teguh, Habib Jafar" --message "Ada video baru dari {channel}!"
?n updatechannel @LuthfiHalimawan #live-alert @Subscriber live_now --layout rich
?n updatechannel @LuthfiHalimawan --refresh-source
?n addtitlewatch dr gia #alert-judul --days 3
?n setlogchannel #bot-logs
?n health
?n setguard guild on user on leave off
?n setdevlogchannel #conot-devlog
?n whitelistguild add 123456789012345678
?n whitelistuser add 987654321098765432
```

## Notification Format

Default custom message:

```text
Ada video baru dari {channel}!
```

Placeholder:

- `{channel}`
- `{title}`
- `{link}`
- `{type}`

Catatan:

- Custom message tampil di atas embed
- Mention role, jika ada, dikirim di luar embed
- Embed menampilkan judul, channel, jenis konten, link, thumbnail, dan waktu penting

## Content Filters

| Filter | Keterangan |
|---|---|
| `all` | Semua konten |
| `video` | Video panjang / upload biasa |
| `shorts` | Shorts |
| `live` | Semua kategori live |
| `live_upcoming` | Live akan datang |
| `live_now` | Sedang live |
| `live_replay` | Replay live |
| `premiere` | Semua kategori premiere |
| `premiere_upcoming` | Premiere akan datang |
| `premiere_published` | Premiere sudah tayang |

Catatan:

- `long` masih didukung sebagai alias lama untuk `video`
- filter title memakai `ANY match`
- title watch default mencari hasil maksimal `3 hari` terakhir

## Troubleshooting

### Slash command tidak muncul

1. Pastikan bot online dan event `ready` berjalan
2. Pastikan invite memakai scope `applications.commands`
3. Pastikan `GUILD_ID` valid jika dipakai
4. Restart bot setelah mengubah konfigurasi command

### Prefix command tidak terbaca

- pastikan `Message Content Intent` aktif
- format prefix harus memakai spasi, contoh: `?n addchannel`

### Notifikasi gagal terkirim

- atur log channel dengan `?n setlogchannel #bot-logs`
- cek permission bot di channel target
- cek apakah channel/role target masih valid
- jika error 404 dari RSS, cek tracker masih ke channel yang benar (gunakan update dengan `--refresh-source` bila handle berubah)

### Cek status bot

- jalankan `?n health` atau `/health`
- cek status poller, backup, canary, konfigurasi guard, memory usage, dan ukuran `data.json`

## Access Guard

Conot mendukung guard fleksibel untuk membatasi abuse pada level instance:

- `guild whitelist`
  Bot hanya aktif di guild yang masuk whitelist
- `user whitelist`
  Hanya user tertentu yang boleh menjalankan command
- `auto leave unauthorized guilds`
  Bot otomatis keluar dari guild yang tidak diizinkan

Contoh:

```text
?n setguard guild on user on leave off
?n whitelistguild add 123456789012345678
?n whitelistuser add 987654321098765432
?n whitelistguild list
?n whitelistuser list
```

Catatan:

- command guard hanya bisa dipakai oleh `BOT_OWNER_IDS`
- owner tetap bisa bypass guard untuk kebutuhan bootstrap
- jika guard guild aktif, poller dan notifikasi hanya berjalan untuk guild yang di-whitelist

## Data Storage

Data disimpan di:

```text
data/data.json
```

Catatan:
- `data/data.json` adalah file runtime lokal (disarankan tidak dikomit).
- Bot akan membuat file ini otomatis saat pertama kali dijalankan jika belum ada.

Backup otomatis disimpan di:

```text
data/backups/
```

Schema data dan catatan rollback:

- [docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md)
- [docs/INCIDENT_PLAYBOOK.md](docs/INCIDENT_PLAYBOOK.md)

Struktur inti:

```json
{
  "globalSettings": {
    "accessControl": {
      "guildWhitelistEnabled": false,
      "userWhitelistEnabled": false,
      "leaveUnauthorizedGuilds": false,
      "whitelistGuildIds": [],
      "whitelistUserIds": []
    },
    "logging": {
      "devLogChannelId": null,
      "devLogLevel": "warn",
      "userIncludeErrorStack": false
    }
  },
  "guildSettings": [],
  "trackedChannels": []
}
```

## Notes

- Sumber video tracker memakai RSS resmi YouTube
- Resolve `channelId` dan title watch memakai scraping ringan
- Bot tidak memakai YouTube Data API v3
- Akurasi title watch dan klasifikasi konten tetap bergantung pada data publik YouTube

## Contributing

Jika proyek ini dibuka sebagai open source, arah kontribusi yang paling relevan:

- peningkatan akurasi deteksi konten
- peningkatan stabilitas scraping dan polling
- peningkatan UX command dan embed
- peningkatan logging dan observability

Jaga karakter proyek tetap:

- ringan
- modular
- tanpa YouTube Data API

Panduan kontribusi lengkap ada di [CONTRIBUTING.md](CONTRIBUTING.md).

## Testing

Proyek ini memakai test dasar bawaan Node:

```bash
npm run lint
npm test
npm run test:coverage
npm run lint:secrets
```

Scope test saat ini:

- parser prefix
- filter konten
- filter judul
- rate-limit command
- integration flow addchannel + notification payload
- integration poll-cycle (authorized/unauthorized guard path)
- integration poll-cycle permission failure path (preflight permission/channel access)
- backup/restore drill script parser + dry-run validation
