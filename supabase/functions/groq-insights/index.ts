// Platform-level Groq AI Insights edge function.
// The GROQ_API_KEY is a Supabase project secret — never exposed to any client.
// All tenants share this platform key (it is free / open-source quota).
// Requires a valid Supabase JWT (authenticated tenant users only).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const apiKey = Deno.env.get('GROQ_API_KEY')
    if (!apiKey) return json({ error: 'AI service not configured (missing GROQ_API_KEY secret)' }, 503)

    const { prompt } = await req.json()
    if (!prompt || typeof prompt !== 'string') return json({ error: 'prompt is required' }, 400)

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 2048,
        messages: [
          {
            role: 'system',
            content: 'You are a sharp business intelligence advisor for African SMEs. Respond ONLY with valid JSON matching the requested schema. No extra text.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return json({ error: (err as any)?.error?.message || `Groq error ${res.status}` }, 502)
    }

    const data = await res.json()
    const text = (data.choices[0]?.message?.content || '') as string
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return json({ error: 'AI returned unexpected format' }, 502)

    return json(JSON.parse(match[0]))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 500)
  }
})
