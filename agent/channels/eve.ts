import { eveChannel } from "eve/channels/eve";
import { none } from "eve/channels/auth";

// Public demo: anyone with the link can use the browser chat UI in app/.
// Swap none() for a real auth provider (Auth.js, Clerk, etc.) before this
// carries anything beyond a public read-only demo.
export default eveChannel({
  auth: [none()],
});
