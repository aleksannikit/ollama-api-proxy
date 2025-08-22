#!/usr/bin/env node

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { generateText, streamText, embed } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { ColorConsole } from './console.js';

global.console = new ColorConsole({
    stdout: process.stdout,
    stderr: process.stderr,
    timestamp: process.env.NODE_ENV !== 'production',
});

dotenv.config();

const PORT = process.env.PORT || 11434;

// Initialize providers based on available API keys
const providers = {};
if (process.env.OPENAI_API_KEY) {
    providers.openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
if (process.env.GEMINI_API_KEY) {
    providers.google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
}
if (process.env.OPENROUTER_API_KEY) {
    providers.openrouter = createOpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        compatibility: 'compatible',
        name: 'openrouter',
    });
}

if (Object.keys(providers).length === 0) {
    console.error('❌ No API keys found. Set OPENAI_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY');
    process.exit(1);
}

const DEFAULT_MODELS_PATH = path.join(process.cwd(), 'models.json');

let models = {};
let chatModels = {};
let embeddingModels = {};

const loadModels = () => {
    try {
        if (fs.existsSync(DEFAULT_MODELS_PATH)) {
            models = JSON.parse(fs.readFileSync(DEFAULT_MODELS_PATH, 'utf8'));
            console.log(`✅ Loaded models from ${DEFAULT_MODELS_PATH}`);
        } else {
            // Built-in models
            models = {
                'gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini' },
                'gpt-4.1-mini': { provider: 'openai', model: 'gpt-4.1-mini' },
                'gpt-4.1-nano': { provider: 'openai', model: 'gpt-4.1-nano' },

                'gemini-2.5-flash': { provider: 'google', model: 'gemini-2.5-flash' },
                'gemini-2.5-flash-lite': { provider: 'google', model: 'gemini-2.5-flash-lite' },

                'deepseek-r1': { provider: 'openrouter', model: 'deepseek/deepseek-r1-0528:free' },
            };
            console.log('ℹ️ Using built-in models. Create a models.json file to customize.');
        }

        // Separate models by type
        chatModels = {};
        embeddingModels = {};
        
        for (const [name, config] of Object.entries(models)) {
            // Validate model configuration
            if (!config.provider || !config.model) {
                console.warn(`⚠️ Invalid model configuration for ${name}: missing provider or model`);
                continue;
            }

            // Check if provider is available
            if (!providers[config.provider]) {
                console.warn(`⚠️ Provider ${config.provider} not available for model ${name}`);
                continue;
            }

            // Categorize by type (default to chat if no type specified)
            const modelType = config.type || 'chat';
            
            if (modelType === 'embedding') {
                // Validate embedding model configuration
                if (config.provider === 'google') {
                    // Validate Google embedding model names
                    const validGoogleEmbeddingModels = [
                        'text-embedding-004',
                        'text-embedding-001',
                        'textembedding-gecko',
                        'textembedding-gecko-multilingual'
                    ];
                    
                    if (!validGoogleEmbeddingModels.includes(config.model)) {
                        console.warn(`⚠️ Unknown Google embedding model: ${config.model} for ${name}`);
                    }
                }
                
                embeddingModels[name] = config;
                console.debug(`📊 Loaded embedding model: ${name} -> ${config.provider}/${config.model}`);
            } else if (modelType === 'chat') {
                chatModels[name] = config;
                console.debug(`💬 Loaded chat model: ${name} -> ${config.provider}/${config.model}`);
            } else {
                console.warn(`⚠️ Unknown model type '${modelType}' for ${name}, skipping`);
            }
        }

        console.log(`📋 Loaded ${Object.keys(chatModels).length} chat models and ${Object.keys(embeddingModels).length} embedding models`);
        
    } catch (error) {
        console.error(`❌ Error loading models.json: ${error.message}`);
        process.exit(1);
    }
};

// Load models on startup
loadModels();

// Utility functions
const getBody = request => new Promise(resolve => {
    let body = '';
    request.on('data', chunk => body += chunk);
    request.on('end', () => resolve(body ? JSON.parse(body) : {}));
});

const sendJSON = (response, data, status = 200) =>
    response.writeHead(status, {
        'Content-Type': 'application/json',
        'charset': 'utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }).end(JSON.stringify(data));


const validateModel = name => {
    const config = models[name];
    if (!config) {
        throw new Error(`Model ${name} not supported`);
    }
    if (!providers[config.provider]) {
        throw new Error(`Provider ${config.provider} not available`);
    }
    return config;
};

const validateChatModel = name => {
    const config = chatModels[name];
    if (!config) {
        throw new Error(`Chat model ${name} not supported`);
    }
    if (!providers[config.provider]) {
        throw new Error(`Provider ${config.provider} not available`);
    }
    return config;
};

const validateEmbeddingModel = name => {
    const config = embeddingModels[name];
    if (!config) {
        throw new Error(`Embedding model ${name} not supported`);
    }
    if (!providers[config.provider]) {
        throw new Error(`Provider ${config.provider} not available`);
    }
    if (config.type !== 'embedding') {
        throw new Error(`Model ${name} is not an embedding model`);
    }
    return config;
};

// Embedding request validation and parsing
const validateEmbeddingRequest = (body) => {
    // Check required fields
    if (!body.model) {
        throw new Error('Missing required field: model');
    }

    // Validate model exists and is an embedding model
    const modelConfig = validateEmbeddingModel(body.model);

    // Check for input text - support both Ollama formats
    let inputTexts = [];
    
    if (body.prompt) {
        // Single text format: { "model": "...", "prompt": "text" }
        if (typeof body.prompt !== 'string' || body.prompt.trim() === '') {
            throw new Error('Prompt must be a non-empty string');
        }
        inputTexts = [body.prompt.trim()];
    } else if (body.input) {
        // Multiple text format: { "model": "...", "input": ["text1", "text2"] }
        if (Array.isArray(body.input)) {
            if (body.input.length === 0) {
                throw new Error('Input array cannot be empty');
            }
            
            inputTexts = body.input.map((text, index) => {
                if (typeof text !== 'string') {
                    throw new Error(`Input at index ${index} must be a string`);
                }
                const trimmed = text.trim();
                if (trimmed === '') {
                    throw new Error(`Input at index ${index} cannot be empty`);
                }
                return trimmed;
            });
        } else if (typeof body.input === 'string') {
            // Single string in input field
            if (body.input.trim() === '') {
                throw new Error('Input cannot be empty');
            }
            inputTexts = [body.input.trim()];
        } else {
            throw new Error('Input must be a string or array of strings');
        }
    } else {
        throw new Error('Missing required field: either "prompt" or "input" must be provided');
    }

    // Validate input length limits
    const maxTexts = 100; // Reasonable limit for batch processing
    const maxTextLength = 10000; // Reasonable limit per text
    
    if (inputTexts.length > maxTexts) {
        throw new Error(`Too many input texts. Maximum allowed: ${maxTexts}`);
    }

    for (let i = 0; i < inputTexts.length; i++) {
        if (inputTexts[i].length > maxTextLength) {
            throw new Error(`Input text at index ${i} is too long. Maximum length: ${maxTextLength} characters`);
        }
    }

    return {
        modelConfig,
        inputTexts,
        isSingleText: inputTexts.length === 1 && body.prompt !== undefined
    };
};

// Error handling for embedding operations
const handleEmbeddingError = (error, response) => {
    console.error('Embedding error:', error.message);
    
    let status = 500;
    let message = 'Internal server error';
    
    // Categorize errors and set appropriate status codes
    if (error.message.includes('not supported') || 
        error.message.includes('not an embedding model') ||
        error.message.includes('Missing required field') ||
        error.message.includes('must be') ||
        error.message.includes('cannot be empty') ||
        error.message.includes('Too many') ||
        error.message.includes('too long')) {
        status = 400; // Bad Request
        message = error.message;
    } else if (error.message.includes('not available') ||
               error.message.includes('API key') ||
               error.message.includes('authentication') ||
               error.message.includes('unauthorized')) {
        status = 401; // Unauthorized
        message = error.message;
    } else if (error.message.includes('rate limit') ||
               error.message.includes('quota') ||
               error.message.includes('too many requests')) {
        status = 429; // Too Many Requests
        message = 'Rate limit exceeded. Please try again later.';
    } else if (error.message.includes('service unavailable') ||
               error.message.includes('timeout')) {
        status = 503; // Service Unavailable
        message = 'Service temporarily unavailable. Please try again later.';
    }
    
    // Send error response in Ollama format
    if (!response.headersSent) {
        sendJSON(response, { error: message }, status);
    }
};

// Generate embeddings using Google API directly
const generateEmbeddings = async (modelConfig, inputTexts) => {
    try {
        // Validate Google API key
        if (modelConfig.provider === 'google' && !process.env.GEMINI_API_KEY) {
            throw new Error('Google API key (GEMINI_API_KEY) is required for Google embedding models');
        }

        if (modelConfig.provider !== 'google') {
            throw new Error(`Only Google embedding models are currently supported, got: ${modelConfig.provider}`);
        }

        const embeddings = [];

        // Process each text input
        for (let i = 0; i < inputTexts.length; i++) {
            const text = inputTexts[i];
            
            try {
                console.debug(`🔄 Generating embedding ${i + 1}/${inputTexts.length} for model ${modelConfig.model}`);
                
                // Call Google's embedding API directly
                const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': process.env.GEMINI_API_KEY
                    },
                    body: JSON.stringify({
                        model: `models/${modelConfig.model}`,
                        content: {
                            parts: [{ text: text }]
                        }
                    })
                });

                if (!response.ok) {
                    const errorData = await response.text();
                    console.error(`Google API error (${response.status}):`, errorData);
                    
                    if (response.status === 401) {
                        throw new Error('Google API authentication failed. Please check your GEMINI_API_KEY.');
                    } else if (response.status === 429) {
                        throw new Error('Google API rate limit exceeded. Please try again later.');
                    } else if (response.status === 400) {
                        throw new Error(`Invalid request to Google API: ${errorData}`);
                    } else {
                        throw new Error(`Google API error (${response.status}): ${errorData}`);
                    }
                }

                const result = await response.json();
                
                if (!result.embedding || !result.embedding.values || !Array.isArray(result.embedding.values)) {
                    throw new Error(`Invalid embedding response for text ${i + 1}: missing or invalid embedding array`);
                }

                embeddings.push(result.embedding.values);
                
                console.debug(`✅ Generated embedding ${i + 1}/${inputTexts.length}: ${result.embedding.values.length} dimensions`);
                
            } catch (error) {
                console.error(`❌ Failed to generate embedding for text ${i + 1}:`, error.message);
                throw error; // Re-throw to be handled by caller
            }
        }

        console.log(`🎉 Successfully generated ${embeddings.length} embeddings using ${modelConfig.model}`);
        
        return {
            embeddings: embeddings,
            model: modelConfig.model,
            dimensions: embeddings.length > 0 ? embeddings[0].length : 0
        };

    } catch (error) {
        console.error('Embedding generation error:', error.message);
        throw error; // Re-throw to be handled by caller
    }
};

// Format embedding response to match Ollama's expected format
const formatEmbeddingResponse = (embeddingResult, modelName, isSingleText) => {
    const timestamp = new Date().toISOString();
    
    if (isSingleText) {
        // Single embedding response format
        // { "embedding": [0.1, 0.2, 0.3, ...], "model": "...", "created_at": "..." }
        return {
            embedding: embeddingResult.embeddings[0],
            model: modelName,
            created_at: timestamp
        };
    } else {
        // Multiple embeddings response format
        // { "embeddings": [{"embedding": [...]}, {"embedding": [...]}], "model": "...", "created_at": "..." }
        const formattedEmbeddings = embeddingResult.embeddings.map(embedding => ({
            embedding: embedding
        }));
        
        return {
            embeddings: formattedEmbeddings,
            model: modelName,
            created_at: timestamp
        };
    }
};

// Validate embedding response format
const validateEmbeddingResponse = (response, expectedCount) => {
    if (!response) {
        throw new Error('Empty embedding response');
    }
    
    if (response.embedding) {
        // Single embedding format
        if (!Array.isArray(response.embedding)) {
            throw new Error('Single embedding must be an array');
        }
        if (response.embedding.length === 0) {
            throw new Error('Embedding array cannot be empty');
        }
        if (expectedCount !== 1) {
            throw new Error(`Expected ${expectedCount} embeddings but got single embedding`);
        }
    } else if (response.embeddings) {
        // Multiple embeddings format
        if (!Array.isArray(response.embeddings)) {
            throw new Error('Embeddings must be an array');
        }
        if (response.embeddings.length !== expectedCount) {
            throw new Error(`Expected ${expectedCount} embeddings but got ${response.embeddings.length}`);
        }
        
        // Validate each embedding object
        for (let i = 0; i < response.embeddings.length; i++) {
            const embeddingObj = response.embeddings[i];
            if (!embeddingObj.embedding || !Array.isArray(embeddingObj.embedding)) {
                throw new Error(`Embedding at index ${i} is invalid or missing`);
            }
            if (embeddingObj.embedding.length === 0) {
                throw new Error(`Embedding at index ${i} is empty`);
            }
        }
    } else {
        throw new Error('Response must contain either "embedding" or "embeddings" field');
    }
    
    // Validate required fields
    if (!response.model || typeof response.model !== 'string') {
        throw new Error('Response must contain valid model name');
    }
    
    if (!response.created_at || typeof response.created_at !== 'string') {
        throw new Error('Response must contain valid created_at timestamp');
    }
    
    return true;
};

// Prepare messages for AI SDK
const prepareMessages = messages => messages
    .filter(msg => msg.content && msg.content.trim()) // Remove empty messages
    .map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: String(msg.content).trim(),
    }));


// Generate complete text response using AI SDK
const generateResponse = async (modelConfig, messages, options = {}) => {
    const provider = providers[modelConfig.provider];
    const model = provider(modelConfig.model);

    const validMessages = prepareMessages(messages);

    if (validMessages.length === 0) {
        throw new Error('No valid messages found');
    }

    const result = await generateText({
        model,
        messages: validMessages,
        temperature: options.temperature,
        maxTokens: options.num_predict || 32768,
        topP: options.top_p,
    });

    // Handle different response formats from upstream
    let text = result.text;
    let reasoning = result.reasoning || null;
    let responseMessages = null;

    // If upstream returns messages array, extract the assistant's response
    if (result.messages && Array.isArray(result.messages)) {
        responseMessages = result.messages;

        // Find the last assistant message for the main response
        const assistantMessage = result.messages
            .filter(msg => msg.role === 'assistant')
            .pop();

        if (assistantMessage) {
            text = assistantMessage.content || assistantMessage.text || text;

            // Check if the assistant message has reasoning
            if (assistantMessage.reasoning) {
                reasoning = assistantMessage.reasoning;
            }
        }
    }

    // Return structured response
    return {
        text: text || '',
        reasoning: reasoning,
        messages: responseMessages,
    };
};

// Stream text response using AI SDK
const streamResponse = async (response, modelConfig, messages, options = {}, responseKey = 'message') => {
    const provider = providers[modelConfig.provider];
    const model = provider(modelConfig.model);

    const validMessages = prepareMessages(messages);

    if (validMessages.length === 0) {
        throw new Error('No valid messages found');
    }

    // Set streaming headers
    response.writeHead(200, {
        'Content-Type': 'application/x-ndjson',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    try {
        const result = await streamText({
            model,
            messages: validMessages,
            temperature: options.temperature,
            maxTokens: options.num_predict,
            topP: options.top_p,
        });

        const modelName = modelConfig.model;

        // Stream the tokens
        for await (const delta of result.textStream) {
            const chunk = {
                model: modelName,
                created_at: new Date().toISOString(),
                done: false,
            };

            // Set the content based on response type
            if (responseKey === 'message') {
                chunk.message = {
                    role: 'assistant',
                    content: delta,
                };
            } else if (responseKey === 'response') {
                chunk.response = delta;
            }

            // Send chunk as NDJSON
            response.write(JSON.stringify(chunk) + '\n');
        }

        // Send final chunk with done: true
        const finalChunk = {
            model: modelName,
            created_at: new Date().toISOString(),
            done: true,
        };

        // Set empty content for final chunk
        if (responseKey === 'message') {
            finalChunk.message = {
                role: 'assistant',
                content: '',
            };
        } else if (responseKey === 'response') {
            finalChunk.response = '';
        }

        // Add reasoning if available
        if (result.reasoning) {
            if (responseKey === 'message') {
                finalChunk.message.reasoning = result.reasoning;
            } else {
                finalChunk.reasoning = result.reasoning;
            }
        }

        response.write(JSON.stringify(finalChunk) + '\n');
        response.end();

    } catch (error) {
        console.error('Streaming error:', error.message);

        // Send error chunk
        const errorChunk = {
            model: modelConfig.model,
            created_at: new Date().toISOString(),
            done: true,
            error: error.message,
        };

        response.write(JSON.stringify(errorChunk) + '\n');
        response.end();
    }
};

// Route handlers
const handleModelGenerationRequest = async (request, response, messageExtractor, responseKey) => {
    try {

        const body = await getBody(request);
        console.info(body);
        const { model, options = {}, stream = false } = body;

        const modelConfig = validateChatModel(model);
        const messages = messageExtractor(body) || [];

        console.debug(model, messages, { stream });

        // Handle streaming vs non-streaming responses
        if (stream) {
            await streamResponse(response, modelConfig, messages, options, responseKey);
        } else {
            const result = await generateResponse(modelConfig, messages, options);

            const responseData = {
                model,
                created_at: new Date().toISOString(),
                done: true,
            };

            // Set the main content key based on the request type
            if (responseKey === 'message') {
                responseData.message = {
                    role: 'assistant',
                    content: result.text,
                };
            } else if (responseKey === 'response') {
                responseData.response = result.text;
            }

            // Add reasoning if available
            if (result.reasoning) {
                if (responseKey === 'message') {
                    responseData.message.reasoning = result.reasoning;
                } else {
                    responseData.reasoning = result.reasoning;
                }
            }

            // Add messages array if available (for debugging or advanced use cases)
            if (result.messages) {
                responseData.messages = result.messages;
            }

            sendJSON(response, responseData);
        }
    } catch (error) {
        console.error('API request error:', error.message);

        // If response hasn't been sent yet, send JSON error
        if (!response.headersSent) {
            sendJSON(response, { error: error.message }, 500);
        } else {
            // If streaming has started, send error chunk
            const errorChunk = {
                model: 'unknown',
                created_at: new Date().toISOString(),
                done: true,
                error: error.message,
            };
            response.write(JSON.stringify(errorChunk) + '\n');
            response.end();
        }
    }
};

const routes = {
    'GET /': (request, response) => response.end('Ollama is running in proxy mode.'),
    'GET /api/version': (request, response) => sendJSON(response, { version: '1.0.1e' }),
    'GET /api/tags': (request, response) => {
        const availableModels = [];
        
        // Add chat models
        Object.entries(chatModels).forEach(([name, config]) => {
            availableModels.push({
                name,
                model: name,
                modified_at: new Date().toISOString(),
                size: 1000000000,
                digest: `sha256:${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                details: {
                    family: 'chat',
                    format: 'gguf',
                    parameter_size: '7B',
                    quantization_level: 'Q4_K_M'
                }
            });
        });
        
        // Add embedding models
        Object.entries(embeddingModels).forEach(([name, config]) => {
            availableModels.push({
                name,
                model: name,
                modified_at: new Date().toISOString(),
                size: 500000000, // Smaller size for embedding models
                digest: `sha256:${name.replace(/[^a-zA-Z0-9]/g, '')}`,
                details: {
                    family: 'embedding',
                    format: 'gguf',
                    parameter_size: '4B',
                    quantization_level: 'Q4_K_M'
                }
            });
        });
        
        sendJSON(response, { models: availableModels });
    },
    'POST /api/chat': async (request, response) => {
        await handleModelGenerationRequest(
            request,
            response,
            body => body.messages,
            'message',
        );
    },
    'POST /api/generate': async (request, response) => {
        await handleModelGenerationRequest(
            request,
            response,
            body => [{ role: 'user', content: body.prompt }],
            'response',
        );
    },
    'POST /api/embeddings': async (request, response) => {
        try {
            // Get request body
            const body = await getBody(request);
            console.info('Embedding request:', { model: body.model, inputCount: body.input?.length || (body.prompt ? 1 : 0) });

            // Validate embedding request
            const { modelConfig, inputTexts, isSingleText } = validateEmbeddingRequest(body);
            
            console.debug(`Processing ${inputTexts.length} texts with model ${modelConfig.model}`);

            // Generate embeddings using Google API
            const embeddingResult = await generateEmbeddings(modelConfig, inputTexts);
            
            // Format response to match Ollama format
            const formattedResponse = formatEmbeddingResponse(embeddingResult, body.model, isSingleText);
            
            // Validate the formatted response
            validateEmbeddingResponse(formattedResponse, inputTexts.length);
            
            console.info(`✅ Successfully processed embedding request for model ${body.model}`);
            
            // Send successful response
            sendJSON(response, formattedResponse);
            
        } catch (error) {
            console.error('Embedding endpoint error:', error.message);
            handleEmbeddingError(error, response);
        }
    },
};

// HTTP Server
const ollamaProxyServer = http.createServer(async (request, response) => {
    const routeKey = `${request.method} ${request.url.split('?')[0]}`;


    console.info(routeKey);


    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return response.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }).end();
    }

    try {
        const handler = routes[routeKey];
        if (handler) {
            await handler(request, response);
        } else {
            sendJSON(response, { error: 'Not found' }, 404);
        }
    } catch (error) {
        console.error('Server error:', error.message);
        if (!response.headersSent) {
            sendJSON(response, { error: 'Internal server error' }, 500);
        }
    }
});

// Start server
ollamaProxyServer.listen(PORT, () => {
    const availableModels = Object.keys(models).filter(name => providers[models[name].provider]);

    console.log(`🚀 Ollama Proxy with Streaming running on http://localhost:${PORT}`);
    console.log(`🔑 Providers: ${Object.keys(providers).join(', ')}`);
    console.log(`📋 Available models: ${availableModels.join(', ')}`);
});

// Graceful shutdown
['SIGINT', 'SIGTERM'].forEach(signal => {
    process.on(signal, () => {
        console.log(`\n🛑 Received ${signal}, shutting down...`);
        ollamaProxyServer.close(() => process.exit(0));
    });
});
