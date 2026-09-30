import { eveChannel } from "eve/channels/eve";
import { ForbiddenError, none, type AuthFn } from "eve/channels/auth";
import { hitRateLimit } from "#lib/rate-limit.js";

// Public demo: anyone with the link can use the browser chat UI in app/.
// Requests are anonymous but rate limited per client IP before any model work runs.
const REQUESTS_PER_MINUTE = 60;

function clientIp(request: Request): string {
  // Vercel sets x-forwarded-for / x-real-ip at the edge; the client can't spoof them there.
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

const rateLimited: AuthFn<Request> = (request) => {
  if (hitRateLimit(clientIp(request), REQUESTS_PER_MINUTE, 60_000)) {
    throw new ForbiddenError({
      code: "rate_limited",
      message: "Too many requests. Please wait a minute and try again.",
    });
  }
  return null; // fall through to none()
};

export default eveChannel({
  auth: [rateLimited, none()],
});
