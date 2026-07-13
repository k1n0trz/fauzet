import { RewardsHeader } from "../rewards-header";
import { CrewExperience } from "./crew-experience";

export default function CrewPage() {
  return (
    <main className="appShell">
      <RewardsHeader current="crew" />
      <CrewExperience />
    </main>
  );
}
