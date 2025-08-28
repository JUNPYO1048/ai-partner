import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OpenAI } from "openai";

const schema = z.object({
  userId: z.string().uuid(),
  topic: z.string().min(1),
  videoType: z.enum(["short","long"]).default("short")
});

const prompt = (topic: string, type: "short"|"long") => `
You are a YouTube content strategist.
Goal: Generate a complete package for a ${type === "short" ? "<60s short-form" : "3–5 min long-form"} video on: "${topic}".
Return STRICT JSON with:
titles[3], script, scene_guides[{script_part,visual,sfx}], description, tags[10-15]
`;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const p = schema.safeParse(body);
  if (!p.success) return NextResponse.json({ status:"error", message:"Invalid body" }, { status:400 });

  const { topic, videoType } = p.data;
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "Return strictly JSON; no markdown." },
      { role: "user", content: prompt(topic, videoType) }
    ],
    response_format: { type: "json_object" }
  });

  const out = JSON.parse(res.choices[0].message.content || "{}");
  return NextResponse.json({ status:"success", ...out });
}
