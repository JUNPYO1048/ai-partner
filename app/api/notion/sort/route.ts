import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Client as Notion } from 'notionhq-client';
import { OpenAI } from 'openai';
import { supabaseServer } from '@/lib/supabase/server';

const bodySchema = z.object({ userId: z.string().uuid(), text: z.string().min(1) });

const systemPrompt = `You are a triage assistant. Classify text into one of: TODO, IDEA, MEETING, CONTACT, BOOKMARK.
Extract structured fields based on the class. Return strict JSON with keys: category, properties.`;

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parse = bodySchema.safeParse(json);
  if (!parse.success) return NextResponse.json({ status:'error', message:'Invalid body' }, { status:400 });

  const { userId, text } = parse.data;
  const sb = supabaseServer();

  const { data: cfg } = await sb.from('user_integrations').select('*').eq('user_id', userId).single();
  if (!cfg?.notion_token) return NextResponse.json({ status:'error', message:'Notion not linked' }, { status:400 });

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(completion.choices[0].message.content || '{}');
  const notion = new Notion({ auth: cfg.notion_token });

  const dbMap = cfg.notion_db_map as Record<string, string>;
  const database_id = dbMap[parsed.category];
  if (!database_id) return NextResponse.json({ status:'error', message:'No database mapped' }, { status:400 });

  const props: any = { Title: { title: [{ text: { content: parsed.properties.task_name || parsed.properties.title || 'Item' } }] } };
  if (parsed.properties.due_date) props.Due = { date: { start: parsed.properties.due_date } };
  if (parsed.properties.assignee) props.Assignee = { people: [{ id: parsed.properties.assignee }] };
  if (parsed.properties.tags?.length) props.Tags = { multi_select: parsed.properties.tags.map((t: string) => ({ name: t })) };

  const page = await notion.pages.create({ parent: { database_id }, properties: props });
  return NextResponse.json({ status: 'success', notionPageUrl: page.url });
}
