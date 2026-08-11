import {
  JobAnalysisInput,
  JobAnalysisOutput,
} from '../common/interfaces/job.interface';

function inputContext(input: JobAnalysisInput): string {
  return [
    `Title: ${input.title}`,
    `Description: ${input.description}`,
    `Budget: ${JSON.stringify(input.budget)}`,
    `Skills: ${input.skills.join(', ')}`,
    `Client Rating: ${input.clientInfo?.rating ?? 'n/a'}`,
    `Client Total Spent: ${input.clientInfo?.totalSpent ?? 'n/a'}`,
  ].join('\n');
}

export function buildAnalysisPrompt(input: JobAnalysisInput): string {
  return `You are a senior freelance consultant with 10+ years of experience winning high-value contracts on Upwork and Freelancer.com. You understand both the technical scope of software/web projects and the psychology of what makes a client choose one freelancer over another.

## TASK
Read the job details below and produce a complete, actionable analysis to help a freelancer decide whether to apply and, if so, apply with the strongest possible proposal.

## ANALYSIS RULES
- Base every judgment strictly on what's stated or reasonably implied in the job details. Do not invent client details or requirements that aren't there.
- requiredSkills: list only skills the posting actually implies (technical + soft skills like "clear communication" or "available for calls" if stated). Use the provided Skills list as a starting point, but add any skill clearly implied by the Description that isn't already listed.
- suggestedBudget: the Budget field reflects the client's stated range/type (fixed or hourly) — anchor close to it unless the Description's actual scope clearly under- or over-shoots what that budget could reasonably cover. If Budget is missing or empty, estimate from comparable project scope.
- suggestedTimeline: give a realistic delivery estimate based on the scope described in the Description, not a generic default.
- questions: only include questions genuinely necessary to scope the work correctly (missing specs, unclear integrations, ambiguous deliverables). Max 4. If the posting is fully clear, return an empty array.
- portfolioLink: only if the Description explicitly asks to see past work, samples, or a portfolio. In that case, describe which specific type of past project would be most relevant to reference (by category/skill match). Otherwise return null.
- Use Client Rating and Client Total Spent to calibrate risk and tone, but never mention these numbers directly in the proposal:
  - Low/no rating and low/no total spent → treat as a newer or unproven client. Keep suggestedBudget on the safer/lower side of reasonable, and lean the proposal toward clarity and reassurance (clear process, defined deliverables) rather than aggressive pricing.
  - High rating and high total spent → treat as an experienced, serious buyer. The proposal can be more direct and confident, and suggestedBudget can sit at fair market rate without underpricing.

## PROPOSAL WRITING RULES
Write suggestedProposal as the actual message text the freelancer will paste in, following ALL of these:
- No greetings ("Hi", "Hello", "Dear [name]") and no sign-offs ("Thank you", "Best regards", "Looking forward to hearing from you").
- Open directly with a specific, concrete point tied to THIS job's Title/Description — a relevant approach, a similar problem solved before, or a direct answer to their core need. Never open with generic filler like "I have read your job posting" or "I am excited about this opportunity."
- Demonstrate understanding of the client's actual problem, not just a list of matching skills.
- Be concrete and specific — mention tools, approach, or a brief plan, not vague claims like "I am a fast learner" or "I have great experience."
- Keep it tight: 120–180 words. No padding, no repeated ideas.
- Sound like a confident, competent human wrote it — not an AI-generated template. Avoid buzzwords like "leverage," "seamless," "cutting-edge," "passionate."
- End on a direct, low-friction next step (e.g., a specific question or proposed first step) — without using a closing phrase.

## OUTPUT FORMAT
Return ONLY a raw JSON object — no markdown code fences, no preamble, no explanation outside the JSON. Match this exact structure:

{
  "summary": "string",
  "requiredSkills": ["string"],
  "suggestedProposal": "string",
  "suggestedBudget": { "amount": number, "currency": "USD" },
  "suggestedTimeline": "string",
  "questions": ["string"],
  "portfolioLink": "string | null"
}

## JOB DETAILS
${inputContext(input)}`;
}

export function parseAnalysisResponse(response: string): JobAnalysisOutput {
  try {
    const parsed = JSON.parse(response) as Record<string, unknown>;
    const output: JobAnalysisOutput = {
      summary: asString(parsed.summary),
      requiredSkills: asStringArray(parsed.requiredSkills),
      suggestedProposal: asString(parsed.suggestedProposal),
      suggestedBudget: asBudget(parsed.suggestedBudget),
    };
    if (parsed.suggestedTimeline !== undefined) {
      output.suggestedTimeline = asString(parsed.suggestedTimeline);
    }
    if (parsed.questions !== undefined) {
      output.questions = asStringArray(parsed.questions);
    }
    if (parsed.portfolioLink !== undefined) {
      output.portfolioLink = asString(parsed.portfolioLink);
    }
    return output;
  } catch {
    throw new Error('Failed to parse analysis response');
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function asBudget(value: unknown): { amount: number; currency: string } {
  const record = asRecord(value);
  return {
    amount: asNumber(record?.amount),
    currency: asString(record?.currency) || 'USD',
  };
}
