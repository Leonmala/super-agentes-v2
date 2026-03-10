#!/usr/bin/env python3
"""
Teste Realista - Primeiro Uso de Criança
========================================
Simula uma criança (9 anos) usando o Super Agentes pela primeira vez.
Roteiro natural com reações espontâneas, troca de assuntos e curiosidade.

Uso:
  python3 scripts/teste_primeiro_uso.py
"""

import json
import time
import urllib.request
import urllib.error
from datetime import datetime

BASE_URL = "http://localhost:3000"
ALUNO_ID = "TESTE001"

def enviar_mensagem(mensagem: str, numero: int):
    """Envia mensagem e retorna resultado."""
    print(f"\n{'='*60}")
    print(f"[Turno {numero}] Aluno: \"{mensagem}\"")
    print('='*60)

    result = {
        "numero": numero,
        "entrada": mensagem,
        "resposta": "",
        "agente": None,
        "tempo_total_ms": 0,
        "eventos": []
    }

    req = urllib.request.Request(
        f"{BASE_URL}/api/message",
        data=json.dumps({"aluno_id": ALUNO_ID, "mensagem": mensagem}).encode('utf-8'),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    inicio = time.time() * 1000

    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            buffer = b""
            for chunk in iter(lambda: res.read(1024), b""):
                buffer += chunk
                while b"\n\n" in buffer:
                    evento, buffer = buffer.split(b"\n\n", 1)
                    linhas = evento.decode('utf-8').strip().split('\n')
                    if len(linhas) >= 2:
                        tipo_evento = linhas[0].replace('event: ', '').strip()
                        dados = json.loads(linhas[1].replace('data: ', '').strip())
                        result["eventos"].append({"tipo": tipo_evento, "dados": dados})

                        if tipo_evento == 'agente':
                            result["agente"] = dados.get('agente')
                            print(f"[Agente] {dados.get('agente')}")
                        elif tipo_evento == 'chunk':
                            texto = dados.get('texto', '')
                            result["resposta"] += texto
                            # Mostrar primeira parte da resposta
                            if len(result["resposta"]) <= 200:
                                print(texto, end='', flush=True)
                        elif tipo_evento == 'done':
                            result["tempo_total_ms"] = int((time.time() * 1000) - inicio)
                            metricas = dados.get('metricas', {})
                            print(f"\n\n[OK] Concluido em {result['tempo_total_ms']:.0f}ms")
                            if metricas.get('houve_cascata'):
                                print(f"   Cascata: PSICO -> {result['agente']}")
                            else:
                                print(f"   Direto: {result['agente']}")

    except Exception as e:
        result["erro"] = str(e)
        print(f"[ERRO] {e}")

    return result

def main():
    print("=" * 60)
    print("  TESTE REALISTA - Primeiro Uso (Crianca 9 anos)")
    print(f"  {datetime.now().strftime('%d/%m/%Y %H:%M')}")
    print("=" * 60)
    print("\nPerfil do aluno:")
    print("   Nome: Joao, 9 anos, 3o ano")
    print("   Perfil: Visual, pratico, atencao curta")
    print("   Interesses: Futebol, videogames, dinossauros")
    print("   Dificuldades: Fracoes, pontuacao")

    # Roteiro de conversa natural
    roteiro = [
        # Turno 1: Primeiro contato - cumprimento casual
        ("oi", "Cumprimento inicial - ver se sabe o nome dele"),

        # Turno 2: Reação espontânea à personalização
        ("nossa que legal você sabe meu nome", "Reação surpresa - testa continuidade"),

        # Turno 3: Pergunta de português (crase - tema do VERBETA)
        ("como é o negócio da crase mesmo?", "Dúvida de português"),

        # Turno 4: Continuação - pede mais explicação
        ("não entendi direito, pode explicar de novo?", "Pedido de repetição - testa Router Inteligente"),

        # Turno 5: Troca para matemática abrupta
        ("ah agora lembrei! e como faz 1/2 + 1/4?", "Troca súbita para matemática"),

        # Turno 6: Continuação matemática
        ("entendi! e se for 1/3 + 1/6?", "Continuidade matemática"),

        # Turno 7: Volta para português
        ("valeu! e a crase quando usa o 'a' ou 'à'?", "Volta para português"),

        # Turno 8: Pergunta ambígua (testa PSICO)
        ("não entendi nada", "Frustração ambígua - PSICO deve qualificar"),
    ]

    resultados = []

    for i, (mensagem, descricao) in enumerate(roteiro, 1):
        print(f"\n\n>> {descricao}")
        resultado = enviar_mensagem(mensagem, i)
        resultados.append(resultado)
        time.sleep(1)  # Pausa entre mensagens

    # Resumo final
    print("\n\n" + "=" * 60)
    print("  RESUMO DO TESTE")
    print("=" * 60)

    for r in resultados:
        agente = r.get('agente', '?')
        tempo = r.get('tempo_total_ms', 0)
        erro = r.get('erro')
        status = "❌" if erro else "✅"
        print(f"{status} Turno {r['numero']}: {agente:15} | {tempo:5.0f}ms | \"{r['entrada'][:40]}...\"")

    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()
