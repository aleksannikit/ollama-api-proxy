#!/usr/bin/env node

// Comprehensive unit tests for embedding functionality
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Mock setup
const DEFAULT_MODELS_PATH = path.join(projectRoot, 'models.json');
let models = {};
let embeddingModels = {};
const providers = { google: true, openai: true, openrouter: true };

// Load models
models = JSON.parse(fs.readFileSync(DEFAULT_MODELS_PATH, 'utf8'));
for (const [name, config] of Object.entries(models)) {
    if (config.type === 'embedding') {
        embeddingModels[name] = config;
    }
}

// Copy functions from main code for testing
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

const validateEmbeddingRequest = (body) => {
    if (!body.model) {
        throw new Error('Missing required field: model');
    }

    const modelConfig = validateEmbeddingModel(body.model);

    let inputTexts = [];
    
    if (body.prompt) {
        if (typeof body.prompt !== 'string' || body.prompt.trim() === '') {
            throw new Error('Prompt must be a non-empty string');
        }
        inputTexts = [body.prompt.trim()];
    } else if (body.input) {
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

    const maxTexts = 100;
    const maxTextLength = 10000;
    
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

const formatEmbeddingResponse = (embeddingResult, modelName, isSingleText) => {
    const timestamp = new Date().toISOString();
    
    if (isSingleText) {
        return {
            embedding: embeddingResult.embeddings[0],
            model: modelName,
            created_at: timestamp
        };
    } else {
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

const validateEmbeddingResponse = (response, expectedCount) => {
    if (!response) {
        throw new Error('Empty embedding response');
    }
    
    if (response.embedding) {
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
        if (!Array.isArray(response.embeddings)) {
            throw new Error('Embeddings must be an array');
        }
        if (response.embeddings.length !== expectedCount) {
            throw new Error(`Expected ${expectedCount} embeddings but got ${response.embeddings.length}`);
        }
        
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
    
    if (!response.model || typeof response.model !== 'string') {
        throw new Error('Response must contain valid model name');
    }
    
    if (!response.created_at || typeof response.created_at !== 'string') {
        throw new Error('Response must contain valid created_at timestamp');
    }
    
    return true;
};

// Test suite
class TestSuite {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
    }

    test(name, fn) {
        this.tests.push({ name, fn });
    }

    async run() {
        console.log('🧪 Running embedding functionality tests...\n');

        for (const test of this.tests) {
            try {
                await test.fn();
                console.log(`✅ ${test.name}: PASSED`);
                this.passed++;
            } catch (error) {
                console.log(`❌ ${test.name}: FAILED`);
                console.log(`   Error: ${error.message}`);
                this.failed++;
            }
        }

        console.log(`\n📊 Test Results: ${this.passed} passed, ${this.failed} failed`);
        return this.failed === 0;
    }
}

const suite = new TestSuite();

// Model configuration tests
suite.test('Model loading - should load embedding models correctly', () => {
    const expectedModels = ['text-embedding-004', 'text-embedding-001', 'qwen-embedding'];
    const loadedModels = Object.keys(embeddingModels);
    
    if (loadedModels.length !== expectedModels.length) {
        throw new Error(`Expected ${expectedModels.length} embedding models, got ${loadedModels.length}`);
    }
    
    for (const model of expectedModels) {
        if (!embeddingModels[model]) {
            throw new Error(`Expected embedding model ${model} not found`);
        }
    }
});

suite.test('Model validation - should validate valid embedding model', () => {
    const config = validateEmbeddingModel('text-embedding-004');
    if (config.provider !== 'google' || config.model !== 'text-embedding-004') {
        throw new Error('Invalid model configuration returned');
    }
});

suite.test('Model validation - should reject invalid embedding model', () => {
    try {
        validateEmbeddingModel('invalid-model');
        throw new Error('Should have thrown error for invalid model');
    } catch (error) {
        if (!error.message.includes('not supported')) {
            throw new Error('Wrong error message for invalid model');
        }
    }
});

// Request validation tests
suite.test('Request validation - should accept valid single prompt', () => {
    const result = validateEmbeddingRequest({
        model: 'text-embedding-004',
        prompt: 'Hello world'
    });
    
    if (result.inputTexts.length !== 1 || result.inputTexts[0] !== 'Hello world') {
        throw new Error('Invalid parsing of single prompt');
    }
    if (!result.isSingleText) {
        throw new Error('Should detect single text format');
    }
});

suite.test('Request validation - should accept valid multiple inputs', () => {
    const result = validateEmbeddingRequest({
        model: 'qwen-embedding',
        input: ['Text 1', 'Text 2', 'Text 3']
    });
    
    if (result.inputTexts.length !== 3) {
        throw new Error('Invalid parsing of multiple inputs');
    }
    if (result.isSingleText) {
        throw new Error('Should not detect single text format for array input');
    }
});

suite.test('Request validation - should reject missing model', () => {
    try {
        validateEmbeddingRequest({ prompt: 'Hello world' });
        throw new Error('Should have thrown error for missing model');
    } catch (error) {
        if (!error.message.includes('Missing required field: model')) {
            throw new Error('Wrong error message for missing model');
        }
    }
});

suite.test('Request validation - should reject empty input array', () => {
    try {
        validateEmbeddingRequest({
            model: 'text-embedding-004',
            input: []
        });
        throw new Error('Should have thrown error for empty input array');
    } catch (error) {
        if (!error.message.includes('Input array cannot be empty')) {
            throw new Error('Wrong error message for empty input array');
        }
    }
});

// Response formatting tests
suite.test('Response formatting - should format single embedding correctly', () => {
    const mockResult = {
        embeddings: [[0.1, 0.2, 0.3, 0.4]],
        model: 'text-embedding-004'
    };
    
    const response = formatEmbeddingResponse(mockResult, 'text-embedding-004', true);
    
    if (!response.embedding || !Array.isArray(response.embedding)) {
        throw new Error('Single embedding response should have embedding array');
    }
    if (response.embedding.length !== 4) {
        throw new Error('Embedding array has wrong length');
    }
    if (!response.model || !response.created_at) {
        throw new Error('Response missing required fields');
    }
});

suite.test('Response formatting - should format multiple embeddings correctly', () => {
    const mockResult = {
        embeddings: [
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
            [0.7, 0.8, 0.9]
        ],
        model: 'text-embedding-004'
    };
    
    const response = formatEmbeddingResponse(mockResult, 'text-embedding-004', false);
    
    if (!response.embeddings || !Array.isArray(response.embeddings)) {
        throw new Error('Multiple embeddings response should have embeddings array');
    }
    if (response.embeddings.length !== 3) {
        throw new Error('Wrong number of embeddings in response');
    }
    
    for (let i = 0; i < response.embeddings.length; i++) {
        if (!response.embeddings[i].embedding || !Array.isArray(response.embeddings[i].embedding)) {
            throw new Error(`Embedding ${i} is not properly formatted`);
        }
    }
});

// Response validation tests
suite.test('Response validation - should validate correct single embedding response', () => {
    const response = {
        embedding: [0.1, 0.2, 0.3, 0.4],
        model: 'text-embedding-004',
        created_at: new Date().toISOString()
    };
    
    const isValid = validateEmbeddingResponse(response, 1);
    if (!isValid) {
        throw new Error('Valid single embedding response should pass validation');
    }
});

suite.test('Response validation - should validate correct multiple embeddings response', () => {
    const response = {
        embeddings: [
            { embedding: [0.1, 0.2, 0.3] },
            { embedding: [0.4, 0.5, 0.6] }
        ],
        model: 'text-embedding-004',
        created_at: new Date().toISOString()
    };
    
    const isValid = validateEmbeddingResponse(response, 2);
    if (!isValid) {
        throw new Error('Valid multiple embeddings response should pass validation');
    }
});

suite.test('Response validation - should reject response with wrong embedding count', () => {
    const response = {
        embeddings: [
            { embedding: [0.1, 0.2, 0.3] }
        ],
        model: 'text-embedding-004',
        created_at: new Date().toISOString()
    };
    
    try {
        validateEmbeddingResponse(response, 2);
        throw new Error('Should have thrown error for wrong embedding count');
    } catch (error) {
        if (!error.message.includes('Expected 2 embeddings but got 1')) {
            throw new Error('Wrong error message for embedding count mismatch');
        }
    }
});

// Run all tests
suite.run().then(success => {
    process.exit(success ? 0 : 1);
});