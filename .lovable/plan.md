

## Fix: Tahun Ajaran Dropdown Visibility on InputPembayaran

### Problem
The "Tahun Ajaran Tagihan" dropdown (line 467-486) is nested inside the `selectedSiswa` conditional block (line 416), meaning it only appears **after** a student is selected. This makes it hard to find.

Additionally, there's no fallback message if `tahunAjaranList` is empty or loading.

### Changes to `src/pages/keuangan/InputPembayaran.tsx`

1. **Move the Tahun Ajaran dropdown to the top search bar area** (near the Lembaga filter, line 391-407) so it's always visible regardless of student selection. This lets users set the academic year context before searching for a student.

2. **Add loading/empty fallback** inside the SelectContent: if `tahunAjaranList` is empty or undefined, show a disabled item like "Tidak ada tahun ajaran".

3. **Keep the "Pembayaran Di Muka" alert** in the payment form section (only relevant after student is selected), referencing the already-selected tahun ajaran from the top bar.

### Layout After Fix

```text
[ Search input          ] [ Lembaga ▼ ] [ Tahun Ajaran ▼ ] [X]
                                          ↑ always visible
```

The dropdown will use the same `h-11` styling as the other top-bar controls for consistency.

