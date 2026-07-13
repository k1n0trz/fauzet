import { notFound } from "next/navigation";
import { FiatOrderExperience } from "./fiat-order-experience";

export default async function FiatOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  if (!UUID.test(orderId)) notFound();

  return (
    <main className="appShell">
      <FiatOrderExperience orderId={orderId.toLowerCase()} />
    </main>
  );
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
