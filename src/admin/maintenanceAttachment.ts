import { getSupabaseClient } from "../supabase/client";

const unavailable = () => new Error("This attachment is unavailable or you no longer have access.");
const changed = () => new Error("Your session changed. Reopen the report before viewing its attachment.");

function attachmentName(value: unknown, maintId: string): string {
  if (!value || typeof value !== "object") throw unavailable();
  const result = value as Record<string, unknown>;
  if (result.maint_id !== maintId || !result.attachment || typeof result.attachment !== "object") throw unavailable();
  const attachment = result.attachment as Record<string, unknown>;
  const name = attachment.name;
  if (attachment.bucket !== "maintenance-images" || typeof attachment.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attachment.id) ||
    !(attachment.version === null || typeof attachment.version === "string") ||
    typeof name !== "string" || !name || new TextEncoder().encode(name).length > 2048 ||
    name.includes("\\") || Array.from(name).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
    name.split("/").some((part) => !part || part === "." || part === "..")) throw unavailable();
  return name;
}

// One report-view lifetime, using singleton Auth and captured request credentials.
export function maintenanceAttachmentAttempt(maintId: string, callerId: string, onInvalidated: () => void) {
  const client = getSupabaseClient();
  const controller = new AbortController();
  let active = true;
  const assertCurrent = () => { if (!active) throw changed(); };
  const { data: { subscription } } = client.auth.onAuthStateChange((event) => {
    if (!active) return;
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY") {
      active = false;
      controller.abort();
      onInvalidated();
    }
  });
  return {
    current: () => active,
    close() { active = false; controller.abort(); subscription.unsubscribe(); },
    async download(): Promise<Blob> {
      assertCurrent();
      if (!/^[1-9][0-9]{0,18}$/.test(maintId) || BigInt(maintId) > BigInt("9223372036854775807")) throw unavailable();
      const { data: { session }, error } = await client.auth.getSession();
      assertCurrent();
      if (error || !session?.access_token || session.user.id !== callerId) throw changed();
      const bearer = `Bearer ${session.access_token}`;
      const descriptor = await client.rpc("get_maintenance_attachment", { p_maint_id: maintId })
        .setHeader("Authorization", bearer).abortSignal(controller.signal);
      assertCurrent();
      if (descriptor.error) throw unavailable();
      const name = attachmentName(descriptor.data, maintId);
      const origin = import.meta.env.VITE_SUPABASE_URL;
      const publicKey = import.meta.env.VITE_ANON_KEY;
      if (!origin || !publicKey) throw unavailable();
      // Storage.download has no per-request Authorization option in the pinned
      // SDK. Use its object endpoint with a fixed project and captured bearer.
      const response = await fetch(`${origin.replace(/\/$/, "")}/storage/v1/object/maintenance-images/${name.split("/").map(encodeURIComponent).join("/")}`, {
        headers: { apikey: publicKey, Authorization: bearer },
        signal: controller.signal, cache: "no-store", credentials: "omit", redirect: "error",
      });
      assertCurrent();
      if (!response.ok) throw unavailable();
      const blob = await response.blob();
      assertCurrent();
      if (!blob.size || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(blob.type)) {
        throw new Error("This attachment is not a supported image.");
      }
      return blob;
    },
  };
}
