// Servidor Express — endpoint /api/message (SSE streaming)
import 'dotenv/config'

import express, { Request, Response } from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync } from 'fs'

import { chamarLLM, chamarLLMStream, RespostaLLM } from './llm.js'
import { decidirPersona, determinarStatus, detectarTema, classificarTemaInteligente, detectarContinuidade } from './router.js'
import { montarContexto } from './context.js'
import {
  buscarOuCriarSessao,
  buscarAluno,
  buscarUltimosTurnos,
  persistirTurno,
  atualizarSessao
} from './persistence.js'
import { MetricasChamada, calcularMetricasRequest, logMetricas } from './metrics.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, '../public')))

// Cache de personas em memória
const cachePersonas: Map<string, string> = new Map()

function carregarPersona(nome: string): string {
  if (cachePersonas.has(nome)) {
    return cachePersonas.get(nome)!
  }

  try {
    const caminho = path.join(__dirname, '../personas', `${nome}.md`)
    const conteudo = readFileSync(caminho, 'utf-8')
    cachePersonas.set(nome, conteudo)
    return conteudo
  } catch (erro) {
    console.error(`Persona ${nome} não encontrada`)
    throw new Error(`Persona ${nome} não encontrada`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoint principal — Server-Sent Events (SSE)
// O frontend recebe eventos em tempo real:
//   event: agente   — qual persona está respondendo
//   event: chunk    — fragmento de texto da resposta
//   event: done     — resposta completa + métricas
//   event: error    — erro no processamento
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/message', async (req: Request, res: Response) => {
  const inicio = Date.now()
  const { aluno_id, mensagem } = req.body

  // Validação básica de payload
  if (!aluno_id || typeof aluno_id !== 'string' || aluno_id.trim() === '') {
    return res.status(400).json({ erro: 'aluno_id é obrigatório e deve ser uma string' })
  }
  if (!mensagem || typeof mensagem !== 'string' || mensagem.trim() === '') {
    return res.status(400).json({ erro: 'mensagem é obrigatória e deve ser uma string' })
  }

  // Configurar SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // desativa buffering no nginx/Railway

  const enviarEvento = (evento: string, dados: unknown) => {
    res.write(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`)
  }

  try {
    // 1. Validar aluno + buscar sessão em PARALELO (otimização v2_fast)
    console.log(`[${aluno_id}] Buscando dados do aluno e sessão em paralelo...`)
    const [aluno, sessao] = await Promise.all([
      buscarAluno(aluno_id),
      buscarOuCriarSessao(aluno_id)
    ])

    // 2. Buscar turnos em paralelo com o contexto (não depende de nada)
    const ultimosTurnosPromise = buscarUltimosTurnos(sessao.id, 3)

    console.log(`[${aluno_id}] Sessão: ${sessao.id}, Turno: ${sessao.turno_atual}, Agente: ${sessao.agente_atual}`)

    // 3. Router Inteligente v2_fast: tentar detectar tema sem PSICO
    const ultimosTurnos = await ultimosTurnosPromise
    let persona = decidirPersona(mensagem, sessao, ultimosTurnos)
    let temaDetectado = detectarTema(mensagem)

    // Se router tradicional mandou para PSICO, tentar classificador inteligente
    if (persona === 'PSICOPEDAGOGICO' && !temaDetectado) {
      console.log(`[${aluno_id}] Router tradicional inconclusivo. Tentando classificador inteligente...`)
      const classificacao = await classificarTemaInteligente(mensagem)
      console.log(`[${aluno_id}] Classificação: ${classificacao.categoria} (${classificacao.confianca}%)`)

      // Se classificador tem confiança alta (>= 70%), usar direto
      if (classificacao.confianca >= 70) {
        if (classificacao.categoria === 'matematica') {
          persona = 'CALCULUS'
          temaDetectado = 'matematica'
          console.log(`[${aluno_id}] Router Inteligente: direto para CALCULUS`)
        } else if (classificacao.categoria === 'portugues') {
          persona = 'VERBETA'
          temaDetectado = 'portugues'
          console.log(`[${aluno_id}] Router Inteligente: direto para VERBETA`)
        } else if (classificacao.categoria === 'continuidade' && sessao.agente_atual !== 'PSICOPEDAGOGICO') {
          // Continuidade explícita - manter agente atual
          persona = sessao.agente_atual
          console.log(`[${aluno_id}] Router Inteligente: continuidade com ${persona}`)
        }
      }
    }

    // Fallback: detectar continuidade por keywords também
    if (persona === 'PSICOPEDAGOGICO' && detectarContinuidade(mensagem) && sessao.agente_atual !== 'PSICOPEDAGOGICO') {
      persona = sessao.agente_atual
      console.log(`[${aluno_id}] Keyword continuidade detectada: mantendo ${persona}`)
    }

    console.log(`[${aluno_id}] Persona selecionada: ${persona}`)

    // 4. Carregar system prompt e contexto
    const systemPrompt = carregarPersona(persona)
    const contexto = montarContexto(sessao, aluno, ultimosTurnos)

    const chamadasMetricas: MetricasChamada[] = []
    let houveCascata = false
    let agenteFinal: string = persona
    let respostaFinal: string = ''
    let plano: string | null = null
    // temaDetectado já foi definido acima no Router Inteligente

    // ─── Fluxo de decisão ──────────────────────────────────────────────────
    //
    // CASO A: Persona é PSICOPEDAGOGICO
    //   → Chama PSICO de forma não-streaming (retorna JSON estruturado)
    //   → Se PSICO decide ENCAMINHAR_PARA_HEROI:
    //       → Chama herói em STREAM (usuário vê texto em tempo real)
    //   → Se PSICO decide responder diretamente (PERGUNTAR_AO_ALUNO etc):
    //       → Envia resposta do PSICO de uma vez (não faz sentido stremar JSON)
    //
    // CASO B: Persona é herói direto (continuidade)
    //   → Chama herói em STREAM imediatamente
    //
    // ──────────────────────────────────────────────────────────────────────

    if (persona === 'PSICOPEDAGOGICO') {
      // CASO A: PSICO primeiro (sem stream — retorna JSON)
      console.log(`[${aluno_id}] Chamando PSICOPEDAGOGICO...`)
      const respostaLLM: RespostaLLM = await chamarLLM(systemPrompt, contexto, mensagem.trim(), persona)

      chamadasMetricas.push({
        persona,
        tempo_ms: respostaLLM.tempo_ms,
        tokens_input: respostaLLM.tokens_input,
        tokens_output: respostaLLM.tokens_output,
        tokens_total: respostaLLM.tokens_total,
        modelo: respostaLLM.modelo
      })

      const respostaJSON = respostaLLM.jsonData

      if (respostaJSON?.acao === 'ENCAMINHAR_PARA_HEROI') {
        const heroiEscolhido = respostaJSON.heroi_escolhido

        if (heroiEscolhido && (heroiEscolhido === 'CALCULUS' || heroiEscolhido === 'VERBETA')) {
          console.log(`[${aluno_id}] PSICO gerou plano. Chamando ${heroiEscolhido} em stream...`)
          houveCascata = true
          agenteFinal = heroiEscolhido

          // Extrair plano e instruções do PSICO
          if (respostaJSON.plano_atendimento) {
            plano = JSON.stringify(respostaJSON.plano_atendimento, null, 2)
          }
          const instrucoesHeroi = respostaJSON.instrucoes_para_heroi || ''

          // Montar contexto rico para o herói
          let contextoHeroi = montarContexto(sessao, aluno, ultimosTurnos)
          contextoHeroi += `\n\n═══════════════════════════════════════════════════════════════\n`
          contextoHeroi += `PLANO DE ATENDIMENTO GERADO PELO PSICOPEDAGOGICO:\n`
          contextoHeroi += `═══════════════════════════════════════════════════════════════\n`
          contextoHeroi += `Plano: ${plano || 'Não especificado'}\n\n`
          contextoHeroi += `Instruções para você (${heroiEscolhido}):\n${instrucoesHeroi}\n`
          contextoHeroi += `═══════════════════════════════════════════════════════════════\n`
          contextoHeroi += `IMPORTANTE: Responda ao aluno AGORA, já assumindo sua persona. ` +
                           `NÃO mencione o PSICOPEDAGOGICO. Você é ${heroiEscolhido} e está ` +
                           `começando a ajudar o aluno com o tema acima.\n`

          // Avisar o frontend qual herói vai responder
          enviarEvento('agente', { agente: heroiEscolhido })

          // Chamar herói em stream
          const systemPromptHeroi = carregarPersona(heroiEscolhido)
          const metricasHeroi = await chamarLLMStream(
            systemPromptHeroi,
            contextoHeroi,
            mensagem.trim(),
            heroiEscolhido,
            (chunk) => {
              respostaFinal += chunk
              enviarEvento('chunk', { texto: chunk })
            }
          )

          chamadasMetricas.push({
            persona: heroiEscolhido,
            ...metricasHeroi
          })

          console.log(`[${aluno_id}] ${heroiEscolhido} stream concluído`)

        } else {
          // Herói inválido — usa resposta do PSICO
          agenteFinal = 'PSICOPEDAGOGICO'
          respostaFinal = respostaLLM.textoParaAluno
          enviarEvento('agente', { agente: agenteFinal })
          enviarEvento('chunk', { texto: respostaFinal })
        }

      } else {
        // PSICO respondeu diretamente (PERGUNTAR_AO_ALUNO, ENCAMINHAR_PARA_HUMANO etc)
        agenteFinal = 'PSICOPEDAGOGICO'
        respostaFinal = respostaLLM.textoParaAluno
        enviarEvento('agente', { agente: agenteFinal })
        enviarEvento('chunk', { texto: respostaFinal })
      }

    } else {
      // CASO B: Herói direto (continuidade) — stream imediato
      console.log(`[${aluno_id}] Chamando ${persona} em stream (continuidade)...`)
      enviarEvento('agente', { agente: persona })

      const metricasHeroi = await chamarLLMStream(
        systemPrompt,
        contexto,
        mensagem.trim(),
        persona,
        (chunk) => {
          respostaFinal += chunk
          enviarEvento('chunk', { texto: chunk })
        }
      )

      chamadasMetricas.push({
        persona,
        ...metricasHeroi
      })
    }

    // ─── Finalizar ─────────────────────────────────────────────────────────
    const status = determinarStatus(mensagem, agenteFinal, sessao)
    const metricas = calcularMetricasRequest(aluno_id, inicio, chamadasMetricas, houveCascata)
    logMetricas(metricas)

    console.log(`[${aluno_id}] Resposta final (${agenteFinal}) em ${metricas.tempo_total_ms}ms`)

    // Enviar evento de conclusão com métricas completas
    enviarEvento('done', {
      agente: agenteFinal,
      turno: sessao.turno_atual + 1,
      tempo_ms: metricas.tempo_total_ms,
      metricas: {
        tempo_total_ms: metricas.tempo_total_ms,
        tokens_total: metricas.tokens_total_request,
        houve_cascata: metricas.houve_cascata,
        chamadas: metricas.chamadas.map(c => ({
          persona: c.persona,
          tempo_ms: c.tempo_ms,
          tokens_input: c.tokens_input,
          tokens_output: c.tokens_output,
          tokens_total: c.tokens_total
        }))
      }
    })

    res.end()

    // ─── Persistir em background ───────────────────────────────────────────
    const novoTurno = sessao.turno_atual + 1

    Promise.all([
      persistirTurno(
        sessao.id,
        novoTurno,
        agenteFinal,
        mensagem.trim(),
        respostaFinal,
        status,
        plano
      ),
      atualizarSessao(sessao.id, {
        turno_atual: novoTurno,
        agente_atual: agenteFinal,
        tema_atual: temaDetectado || sessao.tema_atual,
        // Limpar plano_ativo ao trocar de tema — plano do tema anterior não vale para o novo
        plano_ativo: temaDetectado && temaDetectado !== sessao.tema_atual
          ? (plano || null)
          : (plano || sessao.plano_ativo)
      })
    ]).then(() => {
      console.log(`[${aluno_id}] Persistência concluída (turno ${novoTurno})`)
    }).catch(erro => {
      console.error(`[${aluno_id}] Erro na persistência:`, erro)
    })

  } catch (erro: any) {
    console.error(`[${aluno_id}] Erro:`, erro.message)

    let mensagemErro = 'Erro interno do servidor'
    if (erro.message?.includes('Erro ao buscar aluno')) {
      mensagemErro = `Aluno '${aluno_id}' não encontrado`
    } else if (erro.message?.includes('timeout')) {
      mensagemErro = 'O agente demorou demais para responder. Tente novamente.'
    }

    // Se ainda não enviou headers SSE, retorna JSON de erro
    if (!res.headersSent) {
      return res.status(500).json({ erro: mensagemErro })
    }

    // Se já iniciou SSE, envia evento de erro
    enviarEvento('error', { erro: mensagemErro })
    res.end()
  }
})

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    modelo: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  })
})

// Debug
app.post('/api/debug/clear-cache', (_req: Request, res: Response) => {
  cachePersonas.clear()
  res.json({ status: 'ok', message: 'Cache de personas limpo' })
})

// Iniciar
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Super Agentes - Teste 6 (Fluxo Direto + SSE)       ║
║                                                              ║
║  Servidor rodando na porta ${PORT}                            ║
║                                                              ║
║  FLUXO: Aluno → PSICO (plano) → Herói (stream em tempo real) ║
╚══════════════════════════════════════════════════════════════╝
  `)
})
