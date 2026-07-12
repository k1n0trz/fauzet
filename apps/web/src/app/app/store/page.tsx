import { RewardsHeader } from "../rewards-header";
import { StoreExperience } from "./store-experience";

export default function StorePage() {
  return (
    <main className="appShell">
      <RewardsHeader current="store" />
      <StoreExperience />
    </main>
  );
}
