import os
from typing import Dict, Any, List, Optional

import litellm
from dotenv import load_dotenv
from config import config
from haystack import component


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
    def run(self, prompt: str):
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

        timeout_val = self.kwargs.pop("timeout", 300.0)
        max_tokens_val = self.kwargs.pop("max_tokens", 8192)
        temperature_val = self.kwargs.pop("temperature", 0.2)
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
                **self.kwargs
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