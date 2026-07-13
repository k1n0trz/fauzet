import type { Metadata } from "next";
import { GamesHub } from "./games-hub";

export const metadata: Metadata = {
  title: "Juegos | Fauzet",
  description: "Minijuegos con sesiones y recompensas validadas.",
};

export default function GamesPage() {
  return (
    <main className="appShell">
      <GamesHub />
    </main>
  );
}
