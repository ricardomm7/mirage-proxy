const express = require("express");
const cors = require("cors");
const FormData = require("form-data");
const crypto = require("crypto");
const fetch = (...args) =>
  import("node-fetch").then(({ default: f }) => f(...args));

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Logger para debug
app.use((req, res, next) => {
    console.log(`[PROXY DETECTOU PEDIDO] ${req.method} ${req.originalUrl}`);
    next();
});

const PORT = process.env.PORT || 3000;
const IAEDU_API_KEY = process.env.IAEDU_API_KEY;
const IAEDU_ENDPOINT = process.env.IAEDU_ENDPOINT || "https://api.iaedu.pt/agent-chat/api/v1/agent/fgh/stream";
const CHANNEL_ID = process.env.CHANNEL_ID || "fgh";

// Engana o OpenCode se ele perguntar pelos modelos disponíveis
app.get(["/v1/models", "/models"], (_req, res) => {
    res.json({
        object: "list",
        data: [{ id: "claude-opus", object: "model", owned_by: "iaedu" }]
    });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post(["/v1/chat/completions", "/chat/completions"], async (req, res) => {
  const messages = req.body.messages;
  
  if (!messages || !messages.length) {
    return res.status(400).json({ error: "No messages provided" });
  }

  // 1. Prepara todo o histórico da conversa gerido pelo OpenCode
  const historicoCompleto = messages.map(m => {
    // Extrai o texto garantindo que funciona quer seja string quer seja um array de conteúdos
    const texto = typeof m.content === "string" 
      ? m.content 
      : Array.isArray(m.content) 
        ? m.content.filter(c => c.type === "text").map(c => c.text).join("\n") 
        : "";
        
    // Formata cada mensagem indicando quem falou
    const roleName = m.role === "user" ? "Utilizador" : "Assistente";
    return `${roleName}: ${texto}`;
  }).join("\n\n");

  console.log(`[${new Date().toISOString()}] Received request - messages in history: ${messages.length}`);

  // 2. Gera um Thread ID novo em folha para que a IAEdu não use memória de conversas antigas
  const threadDinamico = crypto.randomUUID();

  // 3. Constrói o formulário
  const form = new FormData();
  form.append("channel_id", CHANNEL_ID);
  form.append("thread_id", threadDinamico);
  form.append("user_info", "{}");
  form.append("message", historicoCompleto); // Envia a conversa toda como uma única "super" mensagem

  try {
    const upstream = await fetch(IAEDU_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": IAEDU_API_KEY,
        ...form.getHeaders(),
      },
      body: form,
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      console.error(`[${new Date().toISOString()}] IAEdu API error: ${upstream.status} - ${errText}`);
      return res.status(upstream.status).json({ error: errText });
    }

    // Configura os cabeçalhos essenciais para Streaming SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    let buffer = "";

    // 4. Tradutor do Stream
    upstream.body.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Guarda a última linha caso esteja cortada a meio

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const parsedIAEdu = JSON.parse(line);
                
                // Extrai apenas os tokens da resposta do Claude
                if (parsedIAEdu.type === "token" && parsedIAEdu.content) {
                    
                    const pacoteOpenAI = {
                        id: `chatcmpl-${Date.now()}`,
                        object: "chat.completion.chunk",
                        created: Math.floor(Date.now() / 1000),
                        model: "claude-opus",
                        choices: [{
                            index: 0,
                            delta: { content: parsedIAEdu.content },
                            finish_reason: null
                        }]
                    };

                    res.write(`data: ${JSON.stringify(pacoteOpenAI)}\n\n`);
                }
            } catch (e) {
                // Ignora linhas que não sejam JSON (evita que o proxy crashe)
            }
        }
    });

    upstream.body.on('end', () => {
        console.log(`[${new Date().toISOString()}] Stream completed`);
        res.write('data: [DONE]\n\n');
        res.end();
    });

    upstream.body.on("error", (err) => {
      console.error(`[${new Date().toISOString()}] Stream error:`, err.message);
      res.end();
    });

    req.on("close", () => {
      upstream.body.destroy();
    });

  } catch (err) {
    console.error(`[${new Date().toISOString()}] Proxy error:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: "Proxy error", details: err.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Mirage proxy running on port ${PORT}`);
  console.log(`Forwarding to: ${IAEDU_ENDPOINT}`);
});