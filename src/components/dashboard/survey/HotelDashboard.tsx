"use client";

// Dashboard de la encuesta de satisfacción hotelera: KPIs, evolutivo, perfil del huésped,
// dimensiones de la estadía (secciones del cuestionario) y respuestas abiertas.
import {
  AppraisalBox,
  FiltersBar,
  KpiCards,
  OpenAnswers,
  ProfilePanel,
  SectionScores,
  SurveyHeader,
  SurveyState,
  TrendCard,
  exportOpenCsv,
  toggleHighlight,
} from "./SurveyBlocks";
import { useSurveyDashboard } from "./useSurveyDashboard";
import { SURVEY_VIEWS } from "@/lib/surveys/views";

const CFG = SURVEY_VIEWS["hotel"];

export default function HotelDashboard() {
  const { data, loading, error, update, setHighlighted, setAppraisal } = useSurveyDashboard("hotel");
  const onToggle = async (id: string, on: boolean) => {
    await toggleHighlight(id, on);
    setHighlighted(id, on);
  };
  return (
    <div className={`space-y-5 pb-12 ${loading && data ? "opacity-60 transition-opacity" : ""}`}>
      <SurveyHeader title={CFG.title} description={CFG.description} />
      <SurveyState loading={loading} error={error} found={data?.questionnaireFound} />
      {data?.questionnaireFound && (
        <>
          <FiltersBar
            data={data}
            update={update}
            onExport={() => exportOpenCsv(data, `${CFG.key}-${data.filters.mes ?? "periodo"}-comentarios.csv`)}
          />
          {data.kpis.n === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
              Aún no hay encuestas para este filtro.
            </div>
          ) : (
            <>
              <KpiCards data={data} />
              <div className="grid gap-5 lg:grid-cols-2">
                <TrendCard trend={data.trend} />
                <ProfilePanel profile={data.profile} respondent={CFG.respondent} />
              </div>
              <SectionScores sections={data.sections} />
              <div className="grid gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <OpenAnswers open={data.open} onToggle={onToggle} />
                </div>
                <AppraisalBox view={CFG.key} data={data} onSaved={setAppraisal} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
