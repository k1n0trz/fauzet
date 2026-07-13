import { getDatabase } from "@fauzet/database";
import { ADMIN_ROLES, type AdminRole } from "../domain/admin.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const role = process.env.ADMIN_ROLE?.trim().toUpperCase();
const reason = process.env.ADMIN_REASON?.trim();

if (!email || !role || !reason || reason.length < 10)
  throw new Error(
    "ADMIN_EMAIL, ADMIN_ROLE and ADMIN_REASON (10+ characters) are required",
  );
if (!ADMIN_ROLES.includes(role as AdminRole))
  throw new Error(`ADMIN_ROLE must be one of: ${ADMIN_ROLES.join(", ")}`);

const database = getDatabase();
try {
  const user = await database.user.findUniqueOrThrow({ where: { email } });
  if (user.status !== "ACTIVE" || !user.emailVerifiedAt)
    throw new Error("Bootstrap admin must be active and email-verified");
  const result = await database.$transaction(async (tx) => {
    const existing = await tx.userRole.findUnique({
      where: { userId_role: { userId: user.id, role: role as AdminRole } },
    });
    if (existing) return { granted: false, userId: user.id, role };
    await tx.userRole.create({
      data: { userId: user.id, role: role as AdminRole },
    });
    await tx.auditEvent.create({
      data: {
        action: "BOOTSTRAP_ADMIN_ROLE_GRANTED",
        targetType: "UserRole",
        targetId: `${user.id}:${role}`,
        reason,
        before: { granted: false },
        after: { granted: true, role },
        requestId: `bootstrap:${crypto.randomUUID()}`,
      },
    });
    return { granted: true, userId: user.id, role };
  });
  console.log(JSON.stringify(result));
} finally {
  await database.$disconnect();
}
