import type { Express, Request, Response } from "express";
import JSZip from "jszip";
import { sdk } from "./sdk";
import {
  getActiveLocales,
  getProjectById,
  getTranslationKeys,
  getTranslationsByKeyIds,
} from "../db";

/**
 * Build a nested-object i18n bundle for one locale.
 *   keys[]:       all translation keys (with dot-notation `keyPath`)
 *   translations: translations for these keys, any locale (we filter inside)
 *   localeCode:   which locale to project
 */
function buildLocaleNestedJson(
  keys: Array<{ id: number; keyPath: string }>,
  translations: Array<{ keyId: number; localeCode: string; value: string | null }>,
  localeCode: string
): Record<string, any> {
  // Index translations by keyId for O(1) lookup; only keep this locale's rows
  const byKey = new Map<number, string>();
  for (const t of translations) {
    if (t.localeCode === localeCode && t.value) {
      byKey.set(t.keyId, t.value);
    }
  }

  const result: Record<string, any> = {};
  for (const key of keys) {
    const value = byKey.get(key.id);
    if (!value) continue;
    const parts = key.keyPath.split(".");
    let cur: any = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!cur[seg] || typeof cur[seg] !== "object") cur[seg] = {};
      cur = cur[seg];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return result;
}

export function registerExportRoutes(app: Express) {
  /**
   * Stream a ZIP archive containing one nested-JSON file per active locale
   * for the given project. Authenticated route — uses the same session cookie
   * as the rest of the app via `sdk.authenticateRequest`.
   *
   * GET /api/export/:projectId.zip
   */
  app.get("/api/export/:projectId.zip", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const projectId = parseInt(req.params.projectId, 10);
      if (!Number.isFinite(projectId)) {
        res.status(400).json({ error: "Invalid projectId" });
        return;
      }

      const project = await getProjectById(projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const [keys, locales] = await Promise.all([
        getTranslationKeys({ projectId }),
        getActiveLocales(),
      ]);

      const keyIds = keys.map((k: any) => k.id as number);
      const translations =
        keyIds.length > 0 ? await getTranslationsByKeyIds(keyIds) : [];

      const zip = new JSZip();
      // README inside the zip — handy when handed off to non-tech teammates
      const localeList = locales
        .map((l: any) => `- ${l.code} (${l.name ?? l.nativeName ?? ""})`)
        .join("\n");
      zip.file(
        "README.txt",
        [
          `Project: ${project.name}`,
          `Exported: ${new Date().toISOString()}`,
          `Total keys: ${keys.length}`,
          `Locales:`,
          localeList,
          ``,
          `Each {code}.json contains nested objects matching the dot-notation key paths.`,
        ].join("\n")
      );

      for (const locale of locales as any[]) {
        const obj = buildLocaleNestedJson(
          keys as any,
          translations as any,
          locale.code
        );
        zip.file(
          `${locale.code}.json`,
          JSON.stringify(obj, null, 2) + "\n"
        );
      }

      const buffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      const safeName = (project.name as string).replace(/[^\w.\-]/g, "_") || "project";
      const filename = `${safeName}-${new Date().toISOString().slice(0, 10)}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
      );
      res.setHeader("Content-Length", buffer.length.toString());
      res.send(buffer);
    } catch (err: any) {
      console.error("[export.zip] error", err);
      res
        .status(500)
        .json({ error: err?.message ?? "Internal server error" });
    }
  });
}
