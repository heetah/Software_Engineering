/**
 * RAG Engine - Semantic Code Search
 * Powered by LlamaIndex & LangChain
 */

import fs from 'fs';
import path from 'path';
import { Document, VectorStoreIndex, Settings, OpenAI, OpenAIEmbedding } from "llamaindex";

// Configure LlamaIndex to use the same keys as the rest of the app
const API_KEY = process.env.OPENAI_API_KEY || process.env.CLOUD_API_KEY;
if (API_KEY) {
    Settings.llm = new OpenAI({ apiKey: API_KEY, model: "gpt-4o" });
    Settings.embedModel = new OpenAIEmbedding({ apiKey: API_KEY });
}

class RagEngine {
    constructor() {
        this.index = null;
        this.documents = [];
        this.isInitialized = false;
    }

    /**
     * Ingest a file into the vector index
     * @param {string} filePath 
     * @param {string} content 
     */
    async ingestFile(filePath, content) {
        if (!content || content.trim().length === 0) return;

        // Create a Document object
        const doc = new Document({
            text: content,
            metadata: {
                filePath: filePath,
                fileName: path.basename(filePath)
            }
        });

        this.documents.push(doc);
        console.log(`[RagEngine] Ingested: ${path.basename(filePath)}`);
    }

    /**
     * Build the index from ingested documents
     */
    async buildIndex() {
        if (this.documents.length === 0) return;

        console.log(`[RagEngine] Building Vector Index for ${this.documents.length} files...`);
        this.index = await VectorStoreIndex.fromDocuments(this.documents);
        this.isInitialized = true;
        console.log(`[RagEngine] Index built successfully.`);
    }

    /**
     * Query the knowledge base
     * @param {string} queryText 
     * @param {number} topK 
     * @returns {Promise<string>} Combined context chunks
     */
    async query(queryText, topK = 2) {
        if (!this.isInitialized || !this.index) {
            return "";
        }

        try {
            const retriever = this.index.asRetriever();
            retriever.similarityTopK = topK;

            const results = await retriever.retrieve(queryText);

            if (!results || results.length === 0) return "";

            let contextStr = results.map(node => {
                const meta = node.node.metadata;
                return `// --- From: ${meta.fileName} ---\n${node.node.text}\n// ---------------------------`;
            }).join('\n\n');

            return contextStr;
        } catch (error) {
            console.error("[RagEngine] Query error:", error);
            return "";
        }
    }
}

// Singleton instance
const ragEngine = new RagEngine();
export default ragEngine;
