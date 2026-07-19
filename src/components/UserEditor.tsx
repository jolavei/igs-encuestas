"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

type Company = { id: string; name: string; locations: { id: string; name: string }[] };
export type EditorUser = {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  address: string | null;
  rut: string | null;
  birthDate: string | null; // "YYYY-MM-DD"
  emergencyName: string | null;
  emergencyPhone: string | null;
  locationIds: string[];
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

function Form({
  companies,
  user,
  onClose,
  onSaved,
}: {
  companies: Company[];
  user?: EditorUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState(user?.role ?? "SURVEYOR");
  const [firstName, setFirstName] = useState(user?.firstName ?? "");
  const [lastName, setLastName] = useState(user?.lastName ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [address, setAddress] = useState(user?.address ?? "");
  const [rut, setRut] = useState(user?.rut ?? "");
  const [birthDate, setBirthDate] = useState(user?.birthDate ?? "");
  const [emergencyName, setEmergencyName] = useState(user?.emergencyName ?? "");
  const [emergencyPhone, setEmergencyPhone] = useState(user?.emergencyPhone ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(user?.locationIds ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleLoc(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      ...(isEdit ? {} : { email }),
      role,
      firstName: firstName || null,
      lastName: lastName || null,
      phone: phone || null,
      address: address || null,
      rut: rut || null,
      birthDate: birthDate || null,
      emergencyName: emergencyName || null,
      emergencyPhone: emergencyPhone || null,
      locationIds: Array.from(selected),
    };
    try {
      const r = await fetch(isEdit ? `/api/users/${user!.id}` : "/api/users", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[36rem] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{isEdit ? "Editar usuario" : "Agregar usuario"}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-xl leading-none text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Apellidos">
              <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>

          <Field label="Correo">
            <input
              className="input"
              type="email"
              required={!isEdit}
              disabled={isEdit}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="persona@empresa.cl"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Rol">
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="SURVEYOR">Encuestador</option>
                <option value="CLIENT">Cliente</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </Field>
            <Field label="RUT">
              <input
                className="input"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                placeholder="12.345.678-9"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Teléfono">
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Fecha de nacimiento">
              <input
                className="input"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Dirección">
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Contacto de emergencia — Nombre">
              <input
                className="input"
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
              />
            </Field>
            <Field label="Contacto de emergencia — Teléfono">
              <input
                className="input"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
              />
            </Field>
          </div>

          <div>
            <label className="label">Empresa · Sede (una o varias)</label>
            {companies.length === 0 ? (
              <p className="text-sm text-slate-400">No hay empresas con sedes.</p>
            ) : (
              <div className="max-h-52 space-y-3 overflow-auto rounded-md border border-slate-200 p-3">
                {companies.map((c) => (
                  <div key={c.id}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {c.name}
                    </p>
                    {c.locations.length === 0 ? (
                      <p className="text-xs text-slate-400">Sin sedes.</p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        {c.locations.map((l) => (
                          <label key={l.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selected.has(l.id)}
                              onChange={() => toggleLoc(l.id)}
                            />
                            {l.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3">
            <button className="btn" disabled={busy}>
              {busy ? "Guardando…" : isEdit ? "Guardar cambios" : "Agregar usuario"}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export default function UserEditor({
  companies,
  user,
  triggerLabel,
  triggerClass,
}: {
  companies: Company[];
  user?: EditorUser;
  triggerLabel: string;
  triggerClass?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button className={triggerClass ?? "btn-secondary shrink-0"} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {mounted &&
        open &&
        createPortal(
          <Form
            companies={companies}
            user={user}
            onClose={() => setOpen(false)}
            onSaved={() => {
              setOpen(false);
              router.refresh();
            }}
          />,
          document.body
        )}
    </>
  );
}
