import "dotenv/config";
import path from "node:path";
import { parseArgs } from "node:util";
import { QdrantVectorStore } from "@langchain/qdrant";
import { OpenAIEmbeddings } from "@langchain/openai";
import { OpenAI } from "openai";

const llmClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const getBookName = (doc) =>
  doc.metadata.bookName ??
  path.basename(doc.metadata.source ?? "unknown", path.extname(doc.metadata.source ?? ""));

const getPageNumber = (doc) => doc.metadata.loc?.pageNumber ?? "unknown";

const formatDocSource = (doc) => `${getBookName(doc)}, page ${getPageNumber(doc)}`;

const formatContext = (docs) =>
  docs
    .map((doc) => `[Source: ${formatDocSource(doc)}]\n${doc.pageContent}`)
    .join("\n\n");

const retrieval = async (userPrompt) => {
  const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: "text-embedding-3-small",
  });

  const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
    url: "http://localhost:6333",
    collectionName: "pdf-embeddings",
  });

  const retriever = vectorStore.asRetriever({ k: 5 });
  const docs = await retriever.invoke(userPrompt);
  const context = formatContext(docs);
  const sources = [...new Set(docs.map(formatDocSource))];

  const llmResponse = await llmClient.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a helpful assistant that answers questions using only the provided context. If the answer is not in the context, say you don't know. End your answer with a Sources section listing the book name and page number for each source you used. Use the exact book name and page from the [Source: ...] tags in the context. Format: Source: book_name, page X",
      },
      {
        role: "user",
        content: `Context:\n${context}\n\nQuestion: ${userPrompt}`,
      },
    ],
  });

  const answer = llmResponse.choices[0].message.content.trim();
  const sourceList = sources.map((source) => `- ${source}`).join("\n");

  console.log(`⚡ Answer\n\n${answer}\n\n📚 Retrieved from:\n${sourceList}`);
  return { answer, sources };
};

const { values } = parseArgs({
  options: {
    question: { type: "string", short: "q" },
  },
});

const userPrompt = values.question;

if (!userPrompt) {
  console.error('Usage: node retrival.js -q "your question"');
  console.error('       node retrival.js --question "your question"');
  process.exit(1);
}

retrieval(userPrompt).catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
