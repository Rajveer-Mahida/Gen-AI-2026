import "dotenv/config";
import path from "node:path";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { OpenAIEmbeddings } from "@langchain/openai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

const generateEmbeddings = async (filePath) => {
  console.log("📄 Loading file...");

  const loader = new PDFLoader(filePath);
  const docs = await loader.load();
  const bookName = path.basename(filePath, path.extname(filePath));
  const docsWithBook = docs.map((doc) => ({
    ...doc,
    metadata: { ...doc.metadata, bookName },
  }));

  console.log("📄 File loaded successfully");

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const splits = await textSplitter.splitDocuments(docsWithBook);

  console.log(`📄 Split into ${splits.length} chunks`);

  const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    model: "text-embedding-3-small",
  });

  console.log("📄 Generating embeddings and saving to vector store...");

  const vectorStore = await QdrantVectorStore.fromDocuments(splits, embeddings, {
    url: "http://localhost:6333",
    collectionName: "pdf-embeddings",
  });

  console.log("✅ Embeddings generated and saved to vector store");

  return vectorStore;
};

generateEmbeddings("pdf/nist.ai.pdf").catch((error) => {
  console.error("❌ Error:", error);
  process.exit(1);
});
