import { cookies } from "next/headers";
import { GRANT_TTL_SEC, verifyAccess } from "@/lib/server/client-access";
import { env } from "@/lib/server/env";
import { assertSameOrigin, clientIp, errorResponse, json, readJson } from "@/lib/server/web";
import { accessSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = accessSchema.parse(await readJson(req, 1024));
    const { cookieName, grant } = await verifyAccess(body.token, body.last4, clientIp(req.headers));
    (await cookies()).set(cookieName, grant, {
      httpOnly: true,
      secure: env.cookieSecure,
      sameSite: "strict",
      path: "/",
      maxAge: GRANT_TTL_SEC,
    });
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
