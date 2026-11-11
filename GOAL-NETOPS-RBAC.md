# Goal & Blueprint: NetOps, RBAC, dan Integrasi WhatsApp di DeepSeek-Harness

Dokumen ini mendefinisikan arsitektur, sasaran, spesifikasi teknis, serta tahapan implementasi untuk mentransformasi `deepseek-harness` menjadi **Asisten Operasional Jaringan (NetOps)** dan **Asisten Customer Service (CS)** yang aman, terintegrasi penuh dengan ekosistem **Polyglot**, beroperasi secara multi-user dengan **RBAC**, serta menerapkan prinsip **Zero-Trust**.

---

## 1. Latar Belakang & Prinsip Utama

### Latar Belakang
`deepseek-harness` bawaan upstream dirancang sebagai harness lokal untuk developer perangkat lunak (single-user IDE mode) dengan akses penuh ke shell mesin host, file lokal, dan akun personal DeepSeek Platform (topup/balance). Dalam ekosistem ISP/RT-RW Net **Polyglot**, harness ini perlu dialihfungsikan menjadi:
1. **Asisten Teknisi Jaringan (NetOps):** Membantu observasi, diagnosa, dan otomasi konfigurasi MikroTik RouterOS, OLT (ZTE/Huawei), dan Switch.
2. **Asisten Layanan Pelanggan (CS/Helpdesk via WhatsApp):** Membantu menjawab keluhan pelanggan secara otomatis dan melakukan pengecekan redaman/status internet.

### Prinsip Utama
1. **Zero-Trust Host Execution:** Server host tidak boleh dieksekusi secara sembarangan oleh LLM. Akses shell lokal (`bash`/`pwsh`) dan mutasi file sistem dinonaktifkan secara default.
2. **Separation of Concerns:** Gateway WhatsApp dan otentikasi pengguna tetap dimiliki sepenuhnya oleh backend **Polyglot (Go)**. Harness hanya bertindak sebagai *reasoning & decision engine*.
3. **Data Isolation (Multi-User):** Setiap teknisi atau CS hanya memiliki akses ke sesi dan riwayat percakapan miliknya sendiri.
4. **Role-Based Access Control (RBAC):** Hak eksekusi tool dan visibilitas menu UI dibatasi berdasarkan peran pengguna di Polyglot (`admin`, `technician`, `cs`, `customer`).

---

## 2. Penyesuaian Plugin: Disabled by Default

Kemampuan yang tidak berhubungan dengan jaringan atau berisiko tinggi terhadap keamanan host **tidak dihapus secara permanen**, melainkan dijadikan plugin biasa dengan konfigurasi bawaan `disabled: true`.

### A. Plugin yang Dinonaktifkan secara Default
| Plugin ID | Paket Plugin | Alasan Keamanan / Fungsional |
| :--- | :--- | :--- |
| `shell` | `@deepseek-ai/dsh-tool-bash` | Mencegah eksekusi perintah shell sembarangan di OS host |
| `pwsh` | `@deepseek-ai/dsh-tool-pwsh` | Mencegah eksekusi PowerShell di OS host |
| `fs` (write/patch) | `@deepseek-ai/dsh-tool-fs` | Dibatasi hanya *read-only* atau dinonaktifkan untuk mutasi file lokal host |
| `office-*` / `convert-*` | Berbagai tool office upstream | Tidak relevan dengan operasional jaringan |
| `git-*` / `code-review-*` | Developer coding tools | Mengurangi beban token konteks dan permukaan serangan |
| `preset-ptc` / `cordis` | Preset koding internal | Menghindari teknisi salah memilih lingkungan kerja |

### B. Plugin Inti yang Dipertahankan & Ditingkatkan
* `@deepseek-ai/dsh-netops-app`: Bundle utama antarmuka NetOps dan Device Workspace.
* `@deepseek-ai/dsh-api-device-controller`: Integrasi inventaris perangkat dari Polyglot.
* `@deepseek-ai/dsh-device-context`: Injeksi konteks perangkat otomatis ke prompt model.
* `mcp-client` / `mcp-manager`: Koneksi ke MCP Server Polyglot (`routeros_*`, `olt_*`, `mikhmon_*`).
* `tool-ask-user`, `tool-todo`, `plan-mode`, `compaction`: Fitur interaksi dan efisiensi percakapan.

### C. Mekanisme Kontrol UI vs Konfigurasi (Hasil Analisis Mendalam)
Berdasarkan analisis arsitektur DeepSeek-Harness:
1. **Di Settings → Built-in plugins:** Halaman ini murni bersifat **Read-Only Inventory**. Sistem hanya menampilkan daftar plugin dan status aktifnya tanpa tombol kontrol untuk mencegah pengguna merusak runtime inti.
2. **Di Sidebar → Plugins (Plugin Manager):** Tombol Switch ON/OFF bawaan hanya aktif untuk **Bundle Opsional / Experimental Plugins**. Baris plugin bawaan (*built-in rows*) dan plugin yang dideklarasikan di dalam *Agent Presets* dikunci (`locked`) dengan status `readOnlyReason: 'management-required'` atau `'unaddressable'`.
3. **Solusi untuk Mengatur On/Off:**
   * **Level Konfigurasi (Bawaan):** Mengatur `disabled: true` langsung pada deklarasi `cordis.patch.yml` dan `preset-standard`. Ini adalah jalur paling stabil dan aman.
   * **Level UI untuk Admin (Solusi yang Tepat):** Alih-alih membongkar mekanisme internal Cordis Plugin Manager yang terkunci, kita dapat menyediakan **Permission / Feature Toggle di Settings NetOps** (khusus role Admin). Toggle ini mengatur izin eksekusi di `approval-guard.ts` (misalnya: saklar *"Izinkan Shell Host Darurat"*). Jika saklar ini dimatikan oleh Admin, tool bash langsung diblokir secara dinamis tanpa perlu me-restart server.

---

## 3. Integrasi WhatsApp (CS & Helpdesk Assistant)

### Arsitektur Alur Pesan
```
[ WhatsApp Pelanggan ]
         │
         ▼
[ Polyglot Go Backend ]  <─── Gateway Otoritatif (whatsmeow, QR pairing, DB pesan)
         │
         ├──► 1. Identity Resolver: deteksi nomor HP pelanggan / teknisi
         │
         ├──► 2. Forward ke DeepSeek-Harness Session (Headless/REST)
         │           │
         │           ▼
         │    [ Harness CS Preset ]
         │    - Analisis keluhan pelanggan
         │    - Panggil MCP Read-Only: cek status ONT, redaman, paket aktif
         │    - Formulasikan respon ramah dan solutif
         │           │
         │           ▼
         └──◄ 3. Kirim kembali jawaban ke pelanggan via Polyglot WA REST API
```

### Aturan Keamanan CS WhatsApp:
1. **Strictly Read-Only:** Preset CS sama sekali tidak memiliki akses ke tool mutasi konfigurasi router (`routeros_run` tidak boleh dipanggil untuk write).
2. **Koneksi WhatsApp Terpusat:** Pengelolaan pairing WhatsApp, multi-device, dan status koneksi tetap di Web Polyglot. DeepSeek-Harness tidak menjalankan socket WhatsApp mandiri.

---

## 4. Otentikasi & RBAC (Role-Based Access Control)

### Alur Otentikasi Terpadu (Single Sign-On / Shared JWT)
1. Pengguna login di Web Polyglot menggunakan username & password.
2. Web Polyglot menerbitkan JWT Access Token yang memuat klaim:
   ```json
   {
     "user_id": "usr_1029",
     "username": "budi_teknisi",
     "role": "technician"
   }
   ```
3. Saat pengguna membuka antarmuka DeepSeek-Harness, token JWT ini dikirimkan via Cookie atau header HTTP `Authorization: Bearer <token>`.
4. Webserver DeepSeek-Harness memverifikasi tanda tangan JWT menggunakan `JWT_SECRET` yang dibagikan bersama backend Polyglot.

### Matriks Kewenangan Berdasarkan Peran (Role Matrix)
| Fitur / Tindakan | Admin | Technician | Customer Service (CS) |
| :--- | :---: | :---: | :---: |
| **Device Status / Ping / Traceroute** | ✅ Langsung | ✅ Langsung | ✅ Langsung |
| **Mutasi Konfigurasi Router (`routeros_run`)** | ✅ Otomatis / Approval | ⚠️ Wajib Approval (*Ask*) | ❌ Ditolak Keras |
| **Registrasi ONU / OLT Mutation** | ✅ Langsung | ⚠️ Wajib Approval (*Ask*) | ❌ Ditolak Keras |
| **Akses Shell Host Server (`bash`)** | ⚠️ Jika di-enable | ❌ Dilarang | ❌ Dilarang |
| **Menu Topup & Token Balance** | ✅ Muncul di Settings | ❌ Disembunyikan | ❌ Disembunyikan |
| **Lihat Riwayat Sesi (Chat History)** | ✅ Semua Akun (Audit) | 🔒 Hanya Milik Sendiri | 🔒 Hanya Milik Sendiri |

### Mekanisme Pengamanan Tool (`approval-guard.ts`)
Di dalam `packages/bundle/netops-app/src/approval-guard.ts`, evaluasi izin disesuaikan dengan konteks peran:
* Jika user role adalah `cs` dan memanggil tool bertipe mutasi (`isDeviceTool(name)` dengan operasi write), guard langsung mengembalikan penolakan (`reject`).
* Jika user role adalah `technician`, guard mewajibkan konfirmasi eksplisit (`ask`).

---

## 5. Pemisahan Data & Sesi per Akun (Per-User Isolation)

### Masalah Saat Ini
DeepSeek-Harness bawaan upstream menyimpan seluruh sesi ke dalam direktori tunggal tanpa atribut pemilik:
`~/.dsh/session-logs/<session-id>.jsonl`

### Solusi Pemisahan Sesi:
1. **Metadata Kepemilikan Sesi:**
   Setiap pembuatan sesi baru (`createSession`) menyematkan `ownerId: user.id` dan `ownerRole: user.role` ke dalam header metadata sesi.
2. **Penyimpanan Terisolasi (Directory Sharding):**
   Penyimpanan log sesi dipecah berdasarkan direktori pengguna:
   ```text
   ~/.dsh/session-logs/
       ├── users/
       │   ├── usr_admin_1/
       │   │   ├── session-001.jsonl
       │   │   └── session-002.jsonl
       │   └── usr_tech_2/
       │       └── session-099.jsonl
   ```
3. **Filter pada `listSessions()`:**
   Saat antarmuka meminta daftar riwayat percakapan:
   * **Untuk Teknisi & CS:** Query hanya mengambil sesi yang berada di bawah direktori `users/<current_user_id>/`.
   * **Untuk Admin:** Query dapat memuat seluruh direktori untuk keperluan pengawasan dan audit operasional.

---

## 6. Peniadaan Fitur Topup & Penyederhanaan Settings

1. **Topup Dihilangkan untuk Non-Admin:**
   * Komponen UI `AccountSection` (`packages/client/ui-settings-account`) memeriksa peran pengguna.
   * Untuk pengguna non-admin (teknisi dan CS), elemen kartu saldo (*Topped-up balance*, *Granted balance*), tautan konsol platform, dan tombol *Top up* **dihilangkan sepenuhnya**.
2. **Pengelolaan API Key Terpusat:**
   * Kredensial LLM (`DEEPSEEK_API_KEY`) dikelola terpusat pada file `.env` server organisasi.
   * Teknisi dan CS tidak perlu memasukkan kunci API individu atau memikirkan saldo akun.

---

## 7. Penyempurnaan Agent Presets

### Analisis Masalah Deskripsi Kosong
Pada sistem registri preset Harness (`packages/preset/agent-preset-registry/src/display.ts`):
* Jika suatu preset memiliki custom `name` (misalnya `name: "Network Operations"`), fungsi `isBuiltInPreset` mengembalikan nilai `false` sehingga sistem berhenti mencari string deskripsi di kamus bawaan.
* Di file `packages/bundle/netops-app/cordis.patch.yml`, field `description:` sebelumnya tidak didefinisikan. Akibatnya, `preset.description` bernilai `undefined` dan kartu preset di UI tampak kosong tanpa penjelasan.

### Konfigurasi Preset yang Disempurnakan
Kita mendefinisikan dua preset resmi yang siap pakai dengan deskripsi lengkap dan transparan:

```yaml
# 1. Preset untuk Tim Lapangan & Teknisi Jaringan
- id: preset-standard
  config:
    id: standard
    name: "Network Operations"
    description: "Asisten teknis jaringan untuk diagnosis, observasi routing, dan konfigurasi aman perangkat MikroTik RouterOS & OLT."
    order: 1
    # plugins: device-context, mcp-client, routeros-tools, time-context, plan-mode, ask-user...

# 2. Preset untuk Layanan Pelanggan & WhatsApp Bot
- id: preset-cs
  config:
    id: cs
    name: "Customer Service & Helpdesk"
    description: "Asisten layanan pelanggan otomatis untuk pengecekan status internet, redaman modem, dan panduan kendala pelanggan secara ramah."
    order: 2
    # plugins: read-only mcp tools, faq-knowledge, customer-context...
```

---

## 8. Rencana Tahapan Implementasi (Action Plan)

| Tahap | Fokus Tugas | Deliverables |
| :---: | :--- | :--- |
| **Fase 1** | **Preset & Deskripsi** | - Tambahkan deskripsi jelas pada preset `Network Operations` di `cordis.patch.yml`.<br>- Tambahkan preset `Customer Service` read-only.<br>- Pastikan preset coding/host shell berstatus `disabled: true`. |
| **Fase 2** | **Proteksi Host & Tool Guard** | - Pastikan tool `bash`, `pwsh`, dan filesystem write dinonaktifkan secara default.<br>- Perbarui `approval-guard.ts` untuk memblokir mutasi host tanpa izin super admin. |
| **Fase 3** | **JWT Auth Bridge** | - Buat plugin bridge otentikasi di Node.js (`dsh-auth-polyglot`) untuk memverifikasi JWT Polyglot.<br>- Ekstrak `userId`, `username`, dan `role` ke dalam request context. |
| **Fase 4** | **Isolasi Sesi & DB** | - Terapkan partisi penyimpanan sesi berdasarkan `userId`.<br>- Sesuaikan `SessionController.listSessions` agar hanya menampilkan sesi milik user yang aktif (kecuali admin). |
| **Fase 5** | **UI Cleansing & Topup Hiding** | - Sembunyikan panel saldo, tombol topup, dan kartu balance untuk role non-admin di antarmuka Settings.<br>- Tampilkan identitas profil teknisi Polyglot di pojok status akun. |
| **Fase 6** | **Integrasi Webhook WhatsApp** | - Sambungkan event webhook pesan masuk dari Polyglot Go ke session CS DeepSeek-Harness.<br>- Teruskan jawaban AI kembali ke API pengiriman pesan WhatsApp Polyglot. |

---

*Dokumen ini merupakan panduan arsitektur resmi yang disetujui untuk pengembangan integrasi DeepSeek-Harness dan Polyglot.*
