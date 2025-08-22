# Requirements Document

## Introduction

This feature extends the existing Ollama API proxy to support embedding models, specifically allowing users to proxy Ollama embedding requests (like Qwen/Qwen3-Embedding-4B-GGUF:Q4_K_M) to Google's embedding models (text-embedding-004, text-embedding-001, etc.). This enables users to leverage Google's powerful embedding models through the familiar Ollama API interface, particularly useful for applications that expect Ollama's embedding endpoints but want to use commercial embedding services.

## Requirements

### Requirement 1

**User Story:** As a developer using Ollama-compatible tools, I want to configure embedding models in the models.json file, so that I can map local embedding model names to Google embedding models.

#### Acceptance Criteria

1. WHEN a user adds an embedding model configuration to models.json THEN the system SHALL recognize it as an embedding model type
2. WHEN the configuration specifies provider as "google" and model type as "embedding" THEN the system SHALL validate the Google embedding model name
3. IF the embedding model configuration is invalid THEN the system SHALL log an error and exclude it from available models
4. WHEN the system loads models.json THEN it SHALL distinguish between chat models and embedding models

### Requirement 2

**User Story:** As a developer, I want to call the Ollama `/api/embeddings` endpoint with an embedding model name, so that I can get embeddings for my text using Google's embedding service.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/embeddings` THEN the system SHALL accept the request
2. WHEN the request contains a valid embedding model name and input text THEN the system SHALL proxy the request to Google's embedding API
3. WHEN the request contains an array of input texts THEN the system SHALL process all texts and return embeddings for each
4. IF the model specified is not an embedding model THEN the system SHALL return an error with status 400
5. WHEN the embedding request is successful THEN the system SHALL return embeddings in Ollama-compatible format

### Requirement 3

**User Story:** As a developer, I want the embedding response to match Ollama's expected format, so that my existing code works without modifications.

#### Acceptance Criteria

1. WHEN embeddings are returned THEN the response SHALL include the "embedding" field with the vector array
2. WHEN multiple texts are processed THEN the response SHALL include "embeddings" field with an array of embedding objects
3. WHEN the response is generated THEN it SHALL include model name and created_at timestamp
4. WHEN an error occurs THEN the response SHALL follow Ollama's error format

### Requirement 4

**User Story:** As a developer, I want embedding models to appear in the `/api/tags` endpoint, so that I can discover available embedding models programmatically.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/tags` THEN embedding models SHALL be included in the response
2. WHEN embedding models are listed THEN they SHALL be clearly distinguishable from chat models
3. WHEN the tags response is generated THEN embedding models SHALL include appropriate metadata
4. IF no embedding models are configured THEN only chat models SHALL appear in the tags response

### Requirement 5

**User Story:** As a system administrator, I want proper error handling for embedding requests, so that I can troubleshoot issues effectively.

#### Acceptance Criteria

1. WHEN the Google API key is missing THEN the system SHALL return a clear error message
2. WHEN the Google embedding API returns an error THEN the system SHALL log the error and return an appropriate response
3. WHEN invalid input is provided THEN the system SHALL validate and return specific error messages
4. WHEN rate limits are exceeded THEN the system SHALL handle the error gracefully and inform the user

### Requirement 6

**User Story:** As a developer, I want to use different Google embedding models, so that I can choose the best model for my use case.

#### Acceptance Criteria

1. WHEN configuring embedding models THEN the system SHALL support text-embedding-004
2. WHEN configuring embedding models THEN the system SHALL support text-embedding-001  
3. WHEN configuring embedding models THEN the system SHALL support other Google embedding models
4. WHEN an unsupported Google embedding model is specified THEN the system SHALL return an appropriate error