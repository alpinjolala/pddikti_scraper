# PDDIKTI Dosen Scraper

Ekstensi browser (Chrome / Microsoft Edge Manifest V3) untuk mengekstrak data dosen dari halaman **Detail Program Studi (`detail-prodi`)** pada situs [PDDIKTI Kemdiktisaintek](https://pddikti.kemdiktisaintek.go.id/).

## Fitur Utama

1. **Ambil Data dari Tabel Halaman (DOM + Auto-Pagination)**
   - Mendeteksi tabel dosen secara otomatis (beserta seluruh kolomnya dan link `/detail-dosen/...` jika tersedia).
   - Mendukung perpindahan halaman tabel (*auto-pagination*) otomatis dan penggabungan baris tanpa duplikasi.
   - Mendeteksi tab halaman (seperti tab Dosen / Tenaga Pendidik) agar mudah dibuka langsung dari popup.
2. **Penangkapan JSON API Otomatis (Passive Network Capture)**
   - Saat halaman PDDIKTI dimuat atau tab/semester diganti, ekstensi pasif menangkap respons JSON API yang memuat daftar dosen (jika aplikasi web memuat data via API).
   - Data JSON otomatis diratakan (*flatten*) sehingga seluruh field siap diekspor.
3. **Export Praktis**
   - **Export CSV** (UTF-8 BOM, siap dibuka langsung di Microsoft Excel).
   - **Export JSON** (lengkap dengan metadata prodi).
   - **Salin Excel (TSV)** ke clipboard untuk langsung di-paste (`Ctrl+V`) ke Excel atau Google Sheets.

## Cara Memasang Ekstensi (Chrome / Edge)

1. Buka browser **Google Chrome** atau **Microsoft Edge**.
2. Akses halaman ekstensi:
   - Chrome: ketik `chrome://extensions/` di address bar.
   - Edge: ketik `edge://extensions/` di address bar.
3. Aktifkan **Developer mode** (Mode pengembang) di pojok kanan atas (Chrome) atau kiri bawah (Edge).
4. Klik tombol **Load unpacked** (Muat yang belum dibuka).
5. Pilih folder proyek ini:
   `pddikti_scraper`

## Cara Menggunakan

1. Buka halaman Detail Prodi di PDDIKTI, misalnya:
   `https://pddikti.kemdiktisaintek.go.id/detail-prodi/XffXbf8Kkno5_unBlLWu9hnHeDB9vlw2KWTdzYuzWl69fYliOrtGEzaMuiw03Wo7-ACYxg==`
2. Tunggu halaman selesai dimuat, lalu pastikan bagian/tab **Tenaga Pendidik / Dosen** terlihat (Anda juga bisa klik tab dari dalam popup ekstensi).
3. Klik ikon ekstensi **PDDIKTI Dosen Scraper** di toolbar browser.
4. Pilih sumber data:
   - **Tabel Halaman**: pilih tabel dosen yang terdeteksi, centang *Auto-pagination* jika datanya lebih dari 1 halaman, lalu klik **Ambil Data Dosen**.
   - **Data JSON API Tertangkap** (opsional): jika tersedia dataset API di bagian 2, Anda bisa klik **Gunakan Data JSON API** untuk mengambil seluruh field mentah dari respons API.
5. Periksa preview data, lalu klik **Export CSV**, **Export JSON**, atau **Salin Excel**.

## Struktur File

- `manifest.json` — Konfigurasi ekstensi Manifest V3.
- `src/network-interceptor.js` — Script di `MAIN` world untuk menangkap respons JSON API secara pasif.
- `src/content.js` — Script di `ISOLATED` world untuk deteksi tab/tabel, auto-pagination, dan ekstraksi data.
- `src/export-utils.js` — Utilitas ekspor CSV, TSV, JSON, dan sanitasi nama file.
- `popup.html`, `popup.css`, `popup.js` — Antarmuka popup ekstensi.
- `icons/` — Ikon ekstensi (`16px`, `48px`, `128px`).

