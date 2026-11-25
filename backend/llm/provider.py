import os
from typing import Dict, Any, List, Optional

import litellm
from dotenv import load_dotenv
from config import config
try:
    from haystack import component
except ImportError:
    class _DummyComponent:
        def __call__(self, cls):
            return cls
        @staticmethod
        def output_types(**kwargs):
            def decorator(fn):
                return fn
            return decorator
    component = _DummyComponent()


@component
class LiteLLMGenerator:
    """
    Haystack component that sends LLM requests
    through the local LiteLLM Proxy Server.
    """

    def __init__(self, model_name: Optional[str] = None, **kwargs):
        # Must match the model_name configured in litellm_config.yaml
        self.model = model_name or config.LLM_MODEL

        # LiteLLM Proxy URL
        self.api_base = config.LITELLM_API_BASE

        # Authentication key for LiteLLM Proxy
        self.api_key = config.LITELLM_MASTER_KEY

        self.kwargs = kwargs

    @component.output_types(
        replies=List[str],
        meta=List[Dict[str, Any]]
    )
    def run(self, prompt: str, **kwargs):
        """
        Send the prompt through the local LiteLLM Proxy.
        """
        import time

        messages = [
            {
                "role": "user",
                "content": prompt
            }
        ]

        merged_kwargs = {**self.kwargs, **kwargs}
        timeout_val = merged_kwargs.pop("timeout", 300.0)
        max_tokens_val = merged_kwargs.pop("max_tokens", 3500)
        temperature_val = merged_kwargs.pop("temperature", 0.2)
        start_time = time.time()

        try:
            response = litellm.completion(
                # OpenAI-compatible interface exposed by LiteLLM Proxy
                model=self.model,
                messages=messages,
                api_base=f"{self.api_base.rstrip('/')}/v1" if not self.api_base.rstrip('/').endswith("/v1") else self.api_base.rstrip('/'),
                api_key=self.api_key or config.QWEN_API_KEY or config.LITELLM_MASTER_KEY,
                custom_llm_provider="openai",
                timeout=timeout_val,
                max_tokens=max_tokens_val,
                temperature=temperature_val,
                num_retries=0,
                **merged_kwargs
            )

            content = response.choices[0].message.content

            usage = {}

            if response.usage:
                try:
                    usage = response.usage.model_dump()
                except AttributeError:
                    usage = dict(response.usage)

            meta = {
                "model": response.model,
                "usage": usage,
                "finish_reason": response.choices[0].finish_reason if response.choices else None,
            }

            return {
                "replies": [content],
                "meta": [meta]
            }

        except Exception as e:
            elapsed = time.time() - start_time
            err_str = str(e).lower()
            
            # If the proxy was unreachable or had a connection issue, fail over directly to Qwen GPU server
            if ("connection" in err_str or "connect" in err_str or "refused" in err_str or "proxy" in err_str) and config.QWEN_API_BASE:
                try:
                    print(f"Proxy connection failed ({e}). Failing over directly to Qwen GPU server...")
                    direct_response = litellm.completion(
                        model="openai/current-model",
                        messages=messages,
                        api_base=config.QWEN_API_BASE,
                        api_key=config.QWEN_API_KEY,
                        custom_llm_provider="openai",
                        timeout=timeout_val,
                        max_tokens=max_tokens_val,
                        temperature=temperature_val,
                        num_retries=1,
                    )
                    content = direct_response.choices[0].message.content
                    meta = {
                        "model": direct_response.model,
                        "usage": dict(direct_response.usage) if direct_response.usage else {},
                        "finish_reason": direct_response.choices[0].finish_reason if direct_response.choices else None,
                    }
                    return {"replies": [content], "meta": [meta]}
                except Exception as direct_err:
                    print(f"Direct Qwen failover also failed: {direct_err}")

            is_timeout = isinstance(e, litellm.exceptions.Timeout) or "timeout" in err_str
            if is_timeout:
                print(f"LLM generation timeout error: model={self.model}, timeout_duration={timeout_val}s, elapsed={elapsed:.2f}s, error={e}")
                raise TimeoutError(f"LLM request timed out after {timeout_val:.0f}s. Please retry.") from e
            else:
                print(f"LLM generation error: model={self.model}, elapsed={elapsed:.2f}s, error={e}")
                raise RuntimeError(f"LLM Request Failed: {e}") from e


def get_llm_generator(**kwargs) -> LiteLLMGenerator:
    """
    Factory function to create the configured LLM Generator.
    """
    return LiteLLMGenerator(**kwargs)


class DeepSeekClient:
    """
    Dedicated client for the DeepSeek API (https://api.deepseek.com).
    Supports OpenAI-compatible chat completions, reasoning_content,
    native web tools (deepseek_web_search / deepseek_read_url), and tool calling.
    Isolated from LiteLLMGenerator so Qwen workflows remain untouched.
    """

    def __init__(
        self,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        api_base: Optional[str] = None,
        timeout: float = 180.0,
    ):
        self.model = model or config.DEEPSEEK_MODEL
        self.api_key = api_key or config.DEEPSEEK_API_KEY
        self.api_base = (api_base or config.DEEPSEEK_API_BASE).rstrip("/")
        self.timeout = timeout

    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Any] = None,
        temperature: float = 0.2,
        max_tokens: int = 8192,
        thinking: bool = True,
        reasoning_effort: str = "high",
        response_format: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Execute a chat completion request against DeepSeek API.
        Returns normalized dict with 'content', 'reasoning_content', 'tool_calls', 'usage', and 'raw'.
        """
        import requests

        if not self.is_configured():
            raise RuntimeError("DEEPSEEK_API_KEY is not configured in environment.")

        url = f"{self.api_base}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        if thinking:
            payload["thinking"] = {"type": "enabled"}
            payload["reasoning_effort"] = reasoning_effort
        if tools:
            payload["tools"] = tools
            if tool_choice is not None:
                payload["tool_choice"] = tool_choice
        if response_format:
            payload["response_format"] = response_format

        resp = requests.post(url, headers=headers, json=payload, timeout=self.timeout)
        if resp.status_code != 200:
            raise RuntimeError(f"DeepSeek API error ({resp.status_code}): {resp.text[:500]}")

        data = resp.json()
        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        return {
            "content": msg.get("content") or "",
            "reasoning_content": msg.get("reasoning_content") or "",
            "tool_calls": msg.get("tool_calls") or [],
            "usage": data.get("usage") or {},
            "model": data.get("model") or self.model,
            "raw": data,
        }


def get_deepseek_client(**kwargs) -> DeepSeekClient:
    """Factory function to create a configured DeepSeekClient."""
    return DeepSeekClient(**kwargs)