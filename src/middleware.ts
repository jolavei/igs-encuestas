import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

// Proteccion de rutas por rol. El rol viene del JWT (resuelto server-side).
export default withAuth(
  function middleware(req) {
    const role = req.nextauth.token?.role;
    const { pathname } = req.nextUrl;

    const needs = (prefix: string, allowed: string[]) =>
      pathname.startsWith(prefix) && !allowed.includes(role as string);

    if (
      needs("/admin", ["ADMIN"]) ||
      needs("/encuestador", ["ADMIN", "SURVEYOR"]) ||
      needs("/cliente", ["ADMIN", "CLIENT"])
    ) {
      return NextResponse.redirect(new URL("/denegado", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: { authorized: ({ token }) => !!token },
    pages: { signIn: "/login" },
  }
);

// Rutas que requieren sesion. Publicas quedan fuera: /, /login, /s/*, /api/public/*, /api/auth/*
export const config = {
  matcher: ["/admin/:path*", "/encuestador/:path*", "/cliente/:path*"],
};
