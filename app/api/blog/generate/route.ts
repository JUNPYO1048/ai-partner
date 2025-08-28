import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { OpenAI } from 'openai';

const schema = z.object({
  userId: z.string().uuid(),
  keyword: z.string().min(1),
  tone: z.string().default('professional')
});

const prompt = (kw: string, tone: string) => `You are a 10-year SEO content strategist.
Keyword: ${kw}. Tone: ${tone}.
Produce JSON with keys:
- titles: array of 3
- body: { introduction, main_1, main_2, main_3, conclusion }
- seo_pack: { meta_description, tags (<=10), image_suggestions (<=5) }
Return STRICT JSON only.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const p = schema.safeParse(body);
    if (!p.success) return NextResponse.json({ status:'error', message:'Invalid body' }, { status:400 });

    const { keyword, tone } = p.data;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Return strictly JSON; no markdown.' },
        { role: 'user', content: prompt(keyword, tone) }
      ],
      response_format: { type: 'json_object' }
    });

    const out = JSON.parse(res.choices[0].message.content || '{}');
    return NextResponse.json({ status:'success', ...out });
  } catch (e:any) {
    return NextResponse.json({ status:'error', message:e?.message || 'Server error' }, { status:500 });
  }
}
