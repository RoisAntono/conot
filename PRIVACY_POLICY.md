# Privacy Policy

Tanggal berlaku: 14 April 2026

Dokumen ini menjelaskan pendekatan privasi umum untuk perangkat lunak dan/atau instance bot Discord **Conot** ("Software"). Karena Conot dapat bersifat open source, di-fork, dimodifikasi, dan di-self-host oleh pihak yang berbeda-beda, praktik aktual dapat berbeda antar-deployment.

Jika Anda menggunakan instance Conot yang dijalankan pihak lain, maka operator instance tersebut dapat memiliki kebijakan privasi tambahan atau berbeda.

## 1. Prinsip Umum

Conot dirancang untuk menyimpan data seminimal mungkin agar fitur inti bot dapat berjalan.

Namun, karena source code dapat dimodifikasi:

- maintainer, kontributor, atau operator instance lain dapat mengubah data yang diproses
- metode penyimpanan dapat berbeda antar deployment
- fitur tambahan dapat menambah ruang lingkup data yang dipakai

Karena itu, untuk deployment publik, operator instance sebaiknya mempublikasikan kebijakan privasi versi mereka sendiri jika perilaku bot telah diubah.

## 2. Data yang Umumnya Digunakan oleh Proyek Ini

Pada implementasi dasar proyek ini, Software dapat menyimpan atau memproses data seperti:

- `guildId` atau ID server Discord
- `channelId` untuk channel target notifikasi
- `roleId` untuk role mention
- prefix bot per server
- konfigurasi tracker channel YouTube
- konfigurasi title watch keyword
- pengaturan layout embed
- pengaturan preview on add
- pengaturan log channel
- status video terakhir seperti `lastVideoId`, `lastPublishedAt`, `lastContentState`, dan riwayat dedup seperlunya

Software juga dapat memproses data publik dari YouTube, seperti:

- handle channel
- channel ID YouTube
- judul video
- link video
- thumbnail
- metadata publik konten yang tersedia melalui RSS atau halaman publik

## 3. Data yang Umumnya Tidak Ditujukan untuk Dikumpulkan

Pada implementasi dasar proyek ini, Software tidak ditujukan untuk menyimpan:

- password
- token akun pengguna
- data pembayaran
- isi DM pengguna
- email pribadi pengguna Discord
- isi percakapan server secara umum selain yang diperlukan untuk mendeteksi dan mengeksekusi command

Namun, operator instance atau fork lain dapat mengubah implementasi tersebut. Karena itu, pengguna sebaiknya meninjau dokumentasi deployment yang mereka gunakan.

## 4. Message Content dan Prefix Command

Jika prefix command diaktifkan, Software perlu membaca isi pesan yang relevan untuk mendeteksi command seperti:

- `?n help`
- `?n addchannel`
- `?n addtitlewatch`

Pada implementasi dasar, pembacaan ini dilakukan hanya sejauh diperlukan untuk memproses command. Software tidak ditujukan untuk melakukan profiling percakapan server.

## 5. Tujuan Penggunaan Data

Secara umum, data digunakan untuk:

- menjalankan notifikasi YouTube
- menyimpan konfigurasi server
- mencegah notifikasi ganda
- menampilkan preview setup
- membantu logging operasional
- membantu admin memahami error, permission issue, atau kegagalan kirim notifikasi

## 6. Penyimpanan Data

Pada implementasi dasar proyek ini, data dapat disimpan secara lokal, misalnya pada:

- `data/data.json`

Namun, deployment lain dapat memakai:

- database lokal
- database remote
- object storage
- cache service
- penyimpanan lain sesuai desain operator instance

## 7. Berbagi Data

Source code dasar ini tidak ditujukan untuk menjual data pengguna atau data server.

Dalam operasional normal, data dapat terlihat atau diproses oleh:

- operator instance bot
- penyedia infrastruktur tempat bot dijalankan
- Discord, saat Software mengirim atau menerima event sesuai API Discord
- YouTube, saat Software mengambil data publik dari RSS, halaman channel, atau hasil pencarian publik

Jika sebuah fork menambahkan layanan lain, ruang lingkup pemrosesan data dapat ikut berubah.

## 8. Retensi Data

Pada implementasi dasar, data biasanya disimpan selama masih diperlukan untuk fungsi bot, misalnya sampai:

- tracker dihapus
- title watch dihapus
- konfigurasi server diubah atau dihapus
- bot dikeluarkan dari server
- operator instance membersihkan data

Masa retensi aktual bergantung pada deployment masing-masing.

## 9. Hak Admin Server dan Pengguna

Dalam implementasi dasar, admin server umumnya dapat mengendalikan sebagian besar data bot dengan cara:

- menghapus tracker
- menghapus title watch
- mengubah prefix, layout, log channel, dan pengaturan lain
- mengeluarkan bot dari server

Untuk permintaan penghapusan data formal, pengguna perlu menghubungi operator instance yang mereka gunakan, bukan sekadar merujuk pada source code proyek ini.

## 10. Keamanan

Proyek ini berupaya membatasi penyimpanan data ke lingkup minimum yang relevan. Namun:

- tidak ada sistem yang dapat dijamin 100% aman
- self-hosted deployment dapat memiliki tingkat keamanan yang berbeda-beda
- fork pihak ketiga dapat menambah risiko yang tidak tercakup oleh implementasi dasar

Jangan gunakan Software untuk menyimpan data sensitif.

## 11. Deployment Pihak Ketiga dan Fork

Karena proyek ini dapat di-fork atau di-host oleh pihak lain:

- maintainer asli tidak selalu mengendalikan bagaimana data diproses pada setiap instance
- operator instance bertanggung jawab atas praktik privasi deployment mereka sendiri
- pengguna sebaiknya memeriksa dokumentasi, kontak, dan kebijakan dari operator instance yang mereka gunakan

## 12. Perubahan Dokumen

Privacy Policy ini dapat diperbarui sewaktu-waktu untuk mencerminkan perubahan proyek inti. Operator instance disarankan untuk menyesuaikan dokumen ini dengan deployment mereka masing-masing sebelum dipublikasikan.

## 13. Kontak

Bagian kontak sebaiknya diisi oleh operator instance atau maintainer yang mempublikasikan deployment tertentu.

Contoh:

- Email: `privacy@example.com`
- Discord: `yourname`
- Support Server: `https://discord.gg/your-server`
