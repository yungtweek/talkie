package vllm

import (
	"bufio"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/go-resty/resty/v2"
	"github.com/yungtweek/talkie/apps/llm-gateway/internal/logger"
	"go.uber.org/zap"
)

// Client is a minimal HTTP client for talking to a vLLM server that exposes
// an OpenAI-compatible /v1/chat/completions endpoint.
type Client struct {
	http *resty.Client
}

// OpenAIChatCompletionChunk represents a single SSE chunk for streamed chat completions.
type OpenAIChatCompletionChunk struct {
	PromptTokenIDs []int `json:"prompt_token_ids,omitempty"`

	ID      string `json:"id"`
	Object  string `json:"object"`
	Created int64  `json:"created"`
	Model   string `json:"model"`

	Choices []struct {
		Index        int    `json:"index"`
		FinishReason string `json:"finish_reason"`
		TokenIDs     []int  `json:"token_ids,omitempty"`

		Delta struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`

	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage,omitempty"`
}

// NewClient creates a new vLLM client with the given base URL.
// Example: baseURL = "http://localhost:8000"
func NewClient(baseURL string, timeoutMs int) *Client {
	httpClient := &http.Client{
		Transport: &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		Timeout: time.Duration(timeoutMs) * time.Millisecond,
	}

	c := resty.NewWithClient(httpClient).
		SetBaseURL(baseURL).
		SetHeader("Content-Type", "application/json")

	return &Client{
		http: c,
	}
}

// Chat sends a ChatCompletionRequest to the vLLM server and returns the parsed response.
func (c *Client) Chat(ctx context.Context, req ChatCompletionRequest) (*ChatCompletionResponse, error) {
	logger.Log.Debug("vLLM Chat request",
		zap.String("endpoint", "/v1/chat/completions"),
	)

	var resp ChatCompletionResponse

	r, err := c.http.R().
		SetContext(ctx).
		SetBody(req).
		SetResult(&resp).
		Post("/v1/chat/completions")
	if err != nil {
		logger.Log.Error("vLLM HTTP request failed",
			zap.Error(err),
		)
		return nil, fmt.Errorf("vLLM HTTP request failed: %w", err)
	}

	logger.Log.Debug("vLLM HTTP response received",
		zap.Int("status_code", r.StatusCode()),
	)

	if status := r.StatusCode(); status < 200 || status >= 300 {
		logger.Log.Error("vLLM non-2xx status",
			zap.Int("status_code", status),
			zap.ByteString("body", r.Body()),
		)
		return nil, fmt.Errorf("vLLM returned non-2xx status %d: %s", status, string(r.Body()))
	}

	return &resp, nil
}

// ChatStream sends a streaming ChatCompletionRequest to the vLLM server.
// It expects the vLLM server to expose an OpenAI-compatible SSE stream from
// /v1/chat/completions when the request has Stream set to true.
func (c *Client) ChatStream(ctx context.Context, req ChatCompletionRequest, onChunk StreamHandler) error {
	logger.Log.Debug("vLLM ChatStream request",
		zap.String("endpoint", "/v1/chat/completions"),
	)

	// Ensure stream flag is enabled on the outgoing request.
	req.Stream = true
	req.ReturnTokenIds = true

	r, err := c.http.R().
		SetContext(ctx).
		SetBody(req).
		SetDoNotParseResponse(true).
		Post("/v1/chat/completions")
	if err != nil {
		logger.Log.Error("vLLM HTTP stream request failed", zap.Error(err))
		return fmt.Errorf("vLLM HTTP stream request failed: %w", err)
	}
	defer func(body io.ReadCloser) {
		err := body.Close()
		if err != nil {
			logger.Log.Warn("failed to close vLLM stream body", zap.Error(err))
		}
	}(r.RawBody())

	if status := r.StatusCode(); status < 200 || status >= 300 {
		logger.Log.Error("vLLM stream non-2xx status",
			zap.Int("status_code", status),
		)
		return fmt.Errorf("vLLM stream returned non-2xx status %d", status)
	}

	scanner := bufio.NewScanner(r.RawBody())

	var computedPromptTokens int
	var computedCompletionTokens int
	var hasComputedPromptTokens bool
	var lastFinishReason string
	var lastIndex int
	var sawDone bool

	for scanner.Scan() {
		rawLine := scanner.Text()
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}

		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		payload := strings.TrimPrefix(line, "data: ")
		logger.Log.Debug("vLLM stream chunk received", zap.String("payload", payload))
		if payload == "[DONE]" {
			sawDone = true

			// Emit a final chunk so downstream (worker) can persist final usage/finish state.
			// vLLM may not include usage on streaming responses; we rely on computed counters here.
			finalFinishReason := lastFinishReason
			if finalFinishReason == "" {
				finalFinishReason = "done"
			}

			finalChunk := ChatCompletionStreamChunk{
				Type:             "output_text.done",
				Text:             "",
				FinishReason:     finalFinishReason,
				Index:            lastIndex,
				PromptTokens:     computedPromptTokens,
				CompletionTokens: computedCompletionTokens,
				TotalTokens:      computedPromptTokens + computedCompletionTokens,
			}

			if err := onChunk(finalChunk); err != nil {
				logger.Log.Warn("ChatStream callback returned error (final chunk)", zap.Error(err))
				logger.Log.Warn("vLLM ChatStream terminating with partial usage",
					zap.Int("prompt_tokens", computedPromptTokens),
					zap.Int("completion_tokens", computedCompletionTokens),
					zap.Int("total_tokens", computedPromptTokens+computedCompletionTokens),
					zap.String("finish_reason", lastFinishReason),
					zap.Int("index", lastIndex),
					zap.Bool("saw_done", sawDone),
				)
				return err
			}

			break
		}

		var raw OpenAIChatCompletionChunk
		if err := json.Unmarshal([]byte(payload), &raw); err != nil {
			logger.Log.Error("failed to unmarshal vLLM stream chunk", zap.Error(err))
			logger.Log.Warn("vLLM ChatStream terminating with partial usage",
				zap.Int("prompt_tokens", computedPromptTokens),
				zap.Int("completion_tokens", computedCompletionTokens),
				zap.Int("total_tokens", computedPromptTokens+computedCompletionTokens),
				zap.String("finish_reason", lastFinishReason),
				zap.Int("index", lastIndex),
				zap.Bool("saw_done", sawDone),
			)
			return fmt.Errorf("failed to unmarshal vLLM stream chunk: %w", err)
		}

		if len(raw.Choices) == 0 {
			continue
		}

		choice := raw.Choices[0]
		lastFinishReason = choice.FinishReason
		lastIndex = choice.Index

		// If vLLM sends token ids, we can compute usage without any tokenizer in the gateway.
		// prompt_token_ids typically appears on the first chunk only.
		if !hasComputedPromptTokens && len(raw.PromptTokenIDs) > 0 {
			computedPromptTokens = len(raw.PromptTokenIDs)
			hasComputedPromptTokens = true
		}

		// token_ids (delta) is per-chunk generation token ids.
		if len(choice.TokenIDs) > 0 {
			computedCompletionTokens += len(choice.TokenIDs)
		}

		// Prefer server-provided usage when present and non-zero; otherwise fall back to computed counts.
		promptTokens := computedPromptTokens
		completionTokens := computedCompletionTokens
		totalTokens := computedPromptTokens + computedCompletionTokens

		if raw.Usage != nil && raw.Usage.TotalTokens > 0 {
			promptTokens = raw.Usage.PromptTokens
			completionTokens = raw.Usage.CompletionTokens
			totalTokens = raw.Usage.TotalTokens
		}

		logger.Log.Debug("vLLM stream chunk content", zap.String("Content", choice.Delta.Content))

		chunk := ChatCompletionStreamChunk{
			Type:             "output_text.delta",
			Text:             choice.Delta.Content,
			FinishReason:     choice.FinishReason,
			Index:            choice.Index,
			PromptTokens:     promptTokens,
			CompletionTokens: completionTokens,
			TotalTokens:      totalTokens,
		}

		if err := onChunk(chunk); err != nil {
			logger.Log.Warn("ChatStream callback returned error", zap.Error(err))
			logger.Log.Warn("vLLM ChatStream terminating with partial usage",
				zap.Int("prompt_tokens", computedPromptTokens),
				zap.Int("completion_tokens", computedCompletionTokens),
				zap.Int("total_tokens", computedPromptTokens+computedCompletionTokens),
				zap.String("finish_reason", lastFinishReason),
				zap.Int("index", lastIndex),
				zap.Bool("saw_done", sawDone),
			)
			return err
		}
	}

	if err := scanner.Err(); err != nil {
		logger.Log.Error("vLLM ChatStream scanner error", zap.Error(err))
		logger.Log.Warn("vLLM ChatStream terminating with partial usage",
			zap.Int("prompt_tokens", computedPromptTokens),
			zap.Int("completion_tokens", computedCompletionTokens),
			zap.Int("total_tokens", computedPromptTokens+computedCompletionTokens),
			zap.String("finish_reason", lastFinishReason),
			zap.Int("index", lastIndex),
			zap.Bool("saw_done", sawDone),
		)
		return fmt.Errorf("vLLM stream scanner error: %w", err)
	}

	logger.Log.Info("vLLM ChatStream finished",
		zap.Int("prompt_tokens", computedPromptTokens),
		zap.Int("completion_tokens", computedCompletionTokens),
		zap.Int("total_tokens", computedPromptTokens+computedCompletionTokens),
		zap.String("finish_reason", lastFinishReason),
		zap.Int("index", lastIndex),
		zap.Bool("saw_done", sawDone),
	)
	logger.Log.Debug("vLLM ChatStream completed")
	return nil
}
