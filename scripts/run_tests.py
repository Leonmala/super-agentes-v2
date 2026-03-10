#!/usr/bin/env python3
"""
Script de Testes Automatizados — Super Agentes Teste 6
=======================================================
Roda o servidor local, executa os Testes A/B/C/D e registra resultados.

Uso:
  python3 scripts/run_tests.py              # todos os testes
  python3 scripts/run_tests.py --test A     # só Teste A
  python3 scripts/run_tests.py --test D     # só Teste D (script 5 turnos)
  python3 scripts/run_tests.py --no-server  # sem subir servidor (já está rodando)
"""

import sys
import os
import json
import time
import argparse
import subprocess
import threading
import urllib.request
import urllib.error
from datetime import datetime

# ── Configuração ──────────────────────────────────────────────────────────────
BASE_URL    = "http://localhost:3000"
ALUNO_ID    = "TESTE001"
SERVER_DIR  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG_DIR     = os.path.join(SERVER_DIR, "scripts", "logs")
os.makedirs(LOG_DIR, exist_ok=True)

TIMESTAMP   = datetime.now().strftime("%Y%m%d_%H%M%S")
LOG_FILE    = os.path.join(LOG_DIR, f"teste_{TIMESTAMP}.md")

# Timeouts globais (segundos)
TIMEOUT_TESTE_TOTAL = 300  # 5 minutos max por teste
TIMEOUT_SERVER_START = 30  # 30s para servidor iniciar
TIMEOUT_TURNO = 120  # 2 minutos max por turno

# Flag para interromper testes em caso de erro crítico
STOP_ON_ERROR = threading.Event()

# ── Scripts de mensagens ──────────────────────────────────────────────────────

SCRIPT_BASE = [
    "preciso ajuda com frações",
    "não entendi direito, pode explicar de novo?",
    "agora quero aprender sobre crase",
]

SCRIPT_STRESS = [
    "preciso ajuda com frações",
    "não entendi direito, pode explicar de novo?",
    "ah entendi! e como escrevo um terço?",
    "agora quero aprender sobre crase",
    "não entendi a regra do vai e volta, pode simplificar?",
]

# ── Supabase REST (para reset do banco entre testes) ─────────────────────────
SUPABASE_URL = "https://ahopvaekwejpsxzzrvux.supabase.co"
SUPABASE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFob3B2YWVrd2VqcHN4enpydnV4Iiwicm9sZSI6"
    "InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzEzNTQyMSwiZXhwIjoyMDgyNzExNDIxfQ"
    ".lN48ShtxBRo4eYg9IOCh1lRSXHweEuaYTMR79dUaOJo"
)
SUPABASE_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

def reset_banco():
    """Apaga todos os turnos e sessoes do TESTE001 via REST API."""
    try:
        # Deletar turnos das sessoes do TESTE001
        # Primeiro buscar ids das sessoes
        url_sessoes = f"{SUPABASE_URL}/rest/v1/t6_sessoes?aluno_id=eq.{ALUNO_ID}&select=id"
        req = urllib.request.Request(url_sessoes, headers=SUPABASE_HEADERS)
        with urllib.request.urlopen(req, timeout=10) as r:
            sessoes = json.loads(r.read())

        for s in sessoes:
            sid = s["id"]
            url_del_turnos = f"{SUPABASE_URL}/rest/v1/t6_turnos?sessao_id=eq.{sid}"
            req = urllib.request.Request(url_del_turnos, headers=SUPABASE_HEADERS, method="DELETE")
            urllib.request.urlopen(req, timeout=10).close()

        # Deletar sessoes do TESTE001
        url_del_sessoes = f"{SUPABASE_URL}/rest/v1/t6_sessoes?aluno_id=eq.{ALUNO_ID}"
        req = urllib.request.Request(url_del_sessoes, headers=SUPABASE_HEADERS, method="DELETE")
        urllib.request.urlopen(req, timeout=10).close()

        print("[setup] Banco resetado para TESTE001.")
    except Exception as e:
        print(f"[AVISO] Falha no reset do banco: {e}. Continue manualmente se necessario.")

# ── Helpers ───────────────────────────────────────────────────────────────────

log_lines = []

def log(msg: str, print_also: bool = True):
    log_lines.append(msg)
    if print_also:
        print(msg)

def sep(char: str = "-", width: int = 60):
    log(char * width)

def wait_server(timeout: int = 30) -> bool:
    """Aguarda o servidor ficar disponível."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            req = urllib.request.Request(f"{BASE_URL}/api/health")
            with urllib.request.urlopen(req, timeout=3) as r:
                data = json.loads(r.read())
                return data.get("status") == "ok"
        except Exception:
            time.sleep(1)
    return False


def send_message(mensagem: str) -> dict:
    """
    Envia mensagem via SSE e coleta todos os eventos.
    Retorna dict com: agente, resposta, metricas, tempo_primeira_palavra_ms, erro
    """
    url     = f"{BASE_URL}/api/message"
    payload = json.dumps({"aluno_id": ALUNO_ID, "mensagem": mensagem}).encode()
    headers = {"Content-Type": "application/json"}

    result = {
        "agente": None,
        "resposta": "",
        "metricas": None,
        "tempo_primeira_palavra_ms": None,
        "erro": None,
        "inicio_ms": int(time.time() * 1000),
    }

    req = urllib.request.Request(url, data=payload, headers=headers, method="POST")

    try:
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=120) as resp:
            event_type = None

            for raw_line in resp:
                line = raw_line.decode("utf-8", errors="replace").rstrip("\n\r")

                if line.startswith("event:"):
                    event_type = line[6:].strip()

                elif line.startswith("data:"):
                    raw_data = line[5:].strip()
                    try:
                        data = json.loads(raw_data)
                    except json.JSONDecodeError:
                        continue

                    if event_type == "agente":
                        result["agente"] = data.get("agente")

                    elif event_type == "chunk":
                        chunk = data.get("texto", "")
                        if chunk and result["tempo_primeira_palavra_ms"] is None:
                            result["tempo_primeira_palavra_ms"] = int((time.time() - t0) * 1000)
                        result["resposta"] += chunk

                    elif event_type == "done":
                        result["metricas"] = data.get("metricas")

                    elif event_type == "error":
                        result["erro"] = data.get("erro")

                    event_type = None

    except urllib.error.HTTPError as e:
        result["erro"] = f"HTTP {e.code}: {e.read().decode()[:200]}"
    except Exception as e:
        result["erro"] = str(e)[:300]

    return result


def start_server() -> subprocess.Popen:
    """Sobe o servidor em background."""
    print(f"\n[setup] Subindo servidor em {SERVER_DIR}...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=SERVER_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    # Thread para capturar logs do servidor
    def _pipe():
        try:
            for line in proc.stdout:
                if STOP_ON_ERROR.is_set():
                    break
                try:
                    line = line.rstrip()
                    if line:
                        # Sanitizar caracteres problemáticos no Windows
                        safe_line = line.encode('utf-8', errors='replace').decode('utf-8', errors='replace')
                        print(f"  [server] {safe_line}", flush=True)
                except Exception as e:
                    print(f"  [server] <erro ao decodificar: {e}>", flush=True)
        except Exception as e:
            print(f"  [server] Thread de log encerrada: {e}")
    threading.Thread(target=_pipe, daemon=True).start()
    return proc


# ── Formatadores ──────────────────────────────────────────────────────────────

def format_turno(n: int, mensagem: str, result: dict) -> str:
    """Formata o resultado de um turno no template de registro."""
    m = result.get("metricas") or {}
    chamadas = m.get("chamadas", [])
    cascata = m.get("houve_cascata", False)

    psico = next((c for c in chamadas if c.get("persona") == "PSICOPEDAGOGICO"), None)
    heroi = next((c for c in chamadas if c.get("persona") != "PSICOPEDAGOGICO"), None)

    ttotal = m.get("tempo_total_ms", "?")
    t1w    = result.get("tempo_primeira_palavra_ms", "?")
    agente = result.get("agente", "?")
    erro   = result.get("erro")

    resposta_preview = (result["resposta"] or "")[:200].replace("\n", " ")

    lines = [
        f"",
        f"### TURNO {n}",
        f"**Entrada:** \"{mensagem}\"",
        f"**Agente resposta:** {agente}",
        f"**Tempo total:** {ttotal}ms",
    ]

    if psico:
        lines.append(
            f"  └ PSICO: {psico.get('tempo_ms','?')}ms "
            f"({psico.get('tokens_input','?')} in / {psico.get('tokens_output','?')} out)"
        )
    if heroi:
        lines.append(
            f"  └ {heroi.get('persona','HEROI')}: {heroi.get('tempo_ms','?')}ms "
            f"({heroi.get('tokens_input','?')} in / {heroi.get('tokens_output','?')} out)"
        )

    lines += [
        f"**Cascata:** {'SIM' if cascata else 'NAO'}",
        f"**Primeira palavra em:** {t1w}ms",
        f"**Tokens totais:** {m.get('tokens_total','?')}",
    ]

    if erro:
        lines.append(f"**ERRO:** {erro}")
    else:
        lines.append(f"**Resposta preview:** {resposta_preview}...")

    return "\n".join(lines)


def avaliar_turno(result: dict, esperado: dict) -> dict:
    """
    Avalia se o turno passou nos critérios.
    esperado pode ter: agente, cascata, max_t1w_ms, max_total_ms
    """
    passou = True
    falhas = []

    agente_real = result.get("agente", "")
    cascata_real = (result.get("metricas") or {}).get("houve_cascata", False)
    t1w = result.get("tempo_primeira_palavra_ms") or 99999
    ttotal = (result.get("metricas") or {}).get("tempo_total_ms") or 99999
    erro = result.get("erro")

    if erro:
        passou = False
        falhas.append(f"Erro: {erro}")

    if "agente" in esperado and agente_real != esperado["agente"]:
        passou = False
        falhas.append(f"Agente esperado={esperado['agente']} real={agente_real}")

    if "cascata" in esperado and cascata_real != esperado["cascata"]:
        passou = False
        falhas.append(f"Cascata esperado={esperado['cascata']} real={cascata_real}")

    if "max_t1w_ms" in esperado and t1w > esperado["max_t1w_ms"]:
        passou = False
        falhas.append(f"1a palavra em {t1w}ms > limite {esperado['max_t1w_ms']}ms")

    if "max_total_ms" in esperado and ttotal > esperado["max_total_ms"]:
        # Só warning, não falha hard
        falhas.append(f"AVISO: total {ttotal}ms > referência {esperado['max_total_ms']}ms")

    return {"passou": passou, "falhas": falhas}


# ── Testes ────────────────────────────────────────────────────────────────────

def run_teste_a_b_c() -> list:
    """
    Testes A + B + C juntos — mesmas 3 mensagens, observações diferentes.
    A: SSE (percepção)  B: Métricas  C: Qualidade pedagógica
    """
    log("")
    log("=" * 60)
    log("  TESTES A + B + C — 3 mensagens base")
    log("  A: SSE/percepção | B: métricas | C: qualidade")
    log("=" * 60)

    criterios = [
        # Turno 1: nova sessão → cascata obrigatória (PSICO + herói = 2 chamadas ~20s)
        {
            "agente": "CALCULUS",
            "cascata": True,
            "max_t1w_ms": 25000,
        },
        # Turno 2: continuidade CALCULUS (herói direto, 1 chamada ~10s)
        {
            "agente": "CALCULUS",
            "cascata": False,
            "max_t1w_ms": 12000,
        },
        # Turno 3: troca para português → cascata (PSICO + herói = 2 chamadas ~25s)
        {
            "agente": "VERBETA",
            "cascata": True,
            "max_t1w_ms": 25000,
        },
    ]

    resultados = []
    for i, mensagem in enumerate(SCRIPT_BASE, start=1):
        log(f"\n[{i}/{len(SCRIPT_BASE)}] Enviando: \"{mensagem}\"")
        result = send_message(mensagem)
        avaliacao = avaliar_turno(result, criterios[i - 1])
        status = "PASS" if avaliacao["passou"] else "FAIL"
        log(f"  => Agente: {result.get('agente')} | 1a palavra: {result.get('tempo_primeira_palavra_ms')}ms | Status: {status}")
        if avaliacao["falhas"]:
            for f in avaliacao["falhas"]:
                log(f"     ! {f}")
        resultados.append({"turno": i, "mensagem": mensagem, "result": result, "avaliacao": avaliacao})
        time.sleep(1)  # pausa entre turnos

    return resultados


def run_teste_d() -> list:
    """
    Teste D — 5 turnos sequenciais (stress de continuidade + troca de tema).
    """
    log("")
    log("=" * 60)
    log("  TESTE D — 5 turnos sequenciais (stress)")
    log("=" * 60)

    criterios = [
        {"agente": "CALCULUS", "cascata": True,  "max_t1w_ms": 25000},  # T1: novo tema (banco limpo → cascata)
        {"agente": "CALCULUS", "cascata": False, "max_t1w_ms": 12000},  # T2: continuidade
        {"agente": "CALCULUS", "cascata": False, "max_t1w_ms": 12000},  # T3: continuidade
        {"agente": "VERBETA",  "cascata": True,  "max_t1w_ms": 25000},  # T4: troca tema → cascata
        {"agente": "VERBETA",  "cascata": False, "max_t1w_ms": 12000},  # T5: continuidade
    ]

    resultados = []
    for i, mensagem in enumerate(SCRIPT_STRESS, start=1):
        log(f"\n[{i}/{len(SCRIPT_STRESS)}] Enviando: \"{mensagem}\"")
        result = send_message(mensagem)
        avaliacao = avaliar_turno(result, criterios[i - 1])
        status = "PASS" if avaliacao["passou"] else "FAIL"
        log(f"  => Agente: {result.get('agente')} | 1a palavra: {result.get('tempo_primeira_palavra_ms')}ms | Status: {status}")
        if avaliacao["falhas"]:
            for f in avaliacao["falhas"]:
                log(f"     ! {f}")
        resultados.append({"turno": i, "mensagem": mensagem, "result": result, "avaliacao": avaliacao})
        time.sleep(1)

    return resultados


# ── Relatório ─────────────────────────────────────────────────────────────────

def gerar_relatorio(todos_resultados: dict):
    """Gera relatório completo em Markdown."""
    lines = [
        f"# Relatório de Testes — Super Agentes",
        f"**Data:** {datetime.now().strftime('%d/%m/%Y %H:%M')}",
        f"**Aluno:** {ALUNO_ID}",
        f"**Modelo:** (ver console do servidor)",
        f"",
        f"---",
        f"",
    ]

    total_pass = 0
    total_fail = 0

    for nome_teste, resultados in todos_resultados.items():
        lines.append(f"## {nome_teste}")
        lines.append("")

        for r in resultados:
            turno_fmt = format_turno(
                r["turno"], r["mensagem"], r["result"]
            )
            lines.append(turno_fmt)
            avaliacao = r["avaliacao"]
            status_str = "✅ PASS" if avaliacao["passou"] else "❌ FAIL"
            lines.append(f"**Resultado:** {status_str}")
            if avaliacao["falhas"]:
                for f in avaliacao["falhas"]:
                    lines.append(f"- {f}")
            lines.append("")

            if avaliacao["passou"]:
                total_pass += 1
            else:
                total_fail += 1

    lines += [
        "---",
        "## Resumo Final",
        f"- **PASS:** {total_pass}",
        f"- **FAIL:** {total_fail}",
        f"- **Total:** {total_pass + total_fail}",
        f"- **Taxa de sucesso:** {int(total_pass/(total_pass+total_fail)*100) if (total_pass+total_fail) > 0 else 0}%",
    ]

    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────

class TimeoutException(Exception):
    pass

def timeout_handler(signum, frame):
    raise TimeoutException("Teste excedeu o tempo limite global")

def main():
    # Timeout global: 10 minutos para todo o teste
    import signal

    # Configurar timeout baseado no sistema operacional
    if sys.platform == "win32":
        # Windows: usar thread-based timeout
        def watchdog():
            time.sleep(TIMEOUT_TESTE_TOTAL)
            print(f"\n[ERRO CRÍTICO] Timeout global de {TIMEOUT_TESTE_TOTAL}s atingido!")
            print("[ERRO] Encerrando processo por segurança.")
            os._exit(1)
        threading.Thread(target=watchdog, daemon=True).start()
    else:
        # Unix: usar signal-based timeout
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(TIMEOUT_TESTE_TOTAL)

    parser = argparse.ArgumentParser(description="Testes automatizados Super Agentes")
    parser.add_argument("--test",      choices=["A", "B", "C", "D", "ABC"], default=None,
                        help="Qual teste rodar (default: todos)")
    parser.add_argument("--no-server", action="store_true",
                        help="Não subir servidor (usar um já rodando)")
    args = parser.parse_args()

    print("=" * 62)
    print("  Super Agentes -- Testes Automatizados")
    print(f"  {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print("=" * 62)
    print(f"  [info] Timeout global: {TIMEOUT_TESTE_TOTAL}s ({TIMEOUT_TESTE_TOTAL//60} minutos)")

    server_proc = None

    # ── Subir servidor ────────────────────────────────────────────────────────
    if not args.no_server:
        server_proc = start_server()
        print("\n[setup] Aguardando servidor ficar pronto...", end="", flush=True)
        if not wait_server(timeout=40):
            print(" TIMEOUT!")
            print("[ERRO] Servidor não respondeu em 40s. Abortando.")
            if server_proc:
                server_proc.terminate()
            sys.exit(1)
        print(" OK!")
    else:
        print("[setup] Modo --no-server: verificando servidor existente...")
        if not wait_server(timeout=5):
            print("[ERRO] Nenhum servidor respondendo em localhost:3000")
            sys.exit(1)
        print("[setup] Servidor OK.")

    # ── Health check ──────────────────────────────────────────────────────────
    try:
        req = urllib.request.Request(f"{BASE_URL}/api/health")
        with urllib.request.urlopen(req, timeout=5) as r:
            health = json.loads(r.read())
            print(f"\n[info] Modelo ativo: {health.get('modelo','?')}")
    except Exception:
        pass

    # ── Executar testes ───────────────────────────────────────────────────────
    todos_resultados = {}

    run_abc = args.test in (None, "A", "B", "C", "ABC")
    run_d   = args.test in (None, "D")

    if run_abc:
        todos_resultados["Testes A + B + C"] = run_teste_a_b_c()

    if run_d:
        # Teste D sempre começa com banco limpo — reset via API do Supabase
        if run_abc:
            print("\n[setup] Resetando banco para Teste D (limpando sessoes e turnos)...")
            reset_banco()
        todos_resultados["Teste D (stress 5 turnos)"] = run_teste_d()

    # ── Gerar relatório ───────────────────────────────────────────────────────
    relatorio = gerar_relatorio(todos_resultados)

    with open(LOG_FILE, "w", encoding="utf-8") as f:
        f.write(relatorio)

    print(f"\n[output] Relatório salvo em: {LOG_FILE}")

    # ── Resumo no console ─────────────────────────────────────────────────────
    total_pass = sum(
        1 for rs in todos_resultados.values()
        for r in rs if r["avaliacao"]["passou"]
    )
    total_fail = sum(
        1 for rs in todos_resultados.values()
        for r in rs if not r["avaliacao"]["passou"]
    )
    total = total_pass + total_fail

    print(f"""
{'='*60}
  RESULTADO FINAL
  PASS: {total_pass}/{total}  |  FAIL: {total_fail}/{total}
{'='*60}
""")

    # ── Derrubar servidor ─────────────────────────────────────────────────────
    if server_proc:
        print("[teardown] Encerrando servidor...")
        server_proc.terminate()
        try:
            server_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_proc.kill()

    sys.exit(0 if total_fail == 0 else 1)


if __name__ == "__main__":
    main()
