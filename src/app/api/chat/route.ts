import { NextResponse } from "next/server";

import { chat, type ChatMsg } from "../../../lib/ai-provider";
import {
  buildConversationMessages,
  buildFallbackTurn,
  buildProcessSummary,
  extractCodeFilesFromParsed,
  extractImageArtifactsFromParsed,
  inferChoiceMode,
  normalizeChoiceGroups,
  extractPlanFromParsed,
  extractQuestionsFromText,
  getNextPhase,
  normalizeQuestions,
  parseJsonFromText,
  parsePlanFromMarkdown,
  persistPlanArtifacts,
  restoreLatestPlan,
  safeReplyFromUnparsedAiText,
} from "../../../lib/chat-pipeline";
import {
  buildChatSystemPrompt,
  getInstructionForPhase,
  PLANNING_INSTRUCTION,
} from "../../../lib/chat-prompts";
import { selectSkills } from "../../../lib/skills";
import {
  createEmptyProfile,
  getDetectedFields,
  isProfileReady,
  profileToMarkdown,
  toAPIState,
  updateField,
  type UserProfileMemory,
} from "../../../lib/memory";
import { getManifest, readFile, readSessionState, saveProfile, saveSessionState } from "../../../lib/userspace";
import type {
  ChatMessage,
  ChoiceGroup,
  PersistedSessionState,
  Phase,
  PlanState,
  PreferenceMemory,
  ProgressMemory,
  PromptState,
  UserProfileState,
} from "../../../lib/triage-types";

// ─── In-memory session store ──────────────────────────────────────

type SessionState = {
  messages: ChatMessage[];
  memory: UserProfileMemory;
  phase: Phase;
  plan?: PlanState;
  progress: ProgressMemory;
  preference: PreferenceMemory;
  promptState?: PromptState;
};

const sessions = new Map<string, SessionState>();

function shortSessionId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

function logChatEvent(
  sessionId: string,
  phase: Phase,
  event: string,
  details: Record<string, string | number | boolean | undefined> = {},
): void {
  const detailText = Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");

  console.log(
    `[api/chat] sid=${shortSessionId(sessionId)} phase=${phase} event=${event}${detailText ? ` ${detailText}` : ""}`,
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function createProgress(phase: Phase, plan?: PlanState): ProgressMemory {
  return {
    phase,
    currentPlanVersion: plan?.version,
    updatedAt: nowIso(),
  };
}

function createPreference(memory?: UserProfileMemory): PreferenceMemory {
  const explanationPreference = memory?.explanationPreference?.value || undefined;
  return {
    explanationPreference,
    interactionPreference: "button",
    outputDetail: explanationPreference?.includes("专业")
      ? "professional"
      : explanationPreference?.includes("简单") || explanationPreference?.includes("小白")
        ? "simple"
        : "balanced",
    updatedAt: nowIso(),
  };
}

function updateSessionProgress(session: SessionState, message: string): void {
  session.progress = {
    ...session.progress,
    phase: session.phase,
    currentPlanVersion: session.plan?.version,
    lastUserMessage: message,
    lastChoiceSummary: message.startsWith("我选择了") || message.includes("：")
      ? message
      : session.progress.lastChoiceSummary,
    updatedAt: nowIso(),
  };
}

function updateSessionPreference(session: SessionState, message: string): void {
  const explanationPreference = session.memory.explanationPreference.value || session.preference.explanationPreference;
  const outputDetail = message.includes("更专业")
    ? "professional"
    : message.includes("更简单") || message.includes("小白")
      ? "simple"
      : session.preference.outputDetail ?? "balanced";
  const interactionPreference = message.startsWith("我选择了")
    ? "multi_select"
    : message.length > 24
      ? "free_text"
      : "button";

  session.preference = {
    explanationPreference,
    outputDetail,
    interactionPreference,
    updatedAt: nowIso(),
  };
}

function applyPersistedProfile(
  memory: UserProfileMemory,
  state: PersistedSessionState | null,
): UserProfileMemory {
  if (!state?.profile) return memory;
  let next = memory;
  for (const [field, value] of Object.entries(state.profile) as [keyof UserProfileState, string][]) {
    if (!value || !(field in next)) continue;
    const confidence = state.profileConfidence?.[field] ?? 0.7;
    next = updateField(
      next,
      field,
      value,
      confidence >= 1 ? "user_confirmed" : confidence >= 0.7 ? "deduced" : "inferred",
      confidence,
    );
  }
  return next;
}

function persistSessionState(sessionId: string, session: SessionState): void {
  const profile = getDetectedFields(session.memory).length > 0
    ? toAPIState(session.memory)
    : undefined;
  const profileConfidence = profile
    ? Object.fromEntries(
        Object.entries(session.memory).map(([k, f]) => [k, (f as { confidence: number }).confidence]),
      )
    : undefined;

  saveSessionState(sessionId, {
    profile,
    profileConfidence,
    phase: session.phase,
    progress: session.progress,
    preference: session.preference,
    promptState: session.promptState,
    currentPlanVersion: session.plan?.version,
    updatedAt: nowIso(),
  });
}

// ─── Route handler ────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, sessionId } = body as { message?: string; sessionId?: string };

    if (!message || !sessionId) {
      return NextResponse.json(
        { error: "缺少 message 或 sessionId" },
        { status: 400 },
      );
    }

    // Get or create session (with disk recovery)
    let session = sessions.get(sessionId);

    if (!session) {
      // Try to recover from userspace disk
      const manifest = getManifest(sessionId);
      const hasFiles = manifest.length > 0;

      if (hasFiles) {
        const persisted = readSessionState(sessionId);
        // Rebuild session from disk data
        const restoredMemory = applyPersistedProfile(createEmptyProfile(), persisted);
        session = {
          messages: [],
          memory: restoredMemory,
          phase: persisted?.phase ?? "profiling", // was past greeting
          progress: persisted?.progress ?? createProgress(persisted?.phase ?? "profiling"),
          preference: persisted?.preference ?? createPreference(restoredMemory),
          promptState: persisted?.promptState,
        };

        // Try markdown profile as a fallback if machine-readable state is missing.
        const profileRaw = readFile(sessionId, "profile.md");
        if (profileRaw && !persisted?.profile) {
          // Rebuild a basic profile from markdown
          const pmdMatch = profileRaw.match(/- [✅🔍❓] \*\*(.+?)\*\*: (.+)/g);
          if (pmdMatch) {
            for (const line of pmdMatch) {
              const m = line.match(/- [✅🔍❓] \*\*(.+?)\*\*: (.+)/);
              if (m) {
                const labelMap: Record<string, keyof UserProfileState> = {
                  "年龄段": "ageOrGeneration",
                  "代际": "ageOrGeneration",
                  "教育水平": "educationLevel",
                  "工具能力": "toolAbility",
                  "AI 熟悉度": "aiFamiliarity",
                  "科研理解度": "researchFamiliarity",
                  "兴趣方向": "interestArea",
                  "当前卡点": "currentBlocker",
                  "可用设备": "deviceAvailable",
                  "可用时间": "timeAvailable",
                  "解释偏好": "explanationPreference",
                };
                const key = labelMap[m[1]];
                const value = m[2]?.replace(/\s*\(未识别\)/, "").trim();
                const isConfirmed = line.startsWith("- ✅") || line.startsWith("- ●");
                if (key && value && key in session.memory) {
                  session.memory = updateField(
                    session.memory, key, value,
                    isConfirmed ? "user_confirmed" : "deduced",
                    isConfirmed ? 1.0 : 0.7,
                  );
                }
              }
            }
          }
        }

        const restoredPlan = restoreLatestPlan(sessionId, manifest);
        if (restoredPlan) {
          session.plan = restoredPlan;
          session.phase = "reviewing";
        } else if (isProfileReady(session.memory)) {
          session.phase = "clarifying";
        } else {
          session.phase = "profiling";
        }
        session.progress = {
          ...session.progress,
          phase: session.phase,
          currentPlanVersion: session.plan?.version,
          updatedAt: nowIso(),
        };
        session.preference = {
          ...session.preference,
          explanationPreference: session.memory.explanationPreference.value || session.preference.explanationPreference,
          updatedAt: nowIso(),
        };

        console.log(`[api/chat] Session ${sessionId.slice(0, 8)} recovered from disk (phase=${session.phase})`);
      } else {
        // Fresh session
        session = {
          messages: [],
          memory: createEmptyProfile(),
          phase: "greeting",
          progress: createProgress("greeting"),
          preference: createPreference(),
        };
      }

      sessions.set(sessionId, session);
    }

    // Append user message
    const userMsg: ChatMessage = {
      role: "user",
      content: message,
      timestamp: Date.now(),
    };
    session.messages.push(userMsg);
    const phaseAtStart = session.phase;
    logChatEvent(sessionId, phaseAtStart, "turn_start", {
      mode: "pending",
      msgChars: message.length,
      history: session.messages.length,
      hasPlan: !!session.plan,
    });

    const instruction = getInstructionForPhase(session.phase);
    const skillSelection = selectSkills(session.memory, session.phase, session.plan);
    session.promptState = {
      selectedSkills: skillSelection.selectedSkills,
      reason: skillSelection.reason,
      updatedAt: nowIso(),
    };
    const systemPrompt = buildChatSystemPrompt(
      session.memory,
      session.phase,
      instruction,
      session.plan,
      session.promptState.selectedSkills,
    );

    // Build multi-turn messages
    const aiMessages = buildConversationMessages(systemPrompt, session.messages);

    // Call AI (with generous token limit to prevent mid-JSON truncation)
    let aiResult: Awaited<ReturnType<typeof chat>>;
    try {
      logChatEvent(sessionId, session.phase, "ai_request", {
        mode: "ai",
        step: "primary",
        msgs: aiMessages.length,
      });
      aiResult = await chat({
        messages: aiMessages,
        temperature: 0.4,
        maxTokens: 4096,
        traceLabel: `sid=${shortSessionId(sessionId)} phase=${session.phase} step=primary`,
      });
    } catch (err) {
      const fallback = buildFallbackTurn(session.phase, isProfileReady(session.memory), !!session.plan);
      const fallbackChoiceGroups = normalizeChoiceGroups(
        undefined,
        fallback.questions,
        inferChoiceMode(fallback.reply, fallback.questions),
      );
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: fallback.reply,
        questions: fallback.questions,
        choiceGroups: fallbackChoiceGroups,
        timestamp: Date.now(),
      };
      session.messages.push(assistantMsg);

      if (session.phase === "greeting") {
        session.phase = "profiling";
      }
      updateSessionProgress(session, message);
      updateSessionPreference(session, message);
      persistSessionState(sessionId, session);
      const process = buildProcessSummary({
        phase: phaseAtStart,
        nextPhase: session.phase,
        memory: session.memory,
        questions: fallback.questions,
        plan: session.plan,
        fallback: true,
      });

      const profileState = getDetectedFields(session.memory).length > 0
        ? toAPIState(session.memory)
        : undefined;
      const profileConfidence = profileState
        ? Object.fromEntries(
            Object.entries(session.memory).map(([k, f]) => [k, (f as { confidence: number }).confidence]),
          )
        : undefined;

      console.warn(
        `[api/chat] sid=${shortSessionId(sessionId)} phase=${session.phase} event=fallback reason=${err instanceof Error ? err.message : String(err)}`,
      );

      return NextResponse.json({
        reply: fallback.reply,
        questions: fallback.questions,
        choiceGroups: fallbackChoiceGroups,
        process,
        profile: profileState,
        profileConfidence,
        phase: session.phase,
        plan: session.plan,
        _fallback: true,
      });
    }
    let parsed = parseJsonFromText(aiResult.content);

    // Retry once with explicit demand if first attempt failed. Plan-producing
    // phases must not leak protocol JSON into the chat bubble.
    if (!parsed) {
      logChatEvent(sessionId, session.phase, "ai_parse_retry", {
        mode: "ai",
        step: "json_retry",
        firstChars: aiResult.content.length,
      });
      const retryMsgs: ChatMsg[] = [
        ...aiMessages,
        { role: "assistant" as const, content: aiResult.content },
        { role: "user" as const, content: "上一轮回复不是JSON。请严格按照JSON格式重新输出，以{开头以}结尾。" },
      ];
      aiResult = await chat({
        messages: retryMsgs,
        temperature: 0.3,
        maxTokens: 4096,
        traceLabel: `sid=${shortSessionId(sessionId)} phase=${session.phase} step=json_retry`,
      });
      parsed = parseJsonFromText(aiResult.content);
    }

    let reply: string;
    let questions: string[] = [];
    let choiceGroups: ChoiceGroup[] = [];
    let profileState: UserProfileState | null = null;
    let profileConfidence: Record<string, number> | null = null;
    let planState: PlanState | null = null;
    let codeFilesCount = 0;
    let imageArtifactsCount = 0;
    let checklistPassed = false;

    if (parsed) {
      // Extract reply — might be "reply", "summary", or missing entirely
      reply = typeof parsed.reply === "string" ? parsed.reply :
              typeof parsed.summary === "string" ? parsed.summary : "";

      questions = normalizeQuestions(parsed.questions);
      choiceGroups = normalizeChoiceGroups(
        parsed.choiceGroups ?? parsed.choice_groups,
        questions,
        inferChoiceMode(reply, questions, parsed.choiceMode ?? parsed.choice_mode),
      );

      // Try to extract plan from JSON response (handles any naming convention)
      const version = (session.plan?.version ?? 0) + 1;
      const extractedPlan = extractPlanFromParsed(parsed, version);
      const extractedCodeFiles = extractCodeFilesFromParsed(parsed, version);
      const extractedImageArtifacts = extractImageArtifactsFromParsed(parsed, version);
      if (extractedPlan && extractedPlan.actionSteps.length > 0) {
        planState = extractedPlan;
        if (session.phase === "reviewing") {
          planState.modifiedReason = message;
        }
        persistPlanArtifacts(sessionId, planState, extractedCodeFiles, extractedImageArtifacts);
        session.plan = planState;
        codeFilesCount = extractedCodeFiles.length;
        imageArtifactsCount = extractedImageArtifacts.length;
        logChatEvent(sessionId, session.phase, "plan_persisted", {
          mode: "ai",
          version: planState.version,
          steps: planState.actionSteps.length,
          codeFiles: extractedCodeFiles.length,
          images: extractedImageArtifacts.length,
        });
      }

      // Apply profile updates if present
      if (Array.isArray(parsed.profileUpdates)) {
        for (const update of parsed.profileUpdates as Array<{
          field?: string;
          value?: string;
          confidence?: number;
        }>) {
          if (update.field && update.value && update.field in session.memory) {
            const conf = typeof update.confidence === "number" ? update.confidence : 0.5;
            const source = conf >= 1.0 ? "user_confirmed" as const :
                          conf >= 0.7 ? "deduced" as const : "inferred" as const;
            session.memory = updateField(
              session.memory,
              update.field as keyof UserProfileState,
              update.value,
              source,
              conf,
            );
          }
        }
      }

      // Always send current profile state when we have any data
      if (getDetectedFields(session.memory).length > 0) {
        const md = profileToMarkdown(session.memory);
        saveProfile(sessionId, md);
        profileState = toAPIState(session.memory);
        profileConfidence = Object.fromEntries(
          Object.entries(session.memory).map(([k, f]) => [k, (f as { confidence: number }).confidence]),
        );
      }

      // Check for checklist result (clarifying phase)
      if (typeof parsed.checklistPassed === "boolean") {
        checklistPassed = parsed.checklistPassed;
      }

      if (session.phase === "clarifying" && checklistPassed && !planState) {
        const planningSkillSelection = selectSkills(session.memory, "planning", session.plan);
        session.promptState = {
          selectedSkills: planningSkillSelection.selectedSkills,
          reason: planningSkillSelection.reason,
          updatedAt: nowIso(),
        };
        const planningSystemPrompt = buildChatSystemPrompt(
          session.memory,
          "planning",
          PLANNING_INSTRUCTION,
          session.plan,
          session.promptState.selectedSkills,
        );
        const planningMessages = buildConversationMessages(planningSystemPrompt, session.messages);
        logChatEvent(sessionId, session.phase, "ai_request", {
          mode: "ai",
          step: "clarifying_to_planning",
          msgs: planningMessages.length,
        });
        aiResult = await chat({
          messages: planningMessages,
          temperature: 0.4,
          maxTokens: 4096,
          traceLabel: `sid=${shortSessionId(sessionId)} phase=planning step=clarifying_to_planning`,
        });

        const planningParsed = parseJsonFromText(aiResult.content);
        const version = (session.plan?.version ?? 0) + 1;
        const planningCodeFiles = planningParsed
          ? extractCodeFilesFromParsed(planningParsed, version)
          : [];
        const planningImageArtifacts = planningParsed
          ? extractImageArtifactsFromParsed(planningParsed, version)
          : [];
        planState = planningParsed
          ? extractPlanFromParsed(planningParsed, version)
          : parsePlanFromMarkdown(aiResult.content, version);

        if (planState) {
          persistPlanArtifacts(sessionId, planState, planningCodeFiles, planningImageArtifacts);
          session.plan = planState;
          codeFilesCount = planningCodeFiles.length;
          imageArtifactsCount = planningImageArtifacts.length;
          logChatEvent(sessionId, "planning", "plan_persisted", {
            mode: "ai",
            version: planState.version,
            steps: planState.actionSteps.length,
            codeFiles: planningCodeFiles.length,
            images: planningImageArtifacts.length,
          });
          reply = typeof planningParsed?.reply === "string"
            ? planningParsed.reply
            : "Plan 已生成，可在右侧面板查看详情。";
          questions = [];
          choiceGroups = [];
        }
      }
    } else {
      // AI didn't return valid JSON — fall back to text extraction
      reply = safeReplyFromUnparsedAiText(aiResult.content, session.phase);
      questions = normalizeQuestions(extractQuestionsFromText(aiResult.content));
      choiceGroups = normalizeChoiceGroups(
        undefined,
        questions,
        inferChoiceMode(reply, questions),
      );

      // Try to parse plan from markdown during plan-producing phases
      if (session.phase === "planning" || session.phase === "clarifying" || session.phase === "reviewing") {
        const version = (session.plan?.version ?? 0) + 1;
        const mdPlan = parsePlanFromMarkdown(aiResult.content, version);
        if (mdPlan && mdPlan.actionSteps.length > 0) {
          planState = mdPlan;
          if (session.phase === "reviewing") {
            planState.modifiedReason = message;
          }
          persistPlanArtifacts(sessionId, planState);
          session.plan = planState;
          logChatEvent(sessionId, session.phase, "plan_persisted", {
            mode: "ai_text_fallback",
            version: planState.version,
            steps: planState.actionSteps.length,
            codeFiles: 0,
          });
        }
      }

      // Still save any existing profile to disk
      if (getDetectedFields(session.memory).length > 0) {
        const md = profileToMarkdown(session.memory);
        saveProfile(sessionId, md);
        profileState = toAPIState(session.memory);
        profileConfidence = Object.fromEntries(
          Object.entries(session.memory).map(([k, f]) => [k, (f as { confidence: number }).confidence]),
        );
      }
      console.warn(
        `[api/chat] sid=${shortSessionId(sessionId)} phase=${session.phase} event=non_json mode=ai_text_fallback questions=${questions.length} plan=${!!planState}`,
      );
    }

    // If plan was generated (from JSON or markdown), force reply to be short
    if (planState) {
      reply = codeFilesCount > 0 || imageArtifactsCount > 0
        ? `✅ Plan 已生成，并同步产出 ${codeFilesCount} 个代码文件、${imageArtifactsCount} 个图片引用，可在右侧面板查看详情。`
        : "✅ Plan 已生成，可在右侧面板查看详情。你可以继续对话来调整计划。";
      questions = []; // No follow-up questions when showing plan
      choiceGroups = [];
    }

    const nextPhase = getNextPhase({
      currentPhase: session.phase,
      memory: session.memory,
      planState,
      checklistPassed,
    });

    const process = buildProcessSummary({
      phase: phaseAtStart,
      nextPhase,
      memory: session.memory,
      questions,
      plan: planState,
      checklistPassed,
    });

    const assistantMsg: ChatMessage = {
      role: "assistant",
      content: reply,
      questions: questions.length > 0 ? questions : undefined,
      choiceGroups: choiceGroups.length > 0 ? choiceGroups : undefined,
      process,
      timestamp: Date.now(),
    };
    session.messages.push(assistantMsg);
    logChatEvent(sessionId, nextPhase, "turn_complete", {
      mode: planState || parsed ? "ai" : "ai_text_fallback",
      replyChars: reply.length,
      questions: questions.length,
      planVersion: planState?.version,
      profileSignals: getDetectedFields(session.memory).length,
    });

    // Phase transitions
    session.phase = nextPhase;
    updateSessionProgress(session, message);
    updateSessionPreference(session, message);
    persistSessionState(sessionId, session);

    // Build response
    const response: {
      reply: string;
      questions?: string[];
      choiceGroups?: ChoiceGroup[];
      process?: string;
      profile?: UserProfileState;
      profileConfidence?: Record<string, number>;
      phase: Phase;
      plan?: PlanState;
    } = {
      reply,
      process,
      phase: session.phase,
    };

    if (questions.length > 0) {
      response.questions = questions;
    }
    if (choiceGroups.length > 0) {
      response.choiceGroups = choiceGroups;
    }
    if (profileState) {
      response.profile = profileState;
      if (profileConfidence) response.profileConfidence = profileConfidence;
    }
    if (planState) {
      response.plan = planState;
    }

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause ? ` cause=${String(err.cause)}` : "";
    console.error(`[api/chat] ${msg}${cause}`);
    return NextResponse.json({ error: `${msg}${cause}` }, { status: 500 });
  }
}
