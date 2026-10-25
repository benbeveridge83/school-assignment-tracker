import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import JSZip from "npm:jszip@3.10.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const safe = (value: unknown, fallback = "item") => {
  const cleaned = String(value ?? "").replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
  return cleaned || fallback;
};

const text = (value: unknown) => String(value ?? "").trim();

function uniqueName(used: Set<string>, desired: string) {
  if (!used.has(desired)) { used.add(desired); return desired; }
  const dot = desired.lastIndexOf(".");
  const base = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : "";
  let n = 2;
  while (used.has(`${base} (${n})${ext}`)) n++;
  const result = `${base} (${n})${ext}`;
  used.add(result);
  return result;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: cors });

    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.material_ids) ? [...new Set(body.material_ids.map(String).filter(Boolean))] : [];
    if (!ids.length) return new Response("No materials selected", { status: 400, headers: cors });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: rows, error } = await userClient.from("study_materials").select("*").in("id", ids);
    if (error) throw error;
    if (!rows?.length) return new Response("No authorized materials found", { status: 404, headers: cors });

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const zip = new JSZip();
    const usedByFolder = new Map<string, Set<string>>();

    for (const m of rows) {
      const folderName = safe(m.class_name_snapshot || "Unassigned", "Unassigned");
      const folder = zip.folder(folderName)!;
      if (!usedByFolder.has(folderName)) usedByFolder.set(folderName, new Set());
      const used = usedByFolder.get(folderName)!;
      const meta = m.metadata || {};
      const title = safe(m.title || "material", "material");

      if (m.storage_bucket && m.storage_path) {
        const { data: blob, error: fileError } = await admin.storage.from(m.storage_bucket).download(m.storage_path);
        if (!fileError && blob) {
          const stored = safe(meta.stored_file_name || String(m.storage_path).split("/").pop() || title);
          const name = uniqueName(used, stored);
          folder.file(name, await blob.arrayBuffer());
          continue;
        }
        const name = uniqueName(used, safe(title + " - unavailable.txt"));
        folder.file(name, [
          `Title: ${m.title}`,
          `Class: ${m.class_name_snapshot}`,
          `Source: ${m.source_type}`,
          `Status: file_unavailable`,
          `Original URL: ${m.original_url || ""}`,
          "",
          "The stored binary could not be retrieved when this ZIP was created."
        ].join("\n"));
        continue;
      }

      if (m.source_type === "omi" || m.material_kind === "transcript" || m.capture_status === "text_captured") {
        const content = text(meta.teacher_transcript) || text(meta.raw_transcript) || text(meta.text) || text(meta.source_payload?.text) || text(m.description);
        const name = uniqueName(used, safe(title + ".txt"));
        folder.file(name, [
          `Title: ${m.title}`,
          `Class: ${m.class_name_snapshot}`,
          `Source: ${m.source_type}`,
          m.source_created_at ? `Date: ${m.source_created_at}` : "",
          "",
          content || "(No captured text.)"
        ].filter(Boolean).join("\n"));
        continue;
      }

      const name = uniqueName(used, safe(title + " - reference.txt"));
      folder.file(name, [
        `Title: ${m.title}`,
        `Class: ${m.class_name_snapshot}`,
        `Source: ${m.source_type}`,
        `Status: ${m.capture_status}`,
        m.description ? `Description: ${m.description}` : "",
        `Original URL: ${m.original_url || ""}`
      ].filter(Boolean).join("\n"));
    }

    const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
    const first = rows[0];
    const filename = safe(`${first.student_key || "student"}-materials.zip`);
    return new Response(bytes, {
      headers: {
        ...cors,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    console.error(err);
    return new Response(err instanceof Error ? err.message : String(err), { status: 500, headers: cors });
  }
});
