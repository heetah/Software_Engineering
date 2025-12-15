/**
 * RAG Engine - Semantic Code Search
 * Powered by LlamaIndex & LangChain
 */

import fs from 'fs';
import path from 'path';
import { Document, VectorStoreIndex, Settings } from "llamaindex";
import { OpenAIEmbedding } from "@llamaindex/openai";
import { fileURLToPath } from 'url';

// Helper for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


class RagEngine {
    constructor() {
        this.index = null;
        this.documents = [];
        this.isInitialized = false;
        this.knowledgeBaseIngested = false;
        this.config = {};
    }

    /**
     * Initialize RAG Engine with user configuration
     * @param {object} config { cloudApiEndpoint, cloudApiKey, ... }
     */
    init(config) {
        this.config = config || {};
        const { cloudApiKey, cloudApiEndpoint } = this.config;

        console.log('[RagEngine] Initializing with config...');

        // Dynamic API Configuration
        if (cloudApiKey) {
            // LlamaIndex relies on process.env.OPENAI_API_KEY by default
            process.env.OPENAI_API_KEY = cloudApiKey;

            // Explicitly set the embedding model to fix the warning
            try {
                Settings.embedModel = new OpenAIEmbedding({
                    apiKey: cloudApiKey,
                    model: "text-embedding-3-small" // Efficient and capable model
                });
                console.log('[RagEngine] Embedding model configured: text-embedding-3-small');
            } catch (err) {
                console.warn('[RagEngine] Failed to configure embedding model:', err.message);
            }
        }

        // If user is using Gemini explicitly, we might warn about Embedding support
        if (cloudApiEndpoint && cloudApiEndpoint.includes('goog')) {
            console.warn('[RagEngine] ⚠️ Gemini API detected. LlamaIndex JS Support for Gemini Embeddings is limited.');
            console.warn('[RagEngine] Indexing might fail if no OpenAI Key is present for Embeddings.');
        }
    }

    /**
     * Ingest a file into the vector index
     * @param {string} filePath 
     * @param {string} content 
     */
    async ingestFile(filePath, content) {
        if (!content || content.trim().length === 0) return;

        const doc = new Document({
            text: content,
            metadata: {
                filePath: filePath,
                fileName: path.basename(filePath),
                type: 'user_code'
            }
        });

        this.documents.push(doc);
        // console.log(`[RagEngine] Ingested: ${path.basename(filePath)}`);
    }

    /**
     * Scan and ingest the "knowledge base" (folders next to this script)
     */
    async ingestKnowledgeBase() {
        if (this.knowledgeBaseIngested) return;

        console.log('[RagEngine] Scanning Knowledge Base in:', __dirname);

        // Helper to recursively walk dirs
        const walk = async (dir) => {
            try {
                const files = await fs.promises.readdir(dir);
                for (const file of files) {
                    const fullPath = path.join(dir, file);
                    const stat = await fs.promises.stat(fullPath);

                    if (stat.isDirectory()) {
                        if (file !== 'node_modules' && file !== '.git') {
                            await walk(fullPath);
                        }
                    } else if (file !== 'index.js' && !file.endsWith('.map')) {
                        // Ingest!
                        try {
                            const content = await fs.promises.readFile(fullPath, 'utf-8');
                            const doc = new Document({
                                text: content,
                                metadata: {
                                    filePath: fullPath,
                                    fileName: file,
                                    type: 'knowledge_base'
                                }
                            });
                            this.documents.push(doc);
                        } catch (e) {
                            console.warn(`[RagEngine] Failed to read ${file}: ${e.message}`);
                        }
                    }
                }
            } catch (err) {
                console.warn(`[RagEngine] Error walking dir ${dir}: ${err.message}`);
            }
        };

        await walk(__dirname);
        this.knowledgeBaseIngested = true;
        console.log(`[RagEngine] Knowledge Base loaded (${this.documents.length} docs total).`);
    }

    /**
     * Build the index from ingested documents
     */
    async buildIndex() {
        if (this.documents.length === 0) return;

        // console.log(`[RagEngine] Building Vector Index for ${this.documents.length} files...`);
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
    async query(queryText, topK = 5) {
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
                const source = meta.type === 'knowledge_base' ? '📚 KNOWLEDGE BASE' : '📂 PROJECT FILE';
                return `// --- [${source}] ${meta.fileName} ---\n${node.node.text}\n// ---------------------------`;
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
