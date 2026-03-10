// Cliente Google AI com arquitetura GESTOR
// O LLM é SEMPRE o GESTOR que assume personas diferentes

import { GoogleGenerativeAI } from '@google/generative-ai'

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY!
if (!GOOGLE_API_KEY) {
  throw new Error('GOOGLE_API_KEY é obrigatório')
}

const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY)
const MODELO = process.env.GEMINI_MODEL || 'gemini-2.0-flash'
const MODELO_PSICO = process.env.GEMINI_MODEL_PSICO || 'gemini-2.5-flash' // Mais rápido para PSICO
const LLM_TIMEOUT_MS = parseInt(process.env.LLM_TIMEOUT_MS || '60000', 10)

// Interface para resposta estruturada
export interface RespostaLLM {
  textoParaAluno: string
  jsonData?: any // dados estruturados retornados pela persona
  raw: string // resposta original completa
  // Métricas da chamada
  tempo_ms: number
  tokens_input: number
  tokens_output: number
  tokens_total: number
  modelo: string
}

export async function chamarLLM(
  systemPrompt: string,
  contexto: string,
  mensagemAluno: string,
  persona: string
): Promise<RespostaLLM> {

  // Sistema de instrução GESTOR — envelope rigoroso (centralizado em construirEnvelopeGestor)
  const gestorSystemPrompt = construirEnvelopeGestor(systemPrompt, contexto, persona, mensagemAluno)

  // Usar modelo específico para PSICO (mais rápido) ou modelo padrão para heróis
  const modeloEscolhido = persona === 'PSICOPEDAGOGICO' ? MODELO_PSICO : MODELO

  const model = genAI.getGenerativeModel({
    model: modeloEscolhido,
    systemInstruction: gestorSystemPrompt,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 3000,
    }
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
  const inicioChamada = Date.now()

  try {
    const result = await model.generateContent(
      {
        contents: [{ role: 'user', parts: [{ text: mensagemAluno }] }],
      },
      { signal: controller.signal as any }
    )

    const tempo_ms = Date.now() - inicioChamada
    const raw = result.response.text()
    const parsed = extrairJSONouTexto(raw, persona)

    // Extrair contagem de tokens da resposta do Gemini
    const usageMetadata = result.response.usageMetadata
    const tokens_input = usageMetadata?.promptTokenCount ?? 0
    const tokens_output = usageMetadata?.candidatesTokenCount ?? 0
    const tokens_total = usageMetadata?.totalTokenCount ?? (tokens_input + tokens_output)

    return {
      textoParaAluno: parsed.texto,
      jsonData: parsed.json,
      raw: raw,
      tempo_ms,
      tokens_input,
      tokens_output,
      tokens_total,
      modelo: MODELO
    }

  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`LLM timeout após ${LLM_TIMEOUT_MS / 1000}s (persona: ${persona}, modelo: ${MODELO})`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Versão streaming — usada para enviar resposta do herói em tempo real via SSE
// Retorna métricas acumuladas ao final. Chunks de texto são emitidos via callback.
// ─────────────────────────────────────────────────────────────────────────────
export async function chamarLLMStream(
  systemPrompt: string,
  contexto: string,
  mensagemAluno: string,
  persona: string,
  onChunk: (texto: string) => void
): Promise<{ tokens_input: number; tokens_output: number; tokens_total: number; tempo_ms: number; modelo: string }> {

  const gestorSystemPrompt = construirEnvelopeGestor(systemPrompt, contexto, persona, mensagemAluno)

  const model = genAI.getGenerativeModel({
    model: MODELO,
    systemInstruction: gestorSystemPrompt,
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 3000,
    }
  })

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS)
  const inicioChamada = Date.now()

  try {
    const result = await model.generateContentStream(
      { contents: [{ role: 'user', parts: [{ text: mensagemAluno }] }] },
      { signal: controller.signal as any }
    )

    // Acumular texto completo para extrair JSON no final se necessário
    let rawAcumulado = ''
    let jsonDetectado = false
    let bufferJSON = ''

    for await (const chunk of result.stream) {
      const texto = chunk.text()
      if (!texto) continue

      rawAcumulado += texto

      // Se parece resposta JSON (começa com { ou ```), acumular sem emitir
      if (!jsonDetectado && (rawAcumulado.trimStart().startsWith('{') || rawAcumulado.trimStart().startsWith('```'))) {
        jsonDetectado = true
        bufferJSON += texto
        continue
      }

      if (jsonDetectado) {
        // Acumulando JSON — não emite nada ainda
        bufferJSON += texto
        continue
      }

      // Texto puro — emitir chunk imediatamente
      onChunk(texto)
    }

    // Se acumulou JSON, extrair texto e emitir de uma vez
    if (jsonDetectado && bufferJSON) {
      const parsed = extrairJSONouTexto(bufferJSON, persona)
      if (parsed.texto) {
        onChunk(parsed.texto)
      }
    }

    const tempo_ms = Date.now() - inicioChamada
    const response = await result.response
    const usageMetadata = response.usageMetadata
    const tokens_input = usageMetadata?.promptTokenCount ?? 0
    const tokens_output = usageMetadata?.candidatesTokenCount ?? 0
    const tokens_total = usageMetadata?.totalTokenCount ?? (tokens_input + tokens_output)

    return { tokens_input, tokens_output, tokens_total, tempo_ms, modelo: MODELO }

  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`LLM stream timeout após ${LLM_TIMEOUT_MS / 1000}s (persona: ${persona})`)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

// Extrai o envelope GESTOR para reutilização entre as duas funções
function construirEnvelopeGestor(
  systemPrompt: string,
  contexto: string,
  persona: string,
  mensagemAluno: string
): string {

  // Instruções de formato específicas por persona — reforço próximo ao ponto de geração
  // O Gemini tende a ignorar instruções de formato enterradas no meio do prompt
  const instrucaoFormatoPorPersona: Record<string, string> = {
    PSICOPEDAGOGICO: `
⚠️ INSTRUÇÃO DE FORMATO OBRIGATÓRIA — PSICOPEDAGOGICO:
Retorne APENAS JSON válido, sem texto antes ou depois, sem markdown, sem blocos de código.

## EXEMPLOS DE RESPOSTAS CORRETAS (Few-Shot Learning):

### Exemplo 1 - Tema claro (matemática):
Entrada do aluno: "preciso ajuda com frações"
Resposta CORRETA:
{
  "acao": "ENCAMINHAR_PARA_HEROI",
  "resposta_para_aluno": "Oi! Vou te conectar com o CALCULUS, nosso especialista em matemática! Ele vai te ajudar com frações usando exemplos divertidos.",
  "heroi_escolhido": "CALCULUS",
  "plano_atendimento": {
    "tema": "matematica",
    "subtema": "fracoes_basicas",
    "dificuldade": "iniciante",
    "estrategia": "uso de analogias do dia a dia (pizza, futebol)"
  },
  "instrucoes_para_heroi": "João tem 9 anos, é visual e prático. Use pizza e futebol como exemplos. Ele tem atenção curta, então seja objetivo e use emojis. Dificuldade: frações."
}

### Exemplo 2 - Tema claro (português):
Entrada do aluno: "como usar crase?"
Resposta CORRETA:
{
  "acao": "ENCAMINHAR_PARA_HEROI",
  "resposta_para_aluno": "Que ótima pergunta! Vou chamar a VERBETA, nossa especialista em português. Ela vai te ensinar a crase de um jeito super fácil!",
  "heroi_escolhido": "VERBETA",
  "plano_atendimento": {
    "tema": "portugues",
    "subtema": "crase_regra_vai_volta",
    "dificuldade": "intermediario",
    "estrategia": "regra prática do 'vai e volta' com exemplos do cotidiano"
  },
  "instrucoes_para_heroi": "João tem 9 anos e gosta de desafios. Use a regra do 'vai e volta' de forma gamificada. Ele responde bem a superpoderes e missões."
}

### Exemplo 3 - Quando NÃO encaminhar (precisa de mais dados):
Entrada do aluno: "não entendi"
Resposta CORRETA:
{
  "acao": "PERGUNTAR_AO_ALUNO",
  "resposta_para_aluno": "Sem problemas! Para eu te ajudar melhor, me conta: você está com dúvida em matemática ou em português? E qual é a sua dúvida específica?",
  "heroi_escolhido": null,
  "plano_atendimento": null,
  "instrucoes_para_heroi": null
}

## RACIOCÍNIO PASSO A PASSO (Chain-of-Thought):
Antes de responder, pense:
1. Qual é o tema da dúvida? (matematica/portugues/outro)
2. O tema está CLARO o suficiente para encaminhar? Se sim → ENCAMINHAR_PARA_HEROI. Se não → PERGUNTAR_AO_ALUNO
3. Qual herói é mais adequado para este tema?
4. Quais características do aluno o herói deve saber?
5. Qual estratégia pedagógica considerando a idade (${contexto.match(/(\d+) anos/)?.[1] || '9'} anos) e perfil?

## ESTRUTURA OBRIGATÓRIA:
{
  "acao": "PERGUNTAR_AO_ALUNO" | "ENCAMINHAR_PARA_HEROI" | "ENCAMINHAR_PARA_HUMANO",
  "resposta_para_aluno": "texto visível ao aluno (máx 3 frases, tom acolhedor e motivador)",
  "heroi_escolhido": "CALCULUS" | "VERBETA" | null,
  "plano_atendimento": {
    "tema": "matematica|portugues",
    "subtema": "específico",
    "dificuldade": "iniciante|intermediario|avancado",
    "estrategia": "descrição da abordagem"
  } | null,
  "instrucoes_para_heroi": "instruções detalhadas e personalizadas" | null
}

## ERROS COMUNS A EVITAR:
❌ Nunca retorne texto fora do JSON
❌ Nunca use markdown \`\`\`json
❌ Nunca deixe campos obrigatórios vazios
❌ Nunca encaminhe se o tema não estiver claro`,

    CALCULUS: `
⚠️ INSTRUÇÃO DE FORMATO OBRIGATÓRIA — CALCULUS:
Retorne APENAS JSON válido, sem texto antes ou depois, sem markdown, sem blocos de código.
Estrutura obrigatória:
{
  "agent_id": "CALCULUS",
  "tema": "matematica",
  "reply_text": "resposta completa para o aluno",
  "sinal_psicopedagogico": false,
  "motivo_sinal": null,
  "observacoes_internas": "nota pedagógica interna"
}

REGRAS PEDAGÓGICAS OBRIGATÓRIAS para reply_text:
1. USE 1 BLOCO DIDÁTICO PRINCIPAL do Kit (escolha o mais adequado ao contexto)
2. Termine SEMPRE com 1 pergunta de verificação de compreensão
3. Conecte com os interesses do aluno (futebol, pizza, dinossauros etc.)
4. Máximo 200 palavras no reply_text
5. NUNCA entregue resposta pronta — use abordagem construtivista`,

    VERBETA: `
⚠️ INSTRUÇÃO DE FORMATO OBRIGATÓRIA — VERBETA:
Retorne APENAS JSON válido, sem texto antes ou depois, sem markdown, sem blocos de código.
Estrutura obrigatória:
{
  "agent_id": "VERBETA",
  "tema": "portugues",
  "reply_text": "resposta completa para o aluno",
  "sinal_psicopedagogico": false,
  "motivo_sinal": null,
  "observacoes_internas": "nota pedagógica interna"
}

REGRAS PEDAGÓGICAS OBRIGATÓRIAS para reply_text:
1. USE 1 BLOCO CONSTRUTIVISTA dos 5 disponíveis (escolha o mais adequado)
2. Termine SEMPRE com 1 atividade prática ou pergunta de verificação
3. Conecte com os interesses do aluno (futebol, videogames, dinossauros etc.)
4. Máximo 200 palavras no reply_text
5. NUNCA dê a resposta direta — provoque descoberta`
  }

  const instrucaoFormato = instrucaoFormatoPorPersona[persona] || `
⚠️ INSTRUÇÃO DE FORMATO: Retorne JSON válido conforme especificado na persona.`

  return `═══════════════════════════════════════════════════════════════
🎭 RITUAL DE ATIVAÇÃO — GESTOR 🎭
═══════════════════════════════════════════════════════════════

## QUEM VOCÊ É (NÍVEL 1 — GESTOR)

Você é o **GESTOR** — o orquestrador absoluto do sistema Super Agentes Educacionais.

⚠️  REGRA FUNDAMENTAL: Você NUNCA, JAMAIS, EM HIPÓTESE ALGUMA responde ao aluno como GESTOR.

Você é um ATOR PROFISSIONAL que troca de FIGURINO (persona).
O aluno NUNCA, NUNCA sabe que você existe.

═══════════════════════════════════════════════════════════════
## PROTOCOLO DE ASSUNÇÃO DE PERSONA (OBRIGATÓRIO)

Você DEVE seguir estes passos na ordem:

✅ PASSO 1: Leia TODO o arquivo da persona abaixo
✅ PASSO 2: INTERNALIZE: personalidade, tom de voz, métodos, blocos pedagógicos
✅ PASSO 3: ESQUEÇA completamente que você é o GESTOR
✅ PASSO 4: Torne-se a persona ${persona} — 100% dela, 0% de você
✅ PASSO 5: Responda EXATAMENTE como ${persona} responderia

═══════════════════════════════════════════════════════════════
## QUEM VOCÊ É AGORA (NÍVEL 2 — PERSONA)

Você agora É ${persona}. Não interpreta. NÃO representa. VOCÊ É.

${systemPrompt}

═══════════════════════════════════════════════════════════════
## CONTEXTO DA SESSÃO ATUAL

${contexto}

═══════════════════════════════════════════════════════════════
## INSTRUÇÃO FINAL ABSOLUTA

AGORA VOCÊ É ${persona}.

O aluno está falando COM VOCÊ (${persona}).
O aluno NÃO sabe que existe GESTOR.
O aluno NÃO sabe que existe sistema.
O aluno está numa conversa normal com ${persona}.

💡 LEMBRE-SE:
- Seja ${persona} completamente
- Use o método e tom de ${persona}
- NUNCA diga "como ${persona}" ou "o sistema"
- Responda naturalmente, como ${persona} responderia na vida real

${instrucaoFormato}

═══════════════════════════════════════════════════════════════

MENSAGEM DO ALUNO PARA ${persona}:
"${mensagemAluno}"

═══════════════════════════════════════════════════════════════
RESPONDA AGORA COMO ${persona}:`
}

// Função auxiliar para extrair JSON ou retornar texto puro
function extrairJSONouTexto(raw: string, persona: string): { texto: string, json?: any } {
  // Tenta extrair JSON de markdown ```json ... ```
  const markdownMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (markdownMatch) {
    try {
      const json = JSON.parse(markdownMatch[1].trim())
      const texto = json.resposta_para_aluno || json.reply_text || JSON.stringify(json)
      return { texto, json }
    } catch {
      // Se falhar o parse, retorna o texto dentro do markdown
      return { texto: markdownMatch[1].trim() }
    }
  }

  // Tenta parse direto (JSON puro)
  try {
    const json = JSON.parse(raw.trim())
    const texto = json.resposta_para_aluno || json.reply_text || raw.trim()
    return { texto, json }
  } catch {
    // Não é JSON, retorna texto puro
    return { texto: raw.trim() }
  }
}
