import { RewardsHeader } from "../rewards-header";
import { SandboxConvertExperience } from "./sandbox-convert-experience";

export default function ConvertPage() {
  return (
    <main className="appShell">
      <RewardsHeader current="convert" />
      <SandboxConvertExperience />
    </main>
  );
}
