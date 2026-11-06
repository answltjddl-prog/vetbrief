// GET /api/health → which features are configured on the server
import { send } from "./_lib.js";

export default function handler(req, res) {
  send(res, 200, {
    ai: !!process.env.ANTHROPIC_API_KEY,
    needsCode: !!process.env.ACCESS_CODE,
    openalex: !!process.env.OPENALEX_API_KEY,
    kci: !!process.env.KCI_API_KEY,
  });
}
