// Local test server: `node dev-server.mjs` then open http://localhost:3000
// Serves the static app and runs /api/*.js the same way Vercel does.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
if (existsSync(path.join(root, ".env"))) {
  for (const line of readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const PORT = process.env.PORT || 3000;

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  try {
    if (u.pathname.startsWith("/api/")) {
      const name = u.pathname.slice(5).replace(/[^a-z]/g, "");
      const file = path.join(root, "api", name + ".js");
      if (!name || name.startsWith("_") || !existsSync(file)) { res.statusCode = 404; return res.end("not found"); }
      const mod = await import(pathToFileURL(file).href);
      return await mod.default(req, res);
    }
    let p = path.join(root, decodeURIComponent(u.pathname));
    if (!p.startsWith(root)) { res.statusCode = 403; return res.end(); }
    if ((await stat(p).catch(() => null))?.isDirectory()) p = path.join(p, "index.html");
    const data = await readFile(p);
    res.setHeader("Content-Type", TYPES[path.extname(p)] || "application/octet-stream");
    res.end(data);
  } catch (e) {
    res.statusCode = e.code === "ENOENT" ? 404 : 500;
    res.end(String(e.message));
  }
}).listen(PORT, () => console.log(`VetBrief → http://localhost:${PORT}`));
