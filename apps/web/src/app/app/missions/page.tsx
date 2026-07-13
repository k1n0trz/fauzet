import type { Metadata } from "next";
import { RewardsHeader } from "../rewards-header";
import { MissionsExperience } from "./missions-experience";

export const metadata: Metadata = {
  title: "Misiones | Fauzet",
  description: "Misiones con progreso y recompensas validados.",
};

export default function MissionsPage() {
  return (
    <main className="appShell">
      <RewardsHeader current="missions" />
      <MissionsExperience />
    </main>
  );
}
