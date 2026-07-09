// Identificador de la versión desplegada. En Vercel cambia en cada deploy;
// en local es "dev" (el FreshnessGuard no dispara recargas ahí porque el
// servidor de desarrollo ya refresca solo con HMR).
export function getAppVersion(): string {
  return (
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_APP_VERSION ||
    "dev"
  );
}
