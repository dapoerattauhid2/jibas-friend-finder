

## Analysis

The tunggakan page **does have data** (4 active kelas_siswa, 2 tarif_tagihan records, 5 jenis_pembayaran). The tahun_ajaran table also has data (2025/2026 active, 2026/2027 inactive).

**Root cause**: The `getTarifBatch` function on the tunggakan page is called **without `tahunAjaranId`** (line 63):
```
getTarifBatch(jenisId, siswaIds, kelasId || undefined)
```

But the tarif_tagihan records in the database **all have `tahun_ajaran_id` set** (e.g. `5fa77ad2...` for 2025/2026). The matching logic in `getTarifBatch` tries to match `tahun_ajaran_id === undefined`, which won't match any record that has a non-null `tahun_ajaran_id`. Result: tarif = 0 for all students, so no tunggakan is shown.

**Affected pages** (all call `getTarifBatch` without `tahunAjaranId`):
1. `src/pages/keuangan/TunggakanPembayaran.tsx` — no tahun ajaran filter at all
2. `src/pages/keuangan/LaporanBayarKelas.tsx` — no tahun ajaran filter
3. `src/pages/portal/PortalTagihan.tsx` — no tahun ajaran passed

## Plan

### 1. Add tahun ajaran filter to TunggakanPembayaran.tsx
- Add state `tahunAjaranId` defaulting to the active tahun ajaran
- Add `useTahunAjaran()` hook import from `useKeuangan`
- Add a tahun ajaran Select dropdown in the filter toolbar
- Pass `tahunAjaranId` as 4th argument to `getTarifBatch`
- Also filter `pembayaran` query by `tahun_ajaran_id`
- Also filter `kelas_siswa` query by `tahun_ajaran_id`

### 2. Add tahun ajaran filter to LaporanBayarKelas.tsx
- Same pattern: add state, dropdown, pass to `getTarifBatch`
- Filter `kelas_siswa` and `pembayaran` by tahun_ajaran_id

### 3. Fix PortalTagihan.tsx
- Determine active tahun_ajaran and pass it to `getTarifBatch`

### 4. Auto-select active tahun ajaran
- Use `useTahunAjaranAktif()` to get the active tahun ajaran
- Default the filter to the active one on mount, so data shows immediately

### Technical detail
- `useTahunAjaran` and `useTahunAjaranAktif` already exist in `src/hooks/useKeuangan.ts`
- The `getTarifBatch` function already accepts `tahunAjaranId` as the 4th parameter — we just need to pass it

