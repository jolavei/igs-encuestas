// Anti-duplicado del QR público: una respuesta por dispositivo cada 24 h.
//
// Capa SERVIDOR: cookie httpOnly por token. Complementa el candado de localStorage
// del cliente (ver SurveyRunner) y la idempotencia por clientSubmissionId (ver
// lib/responses). No es infalible —incógnito u otro dispositivo lo saltan—; el
// objetivo es frenar el duplicado casual/accidental y mantener limpia la data.

export const ONCE_WINDOW_S = 24 * 60 * 60; // 24 h en segundos

// Nombre de cookie por token. El token QR es base64url (A–Z a–z 0–9 _ -), seguro
// como sufijo de nombre de cookie.
export function onceCookieName(token: string): string {
  return `igs_a_${token}`;
}

export function onceCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: ONCE_WINDOW_S,
  };
}
