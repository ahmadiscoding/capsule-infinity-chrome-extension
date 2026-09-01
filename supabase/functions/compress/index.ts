// ============================================
// Supabase Edge Function: compress
// Server-side AI transcript compression engine for Capsule Infinity
// Fully Autonomous, Self-Healing Dynamic Model Discovery Architecture
// Live Model Catalog Queries, Zero-Maintenance Failovers, Resilient Parsing
// ============================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";

const MONTHLY_FREE_LIMIT = 30;
const GEMINI_DAILY_CAP = 500;
const GROQ_DAILY_CAP = 2000;

// Provider call timeout — 25s gives ample headroom for cold starts and heavy transcripts
const PROVIDER_TIMEOUT_MS = 25000;

// ============================================================
// DYNAMIC SELF-HEALING LIVE MODEL DISCOVERY ENGINE
// Automatically queries Google & Groq live model catalogs at runtime.
// Automatically discovers newly added models & skips sunset ones.
// ============================================================

interface ModelCache {
  gemini: { models: string[]; lastFetched: number };
  groq: { models: string[]; lastFetched: number };
}

const modelCache: ModelCache = {
  gemini: { models: [], lastFetched: 0 },
  groq: { models: [], lastFetched: 0 },
};

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

// Safe static fallbacks in case network to /models fails
const STATIC_GEMINI_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-1.5-flash",
  "gemini-2.0-flash",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
  "gemini-1.5-pro"
];

const STATIC_GROQ_FALLBACKS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
  "deepseek-r1-distill-llama-70b",
  "gemma2-9b-it",
  "mixtral-8x7b-32768"
];

// Dynamically fetch live available models directly from Google AI Studio
async function getLiveGeminiModels(): Promise<string[]> {
  const now = Date.now();
  if (modelCache.gemini.models.length > 0 && (now - modelCache.gemini.lastFetched < CACHE_TTL_MS)) {
    return modelCache.gemini.models;
  }

  if (!GEMINI_API_KEY) return STATIC_GEMINI_FALLBACKS;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`, {
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.models)) {
        const discovered = data.models
          .filter((m: any) => {
            const name = (m.name || "").replace("models/", "");
            const methods = m.supportedGenerationMethods || [];
            const isText = methods.includes("generateContent");
            const isEmbedding = name.includes("embedding") || name.includes("aqa") || name.includes("transcribe");
            return isText && !isEmbedding;
          })
          .map((m: any) => (m.name || "").replace("models/", ""))
          .filter(Boolean);

        if (discovered.length > 0) {
          // Sort flash models first for maximum speed and token efficiency
          discovered.sort((a: string, b: string) => {
            const aFlash = a.includes("flash") ? 1 : 0;
            const bFlash = b.includes("flash") ? 1 : 0;
            return bFlash - aFlash;
          });

          console.log(`🌌 [Live Model Discovery] Found ${discovered.length} active Gemini models:`, discovered.slice(0, 5).join(", "));
          modelCache.gemini.models = discovered;
          modelCache.gemini.lastFetched = now;
          return discovered;
        }
      }
    }
  } catch (e: any) {
    console.warn(`[Live Model Discovery] Gemini models query failed (${e.message}), using fallback list.`);
  }

  return STATIC_GEMINI_FALLBACKS;
}

// Dynamically fetch live available models directly from GroqCloud API
async function getLiveGroqModels(): Promise<string[]> {
  const now = Date.now();
  if (modelCache.groq.models.length > 0 && (now - modelCache.groq.lastFetched < CACHE_TTL_MS)) {
    return modelCache.groq.models;
  }

  if (!GROQ_API_KEY) return STATIC_GROQ_FALLBACKS;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.data)) {
        const discovered = data.data
          .filter((m: any) => {
            const id = m.id || "";
            const isAudio = id.includes("whisper") || id.includes("guard");
            return m.active !== false && !isAudio;
          })
          .map((m: any) => m.id)
          .filter(Boolean);

        if (discovered.length > 0) {
          // Prioritize versatile and instant models
          discovered.sort((a: string, b: string) => {
            const aScore = a.includes("instant") || a.includes("versatile") ? 2 : (a.includes("gpt-oss") ? 1 : 0);
            const bScore = b.includes("instant") || b.includes("versatile") ? 2 : (b.includes("gpt-oss") ? 1 : 0);
            return bScore - aScore;
          });

          console.log(`🎰 [Live Model Discovery] Found ${discovered.length} active Groq models:`, discovered.slice(0, 5).join(", "));
          modelCache.groq.models = discovered;
          modelCache.groq.lastFetched = now;
          return discovered;
        }
      }
    }
  } catch (e: any) {
    console.warn(`[Live Model Discovery] Groq models query failed (${e.message}), using fallback list.`);
  }

  return STATIC_GROQ_FALLBACKS;
}

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

// Robust JSON parser that handles raw JSON, markdown code fences, or wrapped strings
function cleanAndParseJson(text: string): any {
  if (!text || typeof text !== "string") throw new Error("Empty text for JSON parsing");
  
  let cleaned = text.trim();
  // Strip ```json ... ``` or ``` ... ```
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  
  // Direct parse attempt
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // If leading/trailing text exists, extract the outermost { ... }
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const extracted = cleaned.substring(firstBrace, lastBrace + 1);
      return JSON.parse(extracted);
    }
    throw new Error("Could not extract valid JSON object from LLM response");
  }
}

// Check for code/technical content keywords
function isTechnicalTranscript(text: string): boolean {
  const wordCount = text.split(/\s+/).length;
  if (wordCount > 3000) return true;

  const techPattern = /```|function|class|import|export|def |struct|interface|SQL|SELECT|INSERT|UPDATE|DELETE|Error:|Traceback|Exception|at\s+\w+\.\w+|const\s+|let\s+|var\s+/i;
  return techPattern.test(text);
}

// Call single Gemini model
async function callGeminiWithModel(transcript: string, model: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
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
      const err = new Error(`Gemini HTTP ${status} [${model}]: ${errText}`);
      (err as any).status = status;
      throw err;
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error(`Empty response candidate from Gemini [${model}]`);

    return cleanAndParseJson(rawText);
  } finally {
    clearTimeout(timeout);
  }
}

// Call Gemini iterating dynamically through its live model catalog
async function callGemini(transcript: string): Promise<{ capsule: any; modelUsed: string }> {
  if (!GEMINI_API_KEY) throw new Error("Gemini API key not configured");

  const models = await getLiveGeminiModels();
  let lastError: any = null;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      console.log(`🌌 [Gemini] Calling live model "${model}"... (${i + 1}/${models.length})`);
      const capsule = await callGeminiWithModel(transcript, model);
      console.log(`✨ [Gemini] Model "${model}" completed compression successfully!`);
      return { capsule, modelUsed: model };
    } catch (err: any) {
      lastError = err;
      console.warn(`⚠️ [Gemini] Model "${model}" failed (${err.message}). Trying next discovered model...`);
    }
  }
  throw lastError || new Error("All live Gemini models in chain exhausted");
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
      const err = new Error(`Groq HTTP ${status} [${model}]: ${errText}`);
      (err as any).status = status;
      throw err;
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content;
    if (!rawText) throw new Error(`Empty response from Groq [${model}]`);

    return cleanAndParseJson(rawText);
  } finally {
    clearTimeout(timeout);
  }
}

// Call Groq iterating dynamically through its live model catalog
async function callGroq(transcript: string): Promise<{ capsule: any; modelUsed: string }> {
  if (!GROQ_API_KEY) throw new Error("Groq API key not configured");

  const models = await getLiveGroqModels();
  let lastError: any = null;
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      console.log(`🎰 [Groq] Calling live model "${model}"... (${i + 1}/${models.length})`);
      const capsule = await callGroqWithModel(transcript, model);
      console.log(`✅ [Groq] Model "${model}" delivered compression successfully!`);
      return { capsule, modelUsed: model };
    } catch (err: any) {
      lastError = err;
      console.warn(`⚠️ [Groq] Model "${model}" failed (${err.message}). Trying next discovered model...`);
    }
  }
  throw lastError || new Error("All live Groq models in chain exhausted");
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

    // Per-user burst rate-limiting guard
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

    // Server-side safety cap: truncate to 30K chars
    if (transcript.length > 30000) {
      console.log(`✂️ [Transcript] Trimming from ${transcript.length} to 30000 chars for AI processing.`);
      transcript = transcript.substring(0, 30000);
    }

    // 2. Per-user monthly limit check via SECURITY DEFINER RPC
    const { data: usageData, error: usageErr } = await supabaseAdmin.rpc("check_and_increment_usage", {
      target_user_id: user.id,
      max_limit: MONTHLY_FREE_LIMIT
    });

    if (usageErr) {
      console.error("📊 [Quota] RPC check_and_increment_usage error:", usageErr.message);
      // Soft fail on quota verification DB error: don't block user
    } else {
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
    }

    // 3. Smart Routing & Provider Selection
    const today = new Date().toISOString().split("T")[0];
    const isTech = isTechnicalTranscript(transcript);
    const wordCount = transcript.split(/\s+/).length;

    // Prefer Gemini for code/technical or long chats; Groq for casual/short chats
    let preferredProvider: "gemini" | "groq" = isTech ? "gemini" : (GROQ_API_KEY ? "groq" : "gemini");
    let fallbackProvider: "gemini" | "groq" = preferredProvider === "gemini" ? "groq" : "gemini";
    console.log(`🧠 [Router] ${wordCount} words (${isTech ? "technical code" : "conversational"}) ➔ Primary: ${preferredProvider}, Fallback: ${fallbackProvider}`);

    // Soft daily cap increment
    const recordDailyUsage = (provider: string) => {
      supabaseAdmin.rpc("increment_provider_daily", { p_provider: provider, p_date: today }).catch(() => {});
    };

    // 4. Execution Engine with Comprehensive Cross-Provider Chains
    let resultCapsule: any = null;
    let servedBy: string = preferredProvider;

    // Step A: Try Primary Provider Chain
    try {
      if (preferredProvider === "gemini" && GEMINI_API_KEY) {
        const res = await callGemini(transcript);
        resultCapsule = res.capsule;
        servedBy = `gemini (${res.modelUsed})`;
        recordDailyUsage("gemini");
      } else if (preferredProvider === "groq" && GROQ_API_KEY) {
        const res = await callGroq(transcript);
        resultCapsule = res.capsule;
        servedBy = `groq (${res.modelUsed})`;
        recordDailyUsage("groq");
      }
    } catch (primaryErr: any) {
      console.warn(`💥 [Router] Primary provider (${preferredProvider}) failed all models: ${primaryErr.message}`);
    }

    // Step B: Try Alternative Provider Chain if primary failed
    if (!resultCapsule) {
      console.log(`🔄 [Failover] Engaging alternative provider: ${fallbackProvider}...`);
      try {
        if (fallbackProvider === "gemini" && GEMINI_API_KEY) {
          const res = await callGemini(transcript);
          resultCapsule = res.capsule;
          servedBy = `gemini (${res.modelUsed})`;
          recordDailyUsage("gemini");
        } else if (fallbackProvider === "groq" && GROQ_API_KEY) {
          const res = await callGroq(transcript);
          resultCapsule = res.capsule;
          servedBy = `groq (${res.modelUsed})`;
          recordDailyUsage("groq");
        }
      } catch (fallbackErr: any) {
        console.warn(`💥 [Failover] Alternative provider (${fallbackProvider}) also failed all models: ${fallbackErr.message}`);
      }
    }

    // Step C: Ultimate Safety Net — Try Gemini one last time if it hasn't succeeded
    if (!resultCapsule && GEMINI_API_KEY) {
      console.log(`🛡️ [Last Resort] Triggering ultimate safety pass on Gemini baseline models...`);
      for (const baselineModel of ["gemini-1.5-flash", "gemini-2.5-flash", "gemini-2.0-flash"]) {
        try {
          console.log(`🚑 [Last Resort] Attempting baseline Gemini model "${baselineModel}"...`);
          resultCapsule = await callGeminiWithModel(transcript, baselineModel);
          servedBy = `gemini (${baselineModel})`;
          recordDailyUsage("gemini");
          console.log(`✨ [Last Resort] Baseline Gemini model "${baselineModel}" succeeded!`);
          break;
        } catch (e: any) {
          console.warn(`⚠️ [Last Resort] Baseline "${baselineModel}" failed: ${e.message}`);
        }
      }
    }

    // Step D: Ultimate Safety Net — Try Groq baseline if still null
    if (!resultCapsule && GROQ_API_KEY) {
      console.log(`🛡️ [Last Resort] Triggering ultimate safety pass on Groq baseline models...`);
      for (const baselineModel of ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"]) {
        try {
          console.log(`🚑 [Last Resort] Attempting baseline Groq model "${baselineModel}"...`);
          resultCapsule = await callGroqWithModel(transcript, baselineModel);
          servedBy = `groq (${baselineModel})`;
          recordDailyUsage("groq");
          console.log(`✨ [Last Resort] Baseline Groq model "${baselineModel}" succeeded!`);
          break;
        } catch (e: any) {
          console.warn(`⚠️ [Last Resort] Baseline Groq "${baselineModel}" failed: ${e.message}`);
        }
      }
    }

    if (!resultCapsule) {
      console.error("🪦 [Fatal] All models and providers exhausted.");
      return new Response(
        JSON.stringify({ error: "SERVICE_UNAVAILABLE", message: "AI compression providers temporarily unavailable" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Return success
    console.log(`🏆 [Success] Capsule compressed successfully! Served by: ${servedBy}`);
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
