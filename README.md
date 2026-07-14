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

## Instalação (Docker local)

Estas instruções explicam como executar o proxy localmente usando Docker e `docker compose`.

1. Copia o repositório para a tua máquina local (ou abre a pasta onde o código está):

```bash
git clone <repo-url>    # ou usa uma cópia local
cd mirage-proxy
```

2. Copia o ficheiro de exemplo e edita as variáveis de ambiente (define `IAEDU_API_KEY`):

```bash
cp .env.example .env
# edita .env com o teu editor preferido
```

3. Executar com Docker Compose

```bash
docker compose up -d --build
```

4. Verificar logs e estado

```bash
docker compose logs -f
docker compose ps
```

5. Testar o healthcheck localmente

```bash
curl http://localhost:3000/health
# Resposta esperada: {"status":"ok"}
```

## Variáveis de ambiente

| Variável | Obrigatória | Default | Descrição |
|---|---:|---|---|
| `IAEDU_API_KEY` | Sim | - | Chave `x-api-key` da IAEdu (ex.: `sk-usr-...`) |
| `PORT` | Não | `3000` | Porta do servidor Express |
| `IAEDU_ENDPOINT` | Não | `.../agent/fgh/stream` | URL completo do endpoint da IAEdu |
| `CHANNEL_ID` | Não | `fgh` | ID do canal associado ao agente |

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

