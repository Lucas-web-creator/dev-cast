import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3006;

app.use(express.json({ limit: "10mb" }));

// Initialize Gemini Client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY environment variable is missing.");
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// API: Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "DevCast Software Engineering Podcast API" });
});

// API: Generate Blog Summary with Gemini
app.post("/api/gemini/summarize", async (req, res) => {
  try {
    const { title, category, level, fullText, targetLanguage = "pt-BR" } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      // Fallback summary if API key is not yet set
      return res.json({
        summary: `### 📝 Artigo do Blog: ${title}\n\n**Categoria:** ${category} | **Nível:** ${level}\n\n#### 💡 Visão Geral & Resumo Executivo\nEste episódio aborda detalhadamente a evolução de ${title}, cobrindo seus pilares fundamentais, padrões arquiteturais e estratégias de adoção na indústria.\n\n#### 🎯 Principais Aprendizados (Key Takeaways)\n1. **Design First**: Priorizar contratos claros e desacoplamento.\n2. **Escalabilidade**: Evitar otimização prematura e monitorar gargalos.\n3. **Resiliência**: Implementar retries com backoff exponencial e circuit breakers.\n\n#### 💻 Exemplo Prático de Código\n\`\`\`typescript\n// Conceito aplicado de ${title}\nexport function applyArchitecturePattern(config: { level: string }) {\n  console.log("Executando padrão arquitetural com resiliência ativada");
}\n\`\`\`\n\n*Nota: Para resumos em tempo real dinâmicos customizados via Gemini AI, certifique-se de configurar a GEMINI_API_KEY nos Secrets.*`,
      });
    }

    const langPrompt = targetLanguage === "en" ? "English" : targetLanguage === "es" ? "Spanish" : targetLanguage === "de" ? "German" : targetLanguage === "pt-PT" ? "European Portuguese (PT-PT)" : "Brazilian Portuguese (PT-BR)";

    const prompt = `Você é o redator técnico principal e Arquiteto de Software do "DevCast - Podcast de Engenharia de Software".
Sua tarefa é transformar a transcrição/conteúdo deste episódio do podcast em um ARTIGO COMPLETO E DEEP-DIVE PARA O BLOG em ${langPrompt}.

Título do Episódio: "${title}"
Categoria/Gaveta: ${category}
Nível Técnico: ${level}

Conteúdo Base do Episódio:
"""
${fullText || title}
"""

Instruções para a estrutura do Artigo de Blog em Markdown:
1. **Título Principal Engajador** (# Título)
2. **Introdução & Contexto do Problema** (Por que este tema é crucial hoje?)
3. **Resumo Executivo / 3 Pontos Principais** (Bullets com emojis)
4. **Deep Dive Técnico & Arquitetura**:
   - Explicação minuciosa dos conceitos com termos técnicos corretos.
   - Diagrama ASCII ou Tabela Comparativa de Prós e Contras / Trade-offs.
   - Exemplo prático de Código (TypeScript, Python, Go, SQL ou Rust conforme fizer sentido).
5. **Erros Comuns e Anti-patterns na Prática**
6. **Checklist para Aplicação no Trabalho**
7. **Perguntas para Reflexão da Comunidade**

Escreva com tom profissional, didático, empolgante para engenheiros e líderes técnicos. Use Markdown completo com syntax highlighting.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
    });

    res.json({ summary: response.text || "Não foi possível gerar o resumo." });
  } catch (error: any) {
    console.error("Erro na rota /api/gemini/summarize:", error);
    res.status(500).json({ error: error.message || "Erro ao gerar resumo com Gemini." });
  }
});

// API: Interactive Podcast AI Co-Host Chat
app.post("/api/gemini/chat", async (req, res) => {
  try {
    const { episodeTitle, question, history = [], targetLanguage = "pt-BR" } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        reply: `Olá! Sou o Host IA do DevCast. Sobre "${episodeTitle}": Em Engenharia de Software, este conceito é fundamental para construir sistemas escaláveis. (Dica: Configure sua GEMINI_API_KEY para respostas completas via Gemini 3.6 Flash).`,
      });
    }

    const systemInstruction = `Você é o Host Especialista em Engenharia de Software do DevCast Podcast.
Você está conversando com um ouvinte que está assistindo/lendo o episódio "${episodeTitle}".
Responda com conhecimento profundo em arquitetura de sistemas, engenharia de software, boas práticas de código, padrões de projeto, DevOps, cloud e liderança técnica.
Mantenha o tom de um co-host experiente, amigável, técnico e articulado.
Responda preferencialmente na língua solicitada (${targetLanguage}).`;

    const contents = [
      ...history.map((h: { sender: string; text: string }) => ({
        role: h.sender === "user" ? "user" : "model",
        parts: [{ text: h.text }],
      })),
      {
        role: "user",
        parts: [{ text: `Pergunta sobre o episódio "${episodeTitle}": ${question}` }],
      },
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction,
      },
    });

    res.json({ reply: response.text || "Desculpe, não consegui processar sua pergunta agora." });
  } catch (error: any) {
    console.error("Erro na rota /api/gemini/chat:", error);
    res.status(500).json({ error: error.message || "Erro no chat do co-host." });
  }
});

// API: Multilingual Translation of Episode Content
app.post("/api/gemini/translate", async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;
    const ai = getGeminiClient();

    if (!ai || !text) {
      return res.json({ translatedText: text });
    }

    const langMap: Record<string, string> = {
      "pt-BR": "Português do Brasil",
      "pt-PT": "Português de Portugal",
      "en": "English",
      "es": "Spanish",
      "de": "German",
    };

    const targetLangName = langMap[targetLanguage] || "Português do Brasil";

    const prompt = `Traduza com máxima fidelidade técnica para termos de Engenharia de Software o seguinte texto para o idioma ${targetLangName}:\n\n"""\n${text}\n"""\n\nForneça apenas o texto traduzido mantendo a formatação e os termos técnicos usuais da área (ex: Refactoring, Microservices, Thread, Deploy).`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
    });

    res.json({ translatedText: response.text || text });
  } catch (error: any) {
    console.error("Erro no translate:", error);
    res.status(500).json({ translatedText: req.body.text });
  }
});

// Serve frontend with Vite
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🎙️ DevCast Server rodando na porta ${PORT}`);
  });

}

startServer();
