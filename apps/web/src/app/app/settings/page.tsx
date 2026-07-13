import type { Metadata } from "next";
import { SettingsExperience } from "./settings-experience";

export const metadata: Metadata = {
  title: "Ajustes | Fauzet",
  description: "Perfil, seguridad, pagos y preferencias de tu cuenta Fauzet.",
};

export default function SettingsPage() {
  return (
    <main className="appShell">
      <SettingsExperience />
    </main>
  );
}
