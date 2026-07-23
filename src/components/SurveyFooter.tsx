// Firma que cierra cada sección del levantamiento.
export default function SurveyFooter() {
  return (
    <p className="pt-8 text-center text-xs tracking-wide text-slate-400">
      Desarrollado por{" "}
      <a
        href="https://aerodromosigs.cl/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-600 transition-colors hover:text-brand-700 hover:underline"
      >
        aerodromos.igs
      </a>
    </p>
  );
}
