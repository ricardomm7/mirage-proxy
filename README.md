# Mirage Proxy

Proxy local que funciona como ponte entre editores de código AI (OpenCode, Cursor, Continue.dev, Cline, etc.) e a API proprietária da IAEdu (Claude Opus 4.7).

O proxy traduz pedidos no formato OpenAI (JSON para `/v1/chat/completions`) para o formato exigido pela IAEdu (multipart/form-data com stream NDJSON) e converte a resposta de volta para Server-Sent Events (SSE) compatíveis com o standard OpenAI.

## Problema que resolve

- A API da IAEdu não é compatível com o standard OpenAI usado por editores de código. Este proxy traduz em tempo real entre os dois formatos.

## Arquitetura

```
┌─────────────┐      JSON       ┌──────────────┐   multipart/form-data   ┌──────────────┐
│   OpenCode  │ ──────────────► │ Mirage Proxy │ ──────────────────────► │  IAEdu API   │
│  (ou outro) │ ◄────────────── │  (Docker)    │ ◄────────────────────── │ Claude Opus  │
└─────────────┘   SSE OpenAI    └──────────────┘   NDJSON stream         └──────────────┘
```

## Estrutura do projeto

```
mirage-proxy/
├── server.js           # Lógica do proxy (Express + tradutor de streams)
├── package.json        # Dependências Node
├── Dockerfile          # Imagem Node (Alpine)
├── docker-compose.yml  # Orquestração para umbrelOS
├── .env.example        # Template de variáveis de ambiente
├── .gitignore
└── README              # Este ficheiro
```

## Instalação (ex.: umbrelOS)

1. Copiar o projeto para o servidor:

```bash
scp -r mirage-proxy/ umbrel@<IP_DO_UMBREL>:~/
```

2. Aceder por SSH e entrar na pasta:

```bash
ssh umbrel@<IP_DO_UMBREL>
cd ~/mirage-proxy
```

3. Configurar variáveis de ambiente

```bash
cp .env.example .env
nano .env
```

Preenche `IAEDU_API_KEY` com a tua chave real (`sk-usr-...`).

4. Build e arranque do container

```bash
docker compose up -d --build
```

5. Ver logs

```bash
docker compose logs -f
```

6. Healthcheck

```bash
curl http://<IP_DO_UMBREL>:3000/health
# Resposta esperada: {"status":"ok"}
```

## Variáveis de ambiente

| Variável | Obrigatória | Default | Descrição |
|---|---:|---|---|
| `IAEDU_API_KEY` | Sim | - | Chave `x-api-key` da IAEdu (ex.: `sk-usr-...`) |
| `PORT` | Não | `3000` | Porta do servidor Express |
| `IAEDU_ENDPOINT` | Não | `.../agent/fgh/stream` | URL completo do endpoint da IAEdu |
| `CHANNEL_ID` | Não | `fgh` | ID do canal associado ao agente |
| `THREAD_ID` | Não | - | Ignorado pelo proxy (substituído por UUID) |

## Endpoints expostos

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/v1/chat/completions` | Endpoint principal compatível com OpenAI |
| `POST` | `/chat/completions` | Alias sem prefixo `/v1` |
| `GET` | `/v1/models` | Lista de modelos mock (para validação de editores) |
| `GET` | `/models` | Alias sem prefixo `/v1` |
| `GET` | `/health` | Healthcheck simples |

## Limitações importantes

- Sem Tool Calling: a API da IAEdu aceita apenas texto — não permite execução de ferramentas.
- Sem multimodalidade: apenas texto é encaminhado; imagens são descartadas.
- Modelo único: o campo `model` do editor é ignorado; o proxy usa o `CHANNEL_ID` do `.env`.
- Sem contagem de tokens: não são retornados dados de `usage`.
- Cancelamento upstream: cancelar localmente fecha a ligação, mas a IAEdu pode continuar a processar a geração nos seus servidores.
- Segurança local: o proxy não exige autenticação por omissão — mantenha-o restrito à LAN.

## Comandos úteis (Docker)

```bash
docker compose logs -f    # Ver logs em tempo real
docker compose restart    # Reiniciar (após alterar .env)
docker compose down       # Parar serviço
docker compose up -d --build  # Reconstruir imagem
docker compose ps         # Estado do container
```

## Debug essencial

- Healthcheck deve devolver `{"status":"ok"}`.
- Verifica `IAEDU_API_KEY` se receberes 401/403.
- Confirma firewall e mapeamento de porto `3000:3000` se não chegarem pedidos.
- Se o editor apresentar ecrã em branco, confirma nos logs se o NDJSON da IAEdu contém `{ "type":"token","content":"..." }`.

## Teste rápido com OpenCode

1. Em OpenCode adiciona um Provedor Personalizado apontando para `http://<IP_DO_UMBREL>:3000/v1`.
2. Usa chave `dummy` (o proxy ignora e usa `IAEDU_API_KEY`).
3. Cria o modelo `claude-opus` no provedor e pede: `Diz "olá mundo" em JavaScript.`

Se o texto for gerado token a token, a integração está funcional.

---

Se quiseres, posso renomear para `README.md` e abrir um PR com a alteração.
