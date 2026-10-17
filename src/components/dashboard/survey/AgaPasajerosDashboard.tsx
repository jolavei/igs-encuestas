"use client";

// Dashboard de la Encuesta AGA de Pasajeros: KPIs, evolutivo, perfil, atributos,
// servicios, matriz importancia–desempeño y explorador de respuestas abiertas.
import {
  AppraisalBox,
  FiltersBar,
  ImportanceMatrix,
  KpiCards,
  OpenAnswers,
  ProfilePanel,
  ScoreList,
  SurveyHeader,
  SurveyState,
  TrendCard,
  exportOpenCsv,
  toggleHighlight,
} from "./SurveyBlocks";
import { useSurveyDashboard } from "./useSurveyDashboard";
import { SURVEY_VIEWS } from "@/lib/surveys/views";

const CFG = SURVEY_VIEWS["aga-pasajeros"];

export default function AgaPasajerosDashboard() {
  const { data, loading, error, update, setHighlighted, setAppraisal } = useSurveyDashboard("aga-pasajeros");
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
              <div className="grid gap-5 lg:grid-cols-2">
                <ScoreList title="Atributos de la experiencia" note="nota 1–5" rows={data.attributes} />
                <ScoreList title="Servicios evaluados" note="nota 1–5 · % que lo usó" rows={data.services} />
              </div>
              {data.importance && <ImportanceMatrix rows={data.importance} />}
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
