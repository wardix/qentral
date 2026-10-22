# Test Plan & Matriks Skenario Uji (Qentral)

Dokumen ini memetakan seluruh skenario pengujian unit dan integrasi yang **wajib dibuatkan tesnya terlebih dahulu oleh AI Coding Agent** sebelum menulis kode implementasi.

---

## 1. Matriks Pengujian Fitur

| Modul | File Test | Prioritas | Cakupan Fitur |
| :--- | :--- | :--- | :--- |
| **Autentikasi & Keamanan** | `tests/api/auth.test.ts` | P0 (Kritis) | API Key Middleware & Basic Auth Dashboard |
| **Penerimaan Job (Ingestion)** | `tests/api/jobs-publish.test.ts` | P0 (Kritis) | `POST /api/v1/jobs/:queueName` |
| **Status & Hasil Job** | `tests/api/jobs-status.test.ts` | P1 (Tinggi) | `GET /api/v1/jobs/:queueName/:jobId` |
| **Registrasi Antrean** | `tests/queues/registry.test.ts` | P1 (Tinggi) | Inisialisasi antrean & penanganan antrean tak terdaftar |
| **Eksekusi Worker** | `tests/workers/processor.test.ts` | P0 (Kritis) | Eksekusi processor, update progress, logging |
| **Retry & Dead-Letter** | `tests/workers/retry.test.ts` | P1 (Tinggi) | Exponential backoff & status failed |
| **Retensi Memori Redis** | `tests/shared/retention.test.ts` | P2 (Sedang) | Konfigurasi batas riwayat `removeOnComplete` & `removeOnFail` |

---

## 2. Rincian Skenario Uji per File

### A. `tests/api/auth.test.ts`
- [ ] **Case 1 (Unhappy Path)**: Mengirim request ke `/api/v1/jobs/*` tanpa header `x-api-key` -> Harus mengembalikan status `401 Unauthorized`.
- [ ] **Case 2 (Unhappy Path)**: Mengirim request ke `/api/v1/jobs/*` dengan `x-api-key` yang salah -> Harus mengembalikan status `401 Unauthorized`.
- [ ] **Case 3 (Happy Path)**: Mengirim request dengan `x-api-key` yang sesuai di `.env` -> Lolos ke handler berikutnya.
- [ ] **Case 4 (UI Auth)**: Mengakses route `/ui` tanpa Basic Auth header -> Harus mengembalikan status `401 Unauthorized`.
- [ ] **Case 5 (UI Auth)**: Mengakses route `/ui` dengan kredensial Basic Auth yang benar -> Mengembalikan status `200 OK`.

---

### B. `tests/api/jobs-publish.test.ts`
- [ ] **Case 1 (Unhappy Path)**: Mem-publish ke nama queue yang tidak ada (misal `/api/v1/jobs/unknown-queue`) -> Harus mengembalikan status `404 Not Found` dengan pesan error yang jelas.
- [ ] **Case 2 (Unhappy Path)**: Mengirim body JSON yang kosong atau tanpa `jobName` -> Harus mengembalikan status `400 Bad Request`.
- [ ] **Case 3 (Happy Path)**: Mengirim payload valid `{ jobName: 'test', data: { foo: 'bar' } }` -> Mengembalikan status `202 Accepted` dengan properti `{ success: true, jobId: expect.any(String), queue: '...' }`.
- [ ] **Case 4 (Opsi Lanjutan)**: Mengirim opsi `delay: 5000` -> Job harus terdaftar dengan opsi delay pada antrean.
- [ ] **Case 5 (Idempotensi)**: Mengirim opsi `jobId: 'custom-unique-id'` -> Job dibuat dengan ID tersebut. Jika dipanggil kedua kali dengan ID sama, sistem tidak membuat job duplikat.

---

### C. `tests/api/jobs-status.test.ts`
- [ ] **Case 1 (Unhappy Path)**: Mencari status untuk `jobId` yang tidak ada -> Harus mengembalikan status `404 Not Found`.
- [ ] **Case 2 (Happy Path - Waiting)**: Job baru saja dimasukkan -> Mengembalikan `{ id, state: 'waiting' }`.
- [ ] **Case 3 (Happy Path - Completed)**: Job telah selesai diproses -> Mengembalikan `{ id, state: 'completed', progress: 100, result: ... }`.
- [ ] **Case 4 (Happy Path - Failed)**: Job gagal setelah retry -> Mengembalikan `{ id, state: 'failed', failedReason: expect.any(String) }`.

---

### D. `tests/queues/registry.test.ts`
- [ ] **Case 1**: Fungsi `getQueueByName('nama-terdaftar')` -> Mengembalikan instans `Queue` BullMQ.
- [ ] **Case 2**: Fungsi `getQueueByName('nama-acak')` -> Mengembalikan `undefined` atau `null`.
- [ ] **Case 3**: Fungsi `getAllQueues()` -> Mengembalikan array berisi seluruh antrean yang telah terdaftar untuk diumpankan ke Bull-Board.

---

### E. `tests/workers/processor.test.ts`
- [ ] **Case 1**: Worker berhasil mengeksekusi job dan mengembalikan nilai return value sesuai kontrak.
- [ ] **Case 2**: Pemanggilan `job.updateProgress()` tercatat selama siklus eksekusi.
- [ ] **Case 3**: Pemanggilan `job.log()` menyimpan riwayat log pada job.
- [ ] **Case 4**: Worker menangani kegagalan (*throw Error*) dan melaporkan error ke BullMQ tanpa membuat proses worker crash.

---

## 3. Checklist Eksekusi TDD untuk AI Agent

Saat agent mulai mengerjakan proyek, tandai progres berikut:

- [x] **Milestone 1**: Pengujian Auth & Security lolos (`tests/api/auth.test.ts`)
- [x] **Milestone 2**: Pengujian Registry Antrean lolos (`tests/queues/registry.test.ts`)
- [x] **Milestone 3**: Pengujian Ingestion API lolos (`tests/api/jobs-publish.test.ts`)
- [x] **Milestone 4**: Pengujian Status API lolos (`tests/api/jobs-status.test.ts`)
- [x] **Milestone 5**: Pengujian Worker Processor lolos (`tests/workers/processor.test.ts`)
- [x] **Milestone 6**: Pengujian Retensi & Clean-up lolos (`tests/shared/retention.test.ts`)
- [x] **Milestone 7**: Semua suite test lulus bersamaan via `bun test`.
