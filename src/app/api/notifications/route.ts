import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/api/handler";
import { getTenantContext } from "@/lib/tenant/server";
import { getResidentContext } from "@/lib/tenant/resident";
import { UnauthenticatedError } from "@/lib/errors";
import { parseInput } from "@/lib/validation/parse";
import { listNotifications, markNotificationsRead } from "@/services/notification/notification-service";

async function viewer() {
  const ctx = await getTenantContext();
  if (ctx) return { userId: ctx.userId, organizationId: ctx.organizationId };
  const resident = await getResidentContext();
  if (resident) return { userId: resident.userId, organizationId: resident.organizationId };
  throw new UnauthenticatedError();
}

export async function GET() {
  try {
    const v = await viewer();
    return NextResponse.json({ data: await listNotifications(v.userId, v.organizationId) });
  } catch (error) {
    return errorResponse(error);
  }
}

const markSchema = z.object({ ids: z.array(z.string().max(64)).max(100).optional() });

/** POST { ids?: string[] } — mark given (or all) notifications as read */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const v = await viewer();
    const { ids } = parseInput(markSchema, await readJson(req));
    await markNotificationsRead(v.userId, v.organizationId, ids);
    return NextResponse.json({ data: null });
  } catch (error) {
    return errorResponse(error);
  }
}
