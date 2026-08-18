// Íconos de línea (stroke = currentColor), hechos a medida para cada sección.
import type { SVGProps } from "react";

function Svg(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="20"
      height="20"
      aria-hidden="true"
      {...props}
    />
  );
}

export type IconName =
  | "home"
  | "questionnaire"
  | "assignment"
  | "company"
  | "users"
  | "workplan"
  | "dashboard"
  | "documents"
  | "compliance"
  | "report"
  | "upload";

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 22V12h6v10" />
  </Svg>
);

// Cuestionarios (portapapeles con líneas)
export const QuestionnaireIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect width="8" height="4" x="8" y="2" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M12 11h4" />
    <path d="M12 16h4" />
    <path d="M8 11h.01" />
    <path d="M8 16h.01" />
  </Svg>
);

// Asignaciones (lista con checks)
export const AssignmentIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m3 17 2 2 4-4" />
    <path d="m3 7 2 2 4-4" />
    <path d="M13 6h8" />
    <path d="M13 12h8" />
    <path d="M13 18h8" />
  </Svg>
);

// Empresas (edificio)
export const CompanyIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect width="16" height="20" x="4" y="2" rx="2" />
    <path d="M9 22v-4h6v4" />
    <path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01" />
  </Svg>
);

// Usuarios
export const UsersIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);

// Plan de trabajo (portapapeles con check)
export const WorkplanIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect width="8" height="4" x="8" y="2" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="m9 14 2 2 4-4" />
  </Svg>
);

// Dashboard cliente
export const DashboardIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect width="7" height="9" x="3" y="3" rx="1" />
    <rect width="7" height="5" x="14" y="3" rx="1" />
    <rect width="7" height="9" x="14" y="12" rx="1" />
    <rect width="7" height="5" x="3" y="16" rx="1" />
  </Svg>
);

// Compliance ASQ (avión)
export const ComplianceIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M17.8 19.2 16 11l3.5-3.5a2.12 2.12 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-.9 1.7l4.4 3.1-2 2H3.5a1 1 0 0 0-.7 1.7l2.5 2.5 2.5 2.5a1 1 0 0 0 1.7-.7v-1.8l2-2 3.1 4.4a1 1 0 0 0 1.7-.9z" />
  </Svg>
);

// Informes (diapositiva con barras)
export const ReportIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M3 20h18" />
    <path d="M8 13v-2M12 13V9M16 13v-4" />
  </Svg>
);

// Ingesta ASQ (subir archivo a una bandeja)
export const UploadIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    <path d="M12 15V3" />
    <path d="m8 7 4-4 4 4" />
  </Svg>
);

export const ChevronLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);

export const ChevronDownIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg width={16} height={16} {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

// Usuario individual (perfil)
export const UserIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </Svg>
);

export const MenuIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Svg>
);

export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);

export const DocsIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 4a2 2 0 0 1 2-2h6l2 2h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
  </Svg>
);

export const FolderIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M4 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
  </Svg>
);

export const FileIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </Svg>
);

// Duplicar (copiar)
export const CopyIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <rect width="13" height="13" x="9" y="9" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
);

// Eliminar (basurero)
export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M10 11v6M14 11v6" />
  </Svg>
);

export const LogoutIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);

// Manual de usuario (libro abierto)
export const BookIcon = (p: SVGProps<SVGSVGElement>) => (
  <Svg {...p}>
    <path d="M12 7v14" />
    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
  </Svg>
);

export const NAV_ICONS: Record<IconName, (p: SVGProps<SVGSVGElement>) => JSX.Element> = {
  home: HomeIcon,
  questionnaire: QuestionnaireIcon,
  assignment: AssignmentIcon,
  company: CompanyIcon,
  users: UsersIcon,
  workplan: WorkplanIcon,
  dashboard: DashboardIcon,
  documents: DocsIcon,
  compliance: ComplianceIcon,
  report: ReportIcon,
  upload: UploadIcon,
};
