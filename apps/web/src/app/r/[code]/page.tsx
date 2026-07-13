import { notFound, redirect } from "next/navigation";

export default async function ReferralLanding({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = rawCode.trim().toUpperCase();
  if (!/^FZ-[A-Z2-9]{8,16}$/.test(code)) notFound();
  redirect(`/app?ref=${encodeURIComponent(code)}`);
}
