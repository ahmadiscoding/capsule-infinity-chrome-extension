// ============================================
// Supabase Edge Function: compress
// Server-side AI transcript compression engine for Capsule Infinity
// Handles Auth check, Per-user monthly limits, Global daily caps,
// Smart routing (Gemini/Groq), Model chain failover, and Structured JSON output.
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-3.5-flash";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";

// Groq model fallback chain — if the first model is deprecated/removed, try the next.
// Groq aggressively sunsets models (llama-3.3-70b: Aug 16, qwen3.6-27b: ~Aug 22).
// A secret GROQ_MODEL override takes full control; otherwise we try these in order.
const GROQ_MODELS_CHAIN: string[] = (() => {
  const envModel = Deno.env.get("GROQ_MODEL");
  if (envModel) return [envModel];
  return ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];
})();

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";

const MONTHLY_FREE_LIMIT = 30;
const GEMINI_DAILY_CAP = 200;
const GROQ_DAILY_CAP = 1000;

// Provider call timeout — 20s gives headroom for Edge Function cold starts + LLM inference
const PROVIDER_TIMEOUT_MS = 20000;

const SYSTEM_PROMPT = `You are the compression engine for a context-capsule browser extension. You will receive a raw AI chat transcript. Produce a compact "capsule" that lets another AI instantly resume this conversation with full context.

Output ONLY valid JSON matching this schema, nothing else:

{
  "user_intent": "<1-2 full sentences in plain prose: what is the user ultimately trying to accomplish>",
  "key_decisions": "<1-3 full sentences in plain prose: concrete decisions made so far, written as connected sentences, not a list>",
  "constraints": "<1-2 full sentences in plain prose: hard requirements or things to avoid. Omit this field entirely if none exist>",
  "technicalities": "<2-4 full sentences in plain prose: tools, versions, technical facts, and details worth remembering>"
}

Rules:
- Write real sentences, not sentence fragments or bullet-style noun phrases.
- Do not restate the user's literal questions — synthesize what was concluded or decided.
- Never include pleasantries, apologies, or filler from the original chat.
- Omit "constraints" entirely if the chat has no explicit constraints — do not invent one.
- If the chat covers multiple unrelated topics, focus on the most recent/active topic; mention earlier topics only briefly within "technicalities" if relevant.
- Target 80–150 words total.`;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Check for code/technical content keywords
function isTechnicalTranscript(text: string): boolean {
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 3000) return true;

  const techPattern = /```|function|class|import|export|def |struct|interface|SQL|SELECT|INSERT|UPDATE|DELETE|Error:|Traceback|Exception|at\s+\w+\.\w+|const\s+|let\s+|var\s+/i;
  return techPattern.test(text);
}

// Call Gemini API (AI Studio v1beta) with AbortController timeout
async function callGemini(transcript: string): Promise<any> {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [
          { parts: [{ text: transcript }] }
        ],
        generationConfig: {
          response_mime_type: "application/json",
          temperature: 0.2
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      const status = response.status;
      const isRateLimit = status === 429 || status === 403 || errText.includes("RESOURCE_EXHAUSTED");
      const err = new Error(`Gemini HTTP ${status}: ${errText}`);
      (err as any).isRateLimit = isRateLimit;
      (err as any).status = status;
      throw err;
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error("Empty response from Gemini");

    return JSON.parse(rawText);
  } finally {
    clearTimeout(timeout);
  }
}

// Call a single Groq model with AbortController timeout
async function callGroqWithModel(transcript: string, model: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: transcript }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      const status = response.status;
      const isRateLimit = status === 429 || status === 403 || errText.includes("rate_limit");
      const isModelGone = status === 404 || errText.includes("does not exist") || errText.includes("not found") || errText.includes("decommissioned");
      const err = new Error(`Groq HTTP ${status} [${model}]: ${errText}`);
      (err as any).isRateLimit = isRateLimit;
      (err as any).modelNotFound = isModelGone;
      (err as any).status = status;
      throw err;
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content;
    if (!rawText) throw new Error(`Empty response from Groq [${model}]`);

    return JSON.parse(rawText);
  } finally {
    clearTimeout(timeout);
  }
}

// Call Groq with automatic model chain fallback — tries each model in sequence
async function callGroq(transcript: string): Promise<any> {
  if (!GROQ_API_KEY) throw new Error("Groq API key not configured");

  let lastError: any = null;
  for (let i = 0; i < GROQ_MODELS_CHAIN.length; i++) {
    const model = GROQ_MODELS_CHAIN[i];
    try {
      console.log(`🎰 [Groq] Rolling the dice on model "${model}"... (${i + 1}/${GROQ_MODELS_CHAIN.length})`);
      const result = await callGroqWithModel(transcript, model);
      console.log(`✅ [Groq] "${model}" delivered! That's what we like to see.`);
      return result;
    } catch (err: any) {
      lastError = err;
      if (err.modelNotFound) {
        console.warn(`💀 [Groq] Model "${model}" is gone — another one bites the dust. Trying next...`);
        continue;
      }
      // Rate limits, auth errors, etc — don't retry with another model, propagate
      console.warn(`⚠️ [Groq] Model "${model}" failed (not a deprecation): ${err.message}`);
      throw err;
    }
  }
  console.error(`🪦 [Groq] All ${GROQ_MODELS_CHAIN.length} models in the chain are dead. RIP.`);
  throw lastError || new Error("All Groq models in chain exhausted");
}

// In-memory per-user burst rate-limiter (3-second guard to prevent automated DoS spam)
const userLastRequestMap = new Map<string, number>();

function isBurstRateLimited(userId: string): boolean {
  const now = Date.now();
  const lastTime = userLastRequestMap.get(userId) || 0;
  if (now - lastTime < 3000) {
    return true;
  }
  userLastRequestMap.set(userId, now);

  // Prune map entries older than 60 seconds
  if (userLastRequestMap.size > 1000) {
    for (const [uid, time] of userLastRequestMap.entries()) {
      if (now - time > 60000) userLastRequestMap.delete(uid);
    }
  }
  return false;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "UNAUTHORIZED", message: "Missing authorization token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Explicitly pass token to getUser(token) to validate the JWT
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      console.warn("🔒 [Auth] auth.getUser failed:", userError?.message || "User is null");
      return new Response(
        JSON.stringify({ error: "UNAUTHORIZED", message: userError?.message || "Invalid or expired session token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Per-user burst rate-limiting guard (prevents single-user DoS spamming quota)
    if (isBurstRateLimited(user.id)) {
      return new Response(
        JSON.stringify({ error: "TOO_MANY_REQUESTS", message: "Please wait a few seconds between captures." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json().catch(() => ({}));
    let transcript = body.transcript || "";
    if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "BAD_REQUEST", message: "Transcript text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Server-side safety cap: truncate to 30K chars to prevent provider timeouts
    if (transcript.length > 30000) {
      console.log(`✂️ [Transcript] Trimming from ${transcript.length} to 30000 chars — nobody reads that much anyway.`);
      transcript = transcript.substring(0, 30000);
    }

    // 2. Per-user monthly limit check via SECURITY DEFINER RPC
    const { data: usageData, error: usageErr } = await supabaseAdmin.rpc("check_and_increment_usage", {
      target_user_id: user.id,
      max_limit: MONTHLY_FREE_LIMIT
    });

    if (usageErr) {
      console.error("📊 [Quota] RPC check_and_increment_usage error:", usageErr.message);
      return new Response(
        JSON.stringify({ error: "INTERNAL_ERROR", message: "Quota verification failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const usageResult = usageData?.[0] || usageData;
    if (usageResult && usageResult.allowed === false) {
      return new Response(
        JSON.stringify({
          error: "LIMIT_REACHED",
          plan: usageResult.user_plan || "free",
          monthlyLimit: MONTHLY_FREE_LIMIT,
          currentUsage: usageResult.current_usage
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Global daily provider cap check & Smart Routing
    const today = new Date().toISOString().split("T")[0];
    const isTech = isTechnicalTranscript(transcript);
    const wordCount = transcript.split(/\s+/).length;

    let preferredProvider: "gemini" | "groq" = isTech ? "gemini" : "groq";
    let fallbackProvider: "gemini" | "groq" = preferredProvider === "gemini" ? "groq" : "gemini";
    console.log(`🧠 [Router] ${wordCount} words, ${isTech ? "looks technical — Gemini takes the wheel" : "casual vibes — Groq gets first dibs"}`);

    // Increment provider daily usage RPC
    const checkProviderCap = async (provider: "gemini" | "groq"): Promise<boolean> => {
      const maxCap = provider === "gemini" ? GEMINI_DAILY_CAP : GROQ_DAILY_CAP;
      const { data: count, error: capErr } = await supabaseAdmin.rpc("increment_provider_daily", {
        p_provider: provider,
        p_date: today
      });
      if (capErr) {
        console.warn(`📈 [Cap] Provider daily cap RPC error for ${provider}:`, capErr.message);
        return true; // Allow on RPC failure
      }
      return (count || 0) <= maxCap;
    };

    let targetProvider: "gemini" | "groq" | null = null;
    let alternativeProvider: "gemini" | "groq" | null = null;

    if (await checkProviderCap(preferredProvider)) {
      targetProvider = preferredProvider;
      alternativeProvider = fallbackProvider;
    } else if (await checkProviderCap(fallbackProvider)) {
      console.log(`🔄 [Router] ${preferredProvider} hit daily cap — swapping to ${fallbackProvider}. Adapt and overcome.`);
      targetProvider = fallbackProvider;
      alternativeProvider = null;
    } else {
      console.warn("🚫 [Router] BOTH providers at daily cap. That's a busy day.");
      return new Response(
        JSON.stringify({ error: "DAILY_CAPACITY_REACHED", message: "Daily global capacity limit hit. Please try again tomorrow." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4 & 5. Call Provider & Automatic Failover logic
    let resultCapsule: any = null;
    let servedBy: "gemini" | "groq" = targetProvider;
    let geminiAttempted = targetProvider === "gemini";

    try {
      console.log(`🚀 [Provider] First up: ${targetProvider}. Let's see what you've got...`);
      if (targetProvider === "gemini") {
        resultCapsule = await callGemini(transcript);
      } else {
        resultCapsule = await callGroq(transcript);
      }
      console.log(`🎯 [Provider] ${targetProvider} nailed it on the first try!`);
    } catch (primaryErr: any) {
      console.warn(`💥 [Provider] ${targetProvider} struck out: ${primaryErr.message}`);

      // Try the alternative provider
      if (alternativeProvider) {
        console.log(`🔄 [Failover] Switching to plan B: ${alternativeProvider}...`);
        try {
          if (await checkProviderCap(alternativeProvider)) {
            if (alternativeProvider === "gemini") {
              resultCapsule = await callGemini(transcript);
              geminiAttempted = true;
            } else {
              resultCapsule = await callGroq(transcript);
            }
            servedBy = alternativeProvider;
            console.log(`🎯 [Failover] ${alternativeProvider} saved the day!`);
          }
        } catch (secondaryErr: any) {
          console.warn(`💥 [Failover] ${alternativeProvider} also failed: ${secondaryErr.message}`);
        }
      }
    }

    // ULTIMATE SAFETY NET: If nothing worked yet and Gemini hasn't been tried,
    // force Gemini as the last resort — skip daily cap check.
    // We NEVER fall back to local if Gemini can answer.
    if (!resultCapsule && !geminiAttempted && GEMINI_API_KEY) {
      console.log(`🛡️ [Last Resort] Everything failed. Gemini, you're our only hope — firing without cap check...`);
      try {
        resultCapsule = await callGemini(transcript);
        servedBy = "gemini";
        console.log(`✨ [Last Resort] Gemini clutched it! Crisis averted.`);
      } catch (lastResortErr: any) {
        console.error(`😵 [Last Resort] Even Gemini couldn't save us: ${lastResortErr.message}`);
      }
    }

    if (!resultCapsule) {
      console.error("🪦 [Result] All providers exhausted. This capsule goes to the local graveyard.");
      return new Response(
        JSON.stringify({ error: "SERVICE_UNAVAILABLE", message: "AI compression providers temporarily unavailable" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Return success
    console.log(`🏆 [Result] Capsule compressed successfully! Served by: ${servedBy}. Another happy customer.`);
    return new Response(
      JSON.stringify({
        success: true,
        capsule: resultCapsule,
        servedBy
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("💣 [Fatal] Unexpected error:", err.message);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
