"use client";
import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button className="btn-secondary" onClick={() => signOut({ callbackUrl: "/login" })}>
      Salir
    </button>
  );
}
