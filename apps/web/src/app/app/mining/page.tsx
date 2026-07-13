import { RewardsHeader } from "../rewards-header";
import { MiningExperience } from "./mining-experience";

export default function MiningPage() {
  return (
    <main className="appShell">
      <RewardsHeader current="mining" />
      <MiningExperience />
    </main>
  );
}
