import { redirect } from "next/navigation";

// El Dashboard tiene una vista por cuestionario vigente (submenú del sidebar);
// la raíz abre Mediciones de tiempos, que era la vista única original.
export default function DashboardPage() {
  redirect("/admin/dashboard/tiempos");
}
