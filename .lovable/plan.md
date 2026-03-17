

## Plan: PSB Self-Registration by Parents + Auto NIS on Acceptance

### Overview

Two main features:
1. **Public PSB registration page** where prospective parents can self-register their child with parent data, without needing to log in.
2. **Auto-generate NIS** when admin clicks "Terima" (accept) on the PSB page.

### Current State

- PSB page (`/akademik/psb`) is admin-only, with a simple form (nama, JK, telepon, alamat, angkatan).
- `siswa_detail` table stores parent info: `nama_ayah`, `nama_ibu`, `pekerjaan_ayah`, `pekerjaan_ibu`, `telepon_ortu`, `alamat_ortu`.
- `siswa` table has columns: `nis`, `nama`, `jenis_kelamin`, `tempat_lahir`, `tanggal_lahir`, `agama`, `alamat`, `telepon`, `email`, `foto_url`, `status`, `angkatan_id`.
- `generate-nis` edge function exists but requires auth (admin/kepala_sekolah role check).
- RLS on `siswa` only allows admin to INSERT. Anonymous users cannot insert.

### Design Decisions

- The public PSB form will call a **new edge function** `psb-daftar` that uses the service role key to insert data (bypassing RLS). No authentication required (`verify_jwt = false`).
- Agama is hardcoded to "Islam" and not shown in the form.
- NIS is not shown in the PSB form.
- The form only shows departemen selection (not kelas/tingkat/angkatan for akademik data).
- When admin clicks "Terima", the system auto-generates NIS using the existing `generate-nis` logic (inline, not calling the edge function) and updates the siswa record.

### Implementation Steps

#### 1. Create Edge Function `psb-daftar`

New file: `supabase/functions/psb-daftar/index.ts`

- No auth required (public registration)
- Accepts: student data (nama, jenis_kelamin, tempat_lahir, tanggal_lahir, alamat, telepon) + parent data (nama_ayah, nama_ibu, pekerjaan_ayah, pekerjaan_ibu, telepon_ortu, alamat_ortu) + departemen_id
- Uses service role key to:
  1. Insert into `siswa` with `status: 'calon'`, `agama: 'Islam'`, no NIS
  2. Insert into `siswa_detail` with parent info
- Returns success/error
- Add rate limiting / basic validation

Update `supabase/config.toml`:
```toml
[functions.psb-daftar]
verify_jwt = false
```

#### 2. Create Public PSB Registration Page

New file: `src/pages/portal/PSBDaftar.tsx`

A public page (no login required) with a multi-section form:

**Data Calon Siswa:**
- Nama Lengkap (required)
- Jenis Kelamin (L/P select)
- Tempat Lahir
- Tanggal Lahir
- Alamat
- Telepon
- Departemen (required, fetched from `departemen` table)

**Data Orang Tua:**
- Nama Ayah
- Nama Ibu
- Pekerjaan Ayah
- Pekerjaan Ibu
- Telepon Orang Tua
- Alamat Orang Tua

Agama auto-set to "Islam" (not displayed). NIS not displayed.

On submit: calls `psb-daftar` edge function via `supabase.functions.invoke()`.
Shows success message with registration confirmation.

#### 3. Add Route for Public PSB Page

In `src/App.tsx`, add a public route:
```
<Route path="/psb" element={<PSBDaftar />} />
```

#### 4. Update Admin PSB Page - Auto NIS on "Terima"

Modify `src/pages/akademik/PSB.tsx`:

- `handleTerima`: When accepting a student, auto-generate NIS by calling the `generate-nis` edge function, then update siswa with both `status: 'diterima'` and the generated `nis`.
- Update the query to also fetch `departemen` info via siswa's detail or angkatan.
- Add departemen column to the table display.
- Show parent data in the table or a detail view.

#### 5. Add Link from Portal Login to PSB

On `src/pages/portal/PortalLogin.tsx`, add a link: "Belum terdaftar? Daftarkan anak Anda" pointing to `/psb`.

### Technical Notes

- The `departemen` table is readable by authenticated users. For the public form, the edge function `psb-daftar` will also accept `departemen_id` and validate it server-side. The public page will need to fetch departemen list — we can either hardcode or add a simple public endpoint. Simplest: fetch via Supabase anon key (RLS allows authenticated SELECT only, so we need to add an anon SELECT policy on departemen, or fetch departemen list within the edge function). **Best approach**: the edge function returns the list of departemen when called with GET, and handles registration on POST.
- The `generate-nis` edge function has an auth check. For auto-NIS on "Terima", the admin is already authenticated, so it works as-is. We call it from the client via `supabase.functions.invoke('generate-nis', ...)`.

