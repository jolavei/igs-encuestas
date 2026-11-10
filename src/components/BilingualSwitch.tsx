"use client";

// Interruptor "Mostrar botón ES | EN en la encuesta" (crear cuestionario y su detalle).
export default function BilingualSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-brand-50/60 p-3">
      <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0">
        <input
          type="checkbox"
          role="switch"
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="absolute inset-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-50" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
      <span className="text-sm">
        <span className="block font-medium text-slate-800">
          Mostrar botón ES | EN en la encuesta
        </span>
        <span className="block text-slate-500">
          Al activarlo, bajo cada texto en español aparece un campo para el inglés. Se puede
          activar o desactivar después sin crear una versión nueva.
        </span>
      </span>
    </label>
  );
}
