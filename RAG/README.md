# RAG — PDF Question Answering

Retrieval-augmented generation over PDF documents. PDFs are split into chunks, embedded with OpenAI, and stored in a local [Qdrant](https://qdrant.tech) vector database. Questions are answered by `gpt-4o-mini` using only the retrieved chunks, with book name and page number cited for every source.

## How it works

1. **`embeddings.js`** — loads a PDF, splits it into 1000-character chunks (200 overlap), embeds each chunk with `text-embedding-3-small`, and saves everything to the `pdf-embeddings` collection in Qdrant.
2. **`retrival.js`** — embeds your question, retrieves the 5 most similar chunks, and asks `gpt-4o-mini` to answer using only that context. The answer ends with a Sources section (book name + page).

## Setup

```bash
pnpm install
cp .env.example .env      # add your OpenAI API key
docker compose up -d      # starts Qdrant on http://localhost:6333
```

## Usage

Ingest a PDF (the file path is currently hardcoded at the bottom of `embeddings.js` — edit it to point at your document, then run):

```bash
node embeddings.js
```

Ask questions:

```bash
node retrival.js -q "What does the document say about risk management?"
```

## Notes

- Qdrant data persists in a Docker volume (`qdrant_data`), so you only need to ingest each document once.
- Re-running `embeddings.js` adds more chunks to the same collection; you can ingest multiple PDFs and query across all of them. Each chunk keeps its source book name in metadata.
- Qdrant has a web UI at <http://localhost:6333/dashboard> for inspecting the collection.

## Stack

- [LangChain JS](https://js.langchain.com) — PDF loading, text splitting, vector store integration
- [Qdrant](https://qdrant.tech) — vector database (Docker)
- OpenAI — `text-embedding-3-small` embeddings, `gpt-4o-mini` answers
