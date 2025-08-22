# Ollama to OpenAI/Gemini/OpenRouter Proxy

[![Version](https://img.shields.io/badge/version-1.0.2-blue.svg)](https://github.com/xrip/ollama-api-proxy)

A Multi-Provider Ollama Proxy Server that allows using JetBrains AI Assistant with third-party commercial LLMs like
OpenAI, Google Gemini, and OpenRouter, taking advantage of their free tier usage. Especialy for Kimi K2 and Deepseek R1

## Overview

This proxy server translates requests from the Ollama API format to OpenAI, Google Gemini, or OpenRouter API formats,
allowing
you to use these commercial LLMs with tools that support the Ollama API, such as JetBrains AI Assistant.

The server runs on port 11434 by default (the same port as Ollama) and requires API keys for OpenAI, Gemini, and/or
OpenRouter, configured via
environment variables.

## Features

- Seamless integration with JetBrains AI Assistant
- Support for multiple LLM providers:
    - OpenAI models
    - Google Gemini models
  - OpenRouter models
- Support for embedding models:
    - Google embedding models (text-embedding-004, text-embedding-001)
    - Proxy Ollama embedding models to Google's embedding API
- Compatible with Ollama API endpoints:
    - `/api/chat` - for chat completions
    - `/api/generate` - for text generation
    - `/api/embeddings` - for text embeddings
    - `/api/tags` - for listing available models (including embedding models)
    - `/api/version` - for version information

## Supported Models

The proxy server supports a variety of models from OpenAI, Google Gemini, and OpenRouter. The default configurations
are:

### OpenAI Models

- gpt-4o-mini
- gpt-4.1-mini
- gpt-4.1-nano

### Google Gemini Models

- gemini-2.5-flash
- gemini-2.5-flash-lite-preview-06-17

### OpenRouter Models

- deepseek-r1

### Google Embedding Models

- text-embedding-004
- text-embedding-001

## Customizing Models

You can customize the available models by creating a `models.json` file in the directory where you run the proxy server.
This file should contain a JSON object where keys are the model names you want to expose, and values are objects
specifying the `provider` (e.g., `openai`, `google`, `openrouter`), the actual `model` name as expected by the
respective API, and the `type` (either `chat` or `embedding`).

If a `models.json` file is found in the current working directory, the proxy will load models from it. Otherwise, it
will use the built-in default models.

**Example `models.json`:**

```json
{
    "my-custom-gpt": { "provider": "openai", "model": "gpt-4o-mini", "type": "chat" },
    "my-gemini-pro": { "provider": "google", "model": "gemini-pro", "type": "chat" },
    "my-openrouter-model": { "provider": "openrouter", "model": "mistralai/mistral-7b-instruct-v0.2", "type": "chat" },
    "qwen-embedding": { "provider": "google", "model": "text-embedding-004", "type": "embedding" },
    "my-embedding": { "provider": "google", "model": "text-embedding-001", "type": "embedding" }
}
```

### Model Types

- **Chat models** (`type: "chat"`): Used for conversational AI and text generation via `/api/chat` and `/api/generate` endpoints
- **Embedding models** (`type: "embedding"`): Used for generating text embeddings via `/api/embeddings` endpoint

This allows you to rename models, add new ones supported by the providers, or remove models you don't intend to use. You can also proxy Ollama embedding models (like Qwen/Qwen3-Embedding-4B-GGUF) to Google's embedding API by configuring them with `provider: "google"` and `type: "embedding"`.

## Installation

### Prerequisites

- Node.js >= 18.0.0 or Bun >= 1.2.0
- API key for OpenAI, Google Gemini, and/or OpenRouter

### Using npm

```bash
# Clone the repository
git clone https://github.com/xrip/ollama-api-proxy.git
cd ollama-api-proxy

# Install dependencies
npm install

# Create .env file with your API keys
echo "OPENAI_API_KEY=your_openai_api_key" > .env
echo "GEMINI_API_KEY=your_gemini_api_key" >> .env
echo "OPENROUTER_API_KEY=your_openrouter_api_key" >> .env

# Start the server
npm start
```

### Using Docker

```bash
# Clone the repository
git clone https://github.com/xrip/ollama-api-proxy.git
cd ollama-api-proxy

# Create .env file with your API keys
echo "OPENAI_API_KEY=your_openai_api_key" > .env
echo "GEMINI_API_KEY=your_gemini_api_key" >> .env
echo "OPENROUTER_API_KEY=your_openrouter_api_key" >> .env

# Build and run the Docker container
docker build -t ollama-proxy .
docker run -p 11434:11434 --env-file .env ollama-proxy
```

### Using npx (Node.js)

```bash
# Create a directory for your configuration
mkdir ollama-proxy-config
cd ollama-proxy-config

# Create .env file with your API keys
echo "OPENAI_API_KEY=your_openai_api_key" > .env
echo "GEMINI_API_KEY=your_gemini_api_key" >> .env
echo "OPENROUTER_API_KEY=your_openrouter_api_key" >> .env

# Run the proxy server using npx
npx ollama-api-proxy

# Alternatively, you can specify a specific version
# npx ollama-api-proxy@1.0.0
```

### Using bunx (Bun)

```bash
# Create a directory for your configuration
mkdir ollama-proxy-config
cd ollama-proxy-config

# Create .env file with your API keys
echo "OPENAI_API_KEY=your_openai_api_key" > .env
echo "GEMINI_API_KEY=your_gemini_api_key" >> .env
echo "OPENROUTER_API_KEY=your_openrouter_api_key" >> .env

# Run the proxy server using bunx
bunx ollama-api-proxy

# Alternatively, you can specify a specific version
# bunx ollama-api-proxy@1.0.0
```

## Configuration

The proxy server is configured using environment variables:

- `PORT`: The port on which the server will run (default: 11434)
- `OPENAI_API_KEY`: Your OpenAI API key (required for OpenAI models)
- `GEMINI_API_KEY`: Your Google Gemini API key (required for Gemini models and embedding models)
- `OPENROUTER_API_KEY`: Your OpenRouter API key (required for OpenRouter models)
- `NODE_ENV`: Set to `production` for production use or `development` for development

You can set these variables in a `.env` file in the project root.

## Usage with JetBrains AI Assistant

1. Start the Ollama Proxy server
2. Configure JetBrains AI Assistant to use Ollama
3. Set the Ollama server URL to `http://localhost:11434`
4. Select one of the available models (e.g., `gpt-4o`, `gemini-2.5-flash`, `deepseek-r1`)

## Using Embeddings

The proxy server supports text embeddings through the `/api/embeddings` endpoint, compatible with Ollama's embedding API format.

### Example Usage

```bash
# Single text embedding
curl -X POST http://localhost:11434/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-004",
    "prompt": "Hello, world!"
  }'

# Multiple text embeddings
curl -X POST http://localhost:11434/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-004",
    "input": ["Hello, world!", "How are you?"]
  }'
```

### Supported Input Formats

- **Single prompt**: `{"model": "model-name", "prompt": "text"}`
- **Multiple inputs**: `{"model": "model-name", "input": ["text1", "text2"]}`

The response format matches Ollama's embedding API, returning vectors with 768 dimensions for Google embedding models.

## Development

```bash
# Run in development mode with hot reloading (requires Bun)
bun run dev
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.
