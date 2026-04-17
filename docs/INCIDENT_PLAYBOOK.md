# Incident Playbook

## 1) RSS 404 / ENOTFOUND / Timeout

### Gejala

- Log `RSS YouTube gagal dimuat`
- Status code `404` atau DNS error (`ENOTFOUND`, `EAI_AGAIN`)

### Tindakan

1. Cek koneksi host/server.
2. Verifikasi channel ID tracker.
3. Jika tracker berbasis handle dan channel berubah, jalankan `updatechannel --refresh-source`.
4. Pantau canary status di command `health`.

## 2) Notifikasi tidak terkirim ke Discord

### Gejala

- Log `Notifikasi tracker/title watch gagal dikirim`
- Diagnosis menunjukkan missing permissions

### Tindakan

1. Cek permission bot di channel target:
   - View Channel
   - Send Messages
   - Embed Links
2. Pastikan role ping masih ada/valid.
3. Uji kirim ulang setelah permission diperbaiki.

## 3) Slash command hilang

### Gejala

- `/addchannel` tidak muncul

### Tindakan

1. Cek bot online (`ready` event).
2. Pastikan scope invite termasuk `applications.commands`.
3. Restart bot agar registrasi ulang command.

## 4) data.json rusak

### Gejala

- Parser error saat startup
- Bot membuat backup `.broken-*`

### Tindakan

1. Stop bot.
2. Restore backup stabil:
   - `npm run backup:restore:latest`
3. Start ulang bot dan verifikasi `health`.

## 5) Stabilitas operasi

- Jalankan `npm run backup:drill` secara berkala.
- Gunakan PM2/system service untuk auto-restart.
- Aktifkan log channel + external log webhook.
